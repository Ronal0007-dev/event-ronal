'use strict';
const { Guest, Event } = require('../models');
const { formatShortDateTime, formatDateTime } = require('../utils/format');

const TOKEN_RE = /^[0-9a-fA-F-]{36}$/;

/** Accepts either a bare token or the full verification URL that is encoded in the QR. */
function extractToken(raw) {
  const value = String(raw || '').trim();
  const fromUrl = value.match(/\/verify-checkin\/([0-9a-fA-F-]{36})/);
  const token = fromUrl ? fromUrl[1] : value;
  return TOKEN_RE.test(token) ? token.toLowerCase() : null;
}

function guestPayload(guest) {
  return {
    guestName: guest.guestName,
    cardType: guest.cardType,
    admits: guest.cardType === 'Double' ? 2 : 1,
    phoneTail: guest.phoneNumber.slice(-3),
  };
}

/**
 * POST /api/checkin/verify  { token, eventId }   (organiser or admin session required)
 * Marks the guest as ATTENDED atomically: only one concurrent scan can ever win.
 */
exports.verify = async (req, res) => {
  const eventId = Number(req.body.eventId);
  const token = extractToken(req.body.token);

  const event = Number.isInteger(eventId)
    ? await Event.findOne({ where: req.session?.adminAuthenticated ? { id: eventId } : { id: eventId, userId: req.session.userId } })
    : null;
  if (!event) return res.status(404).json({ ok: false, result: 'ERROR', message: 'Event not found.' });

  if (!token) return res.json({ ok: true, result: 'INVALID', message: 'Invalid ticket — this is not a card from this system.' });

  const guest = await Guest.findOne({ where: { qrToken: token } });
  if (!guest) return res.json({ ok: true, result: 'INVALID', message: 'Invalid ticket — no matching guest.' });

  if (guest.eventId !== event.id) {
    return res.json({ ok: true, result: 'WRONG_EVENT', message: 'This card belongs to a different event.' });
  }

  const now = new Date();
  const [updated] = await Guest.update(
    { attendanceStatus: 'ATTENDED', checkedInAt: now },
    { where: { id: guest.id, attendanceStatus: 'INVITED' } }
  );

  if (updated === 1) {
    return res.json({
      ok: true,
      result: 'VALID',
      message: 'Welcome! Entry approved.',
      guest: guestPayload(guest),
      checkedInAt: now,
      checkedInAtText: formatShortDateTime(now),
    });
  }

  await guest.reload();
  return res.json({
    ok: true,
    result: 'ALREADY_SCANNED',
    message: 'Already checked in — do not admit again.',
    guest: guestPayload(guest),
    checkedInAt: guest.checkedInAt,
    checkedInAtText: formatShortDateTime(guest.checkedInAt),
  });
};

/** Undo a mistaken check-in (e.g. wrong person scanned). */
exports.undo = async (req, res) => {
  const eventId = Number(req.body.eventId);
  const token = extractToken(req.body.token);
  const event = Number.isInteger(eventId)
    ? await Event.findOne({ where: req.session?.adminAuthenticated ? { id: eventId } : { id: eventId, userId: req.session.userId } })
    : null;
  if (!event || !token) return res.status(404).json({ ok: false, message: 'Not found.' });
  const [updated] = await Guest.update(
    { attendanceStatus: 'INVITED', checkedInAt: null },
    { where: { qrToken: token, eventId: event.id } }
  );
  res.json({ ok: updated === 1 });
};

/**
 * GET /verify-checkin/:token — the URL inside every QR code.
 * Public and read-only: opening it in an ordinary phone camera never marks attendance.
 * Check-in happens only through the authenticated scanner.
 */
exports.publicVerifyPage = async (req, res) => {
  const token = extractToken(req.params.token);
  const guest = token ? await Guest.findOne({ where: { qrToken: token }, include: [{ model: Event, as: 'event' }] }) : null;
  if (!guest) {
    return res.status(404).render('verify', { title: 'Invalid ticket', layoutMode: 'bare', valid: false });
  }
  res.render('verify', {
    title: 'Invitation',
    layoutMode: 'bare',
    valid: true,
    guestName: guest.guestName,
    cardType: guest.cardType,
    eventName: guest.event.eventName,
    when: formatDateTime(guest.event.eventDate),
    venue: guest.event.venue,
    isLoggedIn: Boolean(req.session?.userId),
    scannerLink: req.session?.userId && guest.event.userId === req.session.userId ? `/scanner/${guest.event.id}` : null,
  });
};

/** GET /c/:token — shareable page linked from the SMS: shows and lets the guest download their card. */
exports.publicCardPage = async (req, res) => {
  const token = extractToken(req.params.token);
  const guest = token ? await Guest.findOne({ where: { qrToken: token }, include: [{ model: Event, as: 'event' }] }) : null;
  if (!guest) return res.status(404).render('error', { title: 'Not found', layoutMode: 'bare', message: 'This invitation link is not valid.' });
  res.render('card', {
    title: `Invitation · ${guest.event.eventName}`,
    layoutMode: 'bare',
    guestName: guest.guestName,
    eventName: guest.event.eventName,
    when: formatDateTime(guest.event.eventDate),
    venue: guest.event.venue,
    mapsLink: guest.event.mapsLink,
    cardUrl: guest.generatedCardUrl,
  });
};
