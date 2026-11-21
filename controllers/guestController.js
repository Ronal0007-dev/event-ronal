'use strict';
const crypto = require('crypto');
const { Op } = require('sequelize');
const { parse: parseCsv } = require('csv-parse/sync');
const ExcelJS = require('exceljs');
const { sequelize, User, Guest, DeliveryLog } = require('../models');
const { normalizeTzPhone } = require('../utils/phone');
const { formatShortDateTime } = require('../utils/format');
const { generateCard, deleteCardFile, cardPageUrl } = require('../services/cardGeneratorService');
const notifier = require('../services/notificationService');

const MAX_BULK_ROWS = 2000;
const CARD_TYPES = ['Single', 'Double'];

/* in-memory guards so a long job is never started twice for the same event (single-process deployment) */
const runningCardJobs = new Set();
const runningSendJobs = new Set();

const newToken = () => crypto.randomUUID();

function serializeGuest(g) {
  return {
    id: g.id,
    guestName: g.guestName,
    phoneNumber: g.phoneNumber,
    cardType: g.cardType,
    cardUrl: g.generatedCardUrl,
    publicLink: cardPageUrl(g.qrToken),
    smsStatus: g.smsStatus,
    whatsappStatus: g.whatsappStatus,
    attendanceStatus: g.attendanceStatus,
    checkedInAt: g.checkedInAt,
  };
}

function normalizeCardType(value) {
  const v = String(value || 'Single').trim().toLowerCase();
  if (['double', 'dbl', '2', 'two', 'couple'].includes(v)) return 'Double';
  if (['single', 'sgl', '1', 'one', ''].includes(v)) return 'Single';
  return null;
}

async function mapLimit(items, limit, worker) {
  const queue = items.slice();
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}

async function ensureCard(guest, event) {
  if (guest.generatedCardUrl) return guest.generatedCardUrl;
  const url = await generateCard({ guest, event, template: event.template });
  await guest.update({ generatedCardUrl: url });
  return url;
}

/* ------------------------------ list / add / delete ------------------------------ */

exports.list = async (req, res) => {
  const guests = await Guest.findAll({ where: { eventId: req.event.id }, order: [['guestName', 'ASC']] });
  const busy = { cards: runningCardJobs.has(req.event.id), sending: runningSendJobs.has(req.event.id) };
  res.json({ ok: true, guests: guests.map(serializeGuest), busy });
};

exports.add = async (req, res) => {
  const guestName = String(req.body.guestName || '').trim().replace(/\s+/g, ' ');
  const phoneNumber = normalizeTzPhone(req.body.phoneNumber);
  const cardType = normalizeCardType(req.body.cardType);

  if (guestName.length < 2 || guestName.length > 120) return res.status(422).json({ ok: false, message: 'Guest name must be 2–120 characters.' });
  if (!phoneNumber) return res.status(422).json({ ok: false, message: 'Enter a valid Tanzanian mobile number, e.g. 0712 345 678 or +255712345678.' });
  if (!cardType) return res.status(422).json({ ok: false, message: 'Card type must be Single or Double.' });

  const guest = await Guest.create({ eventId: req.event.id, guestName, phoneNumber, cardType, qrToken: newToken() });
  try {
    await ensureCard(guest, req.event);
  } catch (err) {
    console.error('[cards] generation failed for new guest:', err.message);
  }
  res.status(201).json({ ok: true, guest: serializeGuest(guest) });
};

exports.remove = async (req, res) => {
  const guest = await Guest.findOne({ where: { id: Number(req.params.guestId), eventId: req.event.id } });
  if (!guest) return res.status(404).json({ ok: false, message: 'Guest not found.' });
  await deleteCardFile(guest.generatedCardUrl);
  await guest.destroy();
  res.json({ ok: true });
};

/* ------------------------------ bulk upload ------------------------------ */

const HEADER_ALIASES = {
  name: 'guestName', guestname: 'guestName', fullname: 'guestName', jina: 'guestName',
  phone: 'phoneNumber', phonenumber: 'phoneNumber', mobile: 'phoneNumber', number: 'phoneNumber', simu: 'phoneNumber', tel: 'phoneNumber',
  cardtype: 'cardType', card: 'cardType', type: 'cardType',
};

function canonicalHeader(h) {
  return HEADER_ALIASES[String(h || '').toLowerCase().replace(/[^a-z]/g, '')] || null;
}

async function readRows(file) {
  if (/\.csv$/i.test(file.originalname)) {
    const text = file.buffer.toString('utf8').replace(/^﻿/, '');
    const delimiter = text.split('\n')[0].includes(';') && !text.split('\n')[0].includes(',') ? ';' : ',';
    const records = parseCsv(text, { columns: (hdr) => hdr.map(canonicalHeader), skip_empty_lines: true, trim: true, relax_column_count: true, delimiter });
    return records;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file.buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, i) => (headers[i] = canonicalHeader(cell.text)));
  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rec = {};
    row.eachCell({ includeEmpty: true }, (cell, i) => {
      if (headers[i]) rec[headers[i]] = cell.text != null ? String(cell.text).trim() : '';
    });
    if (Object.values(rec).some(Boolean)) rows.push(rec);
  });
  return rows;
}

exports.bulkUpload = async (req, res) => {
  if (!req.file) return res.status(422).json({ ok: false, message: 'Please choose a .csv or .xlsx file.' });

  let rows;
  try {
    rows = await readRows(req.file);
  } catch (err) {
    return res.status(422).json({ ok: false, message: 'Could not read that file. Check it is a valid CSV or XLSX.' });
  }
  if (!rows.length) return res.status(422).json({ ok: false, message: 'The file has no guest rows. Expected columns: Name, Phone, CardType.' });
  if (rows.length > MAX_BULK_ROWS) return res.status(422).json({ ok: false, message: `Maximum ${MAX_BULK_ROWS} guests per upload.` });

  const valid = [];
  const errors = [];
  const seen = new Set();
  rows.forEach((row, idx) => {
    const line = idx + 2; // +1 header, +1 for 1-based
    const guestName = String(row.guestName || '').trim().replace(/\s+/g, ' ');
    const phoneNumber = normalizeTzPhone(row.phoneNumber);
    const cardType = normalizeCardType(row.cardType);
    if (guestName.length < 2) return errors.push({ line, reason: 'Missing guest name' });
    if (!phoneNumber) return errors.push({ line, reason: `Invalid phone number "${row.phoneNumber || ''}"` });
    if (!cardType) return errors.push({ line, reason: `Card type must be Single or Double (got "${row.cardType}")` });
    const key = `${guestName.toLowerCase()}|${phoneNumber}`;
    if (seen.has(key)) return errors.push({ line, reason: 'Duplicate of an earlier row' });
    seen.add(key);
    valid.push({ eventId: req.event.id, guestName: guestName.slice(0, 120), phoneNumber, cardType, qrToken: newToken() });
  });

  if (valid.length) await Guest.bulkCreate(valid);

  // Render the cards in the background; the UI polls /guests until every card exists.
  if (valid.length) startCardJob(req.event, false);

  res.status(201).json({ ok: true, imported: valid.length, skipped: errors.length, errors: errors.slice(0, 50) });
};

/* ------------------------------ card generation ------------------------------ */

function startCardJob(event, force) {
  if (runningCardJobs.has(event.id)) return false;
  runningCardJobs.add(event.id);
  (async () => {
    try {
      const where = { eventId: event.id };
      if (!force) where.generatedCardUrl = null;
      const guests = await Guest.findAll({ where });
      await mapLimit(guests, 4, async (guest) => {
        try {
          if (force) await deleteCardFile(guest.generatedCardUrl);
          const url = await generateCard({ guest, event, template: event.template });
          await guest.update({ generatedCardUrl: url });
        } catch (err) {
          console.error(`[cards] guest ${guest.id} failed:`, err.message);
        }
      });
    } finally {
      runningCardJobs.delete(event.id);
    }
  })();
  return true;
}

exports.generateCards = async (req, res) => {
  const force = req.body.force === true || req.body.force === 'true';
  const started = startCardJob(req.event, force);
  res.status(202).json({ ok: true, started, message: started ? 'Card generation started.' : 'Card generation is already running.' });
};

/* ------------------------------ sending invitations ------------------------------ */

async function reserveCredit(userId, channel) {
  const column = channel === 'SMS' ? 'smsCredits' : 'whatsappCredits';
  const [affected] = await User.update({ [column]: sequelize.literal(`${column} - 1`) }, { where: { id: userId, [column]: { [Op.gte]: 1 } } });
  return affected === 1;
}

async function refundCredit(userId, channel) {
  const column = channel === 'SMS' ? 'smsCredits' : 'whatsappCredits';
  await User.update({ [column]: sequelize.literal(`${column} + 1`) }, { where: { id: userId } });
}

async function deliver(channel, guest, event, userId) {
  const statusField = channel === 'SMS' ? 'smsStatus' : 'whatsappStatus';
  const log = await DeliveryLog.create({
    guestId: guest.id,
    eventId: event.id,
    channel,
    provider: notifier.providerName(channel),
    status: 'PENDING',
  });

  if (!(await reserveCredit(userId, channel))) {
    await log.update({ status: 'FAILED', providerResponse: JSON.stringify({ error: 'Insufficient credits' }) });
    await guest.update({ [statusField]: 'FAILED' });
    return false;
  }

  let result;
  try {
    if (channel === 'WHATSAPP') await ensureCard(guest, event);
    result = await notifier.send(channel, guest, event);
  } catch (err) {
    result = { ok: false, response: { error: err.message } };
  }

  if (!result.ok) await refundCredit(userId, channel);
  await log.update({
    status: result.ok ? 'SENT' : 'FAILED',
    providerResponse: JSON.stringify(result.response ?? null).slice(0, 5000),
    sentAt: result.ok ? new Date() : null,
  });
  await guest.update({ [statusField]: result.ok ? 'SENT' : 'FAILED' });
  return result.ok;
}

exports.sendInvitations = async (req, res) => {
  const event = req.event;
  const channelChoice = String(req.body.channel || '').toUpperCase();
  const channels = channelChoice === 'BOTH' ? ['SMS', 'WHATSAPP'] : ['SMS', 'WHATSAPP'].includes(channelChoice) ? [channelChoice] : null;
  if (!channels) return res.status(422).json({ ok: false, message: 'Choose SMS, WhatsApp or Both.' });
  if (runningSendJobs.has(event.id)) return res.status(409).json({ ok: false, message: 'Invitations are already being sent for this event.' });

  const resendAll = req.body.scope === 'all';
  const guestIds = Array.isArray(req.body.guestIds) ? req.body.guestIds.map(Number).filter(Number.isInteger) : null;

  const where = { eventId: event.id };
  if (guestIds && guestIds.length) where.id = { [Op.in]: guestIds };
  const guests = await Guest.findAll({ where, order: [['id', 'ASC']] });

  const jobs = [];
  for (const guest of guests) {
    for (const channel of channels) {
      const current = channel === 'SMS' ? guest.smsStatus : guest.whatsappStatus;
      if (resendAll || current !== 'SENT') jobs.push({ guest, channel });
    }
  }
  if (!jobs.length) return res.json({ ok: true, queued: 0, message: 'Nothing to send — everyone has already received this invitation.' });

  // Pre-flight credit check so the organiser gets a clear message instead of a wall of FAILED rows
  const user = await User.findByPk(req.session.userId);
  const needSms = jobs.filter((j) => j.channel === 'SMS').length;
  const needWa = jobs.filter((j) => j.channel === 'WHATSAPP').length;
  if (needSms > user.smsCredits) return res.status(402).json({ ok: false, message: `Not enough SMS credits: need ${needSms}, you have ${user.smsCredits}.` });
  if (needWa > user.whatsappCredits) return res.status(402).json({ ok: false, message: `Not enough WhatsApp credits: need ${needWa}, you have ${user.whatsappCredits}.` });

  // Mark as PENDING immediately so the UI reflects the queue
  await Promise.all(jobs.map(({ guest, channel }) => guest.update({ [channel === 'SMS' ? 'smsStatus' : 'whatsappStatus']: 'PENDING' })));

  runningSendJobs.add(event.id);
  (async () => {
    try {
      // Per guest, SMS and WhatsApp go out simultaneously; guests are processed with limited concurrency.
      const byGuest = new Map();
      jobs.forEach((j) => byGuest.set(j.guest.id, [...(byGuest.get(j.guest.id) || []), j]));
      await mapLimit([...byGuest.values()], 3, (guestJobs) =>
        Promise.all(guestJobs.map((j) => deliver(j.channel, j.guest, event, req.session.userId).catch((e) => console.error('[send]', e.message))))
      );
    } finally {
      runningSendJobs.delete(event.id);
    }
  })();

  res.status(202).json({ ok: true, queued: jobs.length, message: `Sending ${jobs.length} message${jobs.length === 1 ? '' : 's'}…` });
};

async function deliverThankYou(channel, guest, event, userId, message) {
  const log = await DeliveryLog.create({
    guestId: guest.id,
    eventId: event.id,
    channel,
    provider: notifier.providerName(channel),
    status: 'PENDING',
    providerResponse: JSON.stringify({ purpose: 'THANK_YOU' }),
  });

  if (!(await reserveCredit(userId, channel))) {
    await log.update({ status: 'FAILED', providerResponse: JSON.stringify({ purpose: 'THANK_YOU', error: 'Insufficient credits' }) });
    return false;
  }

  const personalizedMessage = message
    .replace(/\{\{name\}\}/gi, guest.guestName)
    .replace(/\{\{event\}\}/gi, event.eventName);
  const result = await notifier.sendText(channel, guest.phoneNumber, personalizedMessage);
  if (!result.ok) await refundCredit(userId, channel);
  await log.update({
    status: result.ok ? 'SENT' : 'FAILED',
    providerResponse: JSON.stringify({ purpose: 'THANK_YOU', result: result.response ?? null }).slice(0, 5000),
    sentAt: result.ok ? new Date() : null,
  });
  return result.ok;
}

exports.sendThankYou = async (req, res) => {
  const event = req.event;
  const channelChoice = String(req.body.channel || '').toUpperCase();
  const channels = channelChoice === 'BOTH' ? ['SMS', 'WHATSAPP'] : ['SMS', 'WHATSAPP'].includes(channelChoice) ? [channelChoice] : null;
  const message = String(req.body.message || '').trim();
  if (!channels) return res.status(422).json({ ok: false, message: 'Choose SMS, WhatsApp or Both.' });
  if (!message || message.length > 1000) {
    return res.status(422).json({ ok: false, message: 'Enter a thank-you message between 1 and 1000 characters.' });
  }
  if (runningSendJobs.has(event.id)) return res.status(409).json({ ok: false, message: 'Messages are already being sent for this event.' });

  const guests = await Guest.findAll({
    where: { eventId: event.id, attendanceStatus: 'ATTENDED' },
    order: [['id', 'ASC']],
  });
  if (!guests.length) return res.status(409).json({ ok: false, message: 'No guests have checked in to this event yet.' });

  const userId = req.session.userId;
  const user = await User.findByPk(userId);
  if (!user) return res.status(401).json({ ok: false, message: 'Please sign in again.' });
  const needSms = channels.includes('SMS') ? guests.length : 0;
  const needWa = channels.includes('WHATSAPP') ? guests.length : 0;
  if (needSms > user.smsCredits) return res.status(402).json({ ok: false, message: `Not enough SMS credits: need ${needSms}, you have ${user.smsCredits}.` });
  if (needWa > user.whatsappCredits) return res.status(402).json({ ok: false, message: `Not enough WhatsApp credits: need ${needWa}, you have ${user.whatsappCredits}.` });

  runningSendJobs.add(event.id);
  (async () => {
    try {
      await mapLimit(guests, 3, (guest) =>
        Promise.all(
          channels.map((channel) =>
            deliverThankYou(channel, guest, event, userId, message).catch((err) => {
              console.error(`[thank-you] guest ${guest.id} on ${channel} failed:`, err.message);
            })
          )
        )
      );
    } finally {
      runningSendJobs.delete(event.id);
    }
  })();

  const queued = guests.length * channels.length;
  return res.status(202).json({
    ok: true,
    queued,
    message: `Sending your thank-you message to ${guests.length} checked-in guest${guests.length === 1 ? '' : 's'}…`,
  });
};

exports.credits = async (req, res) => {
  const user = await User.findByPk(req.session.userId, { attributes: ['smsCredits', 'whatsappCredits'] });
  res.json({ ok: true, smsCredits: user.smsCredits, whatsappCredits: user.whatsappCredits });
};

exports.deliveryLogs = async (req, res) => {
  const logs = await DeliveryLog.findAll({
    where: { eventId: req.event.id, ...(req.query.guestId ? { guestId: Number(req.query.guestId) } : {}) },
    order: [['id', 'DESC']],
    limit: 100,
  });
  res.json({ ok: true, logs });
};

/* ------------------------------ export ------------------------------ */

const csvCell = (v, { trusted = false } = {}) => {
  let s = String(v ?? '');
  if (!trusted && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection in user-supplied text
  return `"${s.replace(/"/g, '""')}"`;
};

exports.exportCsv = async (req, res) => {
  const guests = await Guest.findAll({ where: { eventId: req.event.id }, order: [['guestName', 'ASC']] });
  const header = ['Name', 'Phone', 'CardType', 'SMS', 'WhatsApp', 'Attendance', 'CheckedInAt'];
  const lines = guests.map((g) =>
    [csvCell(g.guestName), csvCell(`+${g.phoneNumber}`, { trusted: true }), ...[g.cardType, g.smsStatus, g.whatsappStatus, g.attendanceStatus, formatShortDateTime(g.checkedInAt)].map((v) => csvCell(v))].join(',')
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="guests-event-${req.event.id}.csv"`);
  res.send(`﻿${[header.join(','), ...lines].join('\r\n')}`);
};

exports.CARD_TYPES = CARD_TYPES;
exports.startCardJob = startCardJob;
