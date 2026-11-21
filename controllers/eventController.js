'use strict';
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { Op, fn, col } = require('sequelize');
const { User, CardTemplate, Event, Guest } = require('../models');
const { parseLocalEat, formatDateTime } = require('../utils/format');
const { appUrl } = require('../services/cardGeneratorService');
const { deleteEvent: removeEvent } = require('../services/eventDeletionService');
const { BY_KEY, CATEGORY_COLORS, SWATCHES, HEX_RE, renderDesign } = require('../services/templateDesigns');
const { startCardJob } = require('./guestController');

const CATEGORY_META = {
  birthday: { label: 'Birthday', sw: 'Siku ya kuzaliwa', blurb: 'Parties, milestones, first birthdays' },
  wedding: { label: 'Wedding', sw: 'Harusi', blurb: 'Ceremony, reception, send-off dinners' },
  anniversary: { label: 'Anniversary', sw: 'Kumbukizi ya ndoa', blurb: 'Silver, ruby, golden — every year counts' },
  engagement: { label: 'Engagement', sw: 'Uchumba', blurb: 'Introductions and engagement parties' },
  'baby-shower': { label: 'Baby shower', sw: 'Baby shower', blurb: 'Welcoming a little one' },
  'bridal-shower': { label: 'Bridal shower', sw: 'Kitchen party', blurb: 'Kitchen parties and bridal gatherings' },
  'retirement-farewell': { label: 'Retirement & farewell', sw: 'Kustaafu & kuaga', blurb: 'Thanking someone for the years' },
  graduation: { label: 'Graduation party', sw: 'Mahafali', blurb: 'Primary school to university' },
  'send-off': { label: 'Send-off', sw: 'Send-off', blurb: 'New journeys, new homes' },
  confirmation: { label: 'Confirmation', sw: 'Kipaimara', blurb: 'Church and faith celebrations' },
};
for (const key of Object.keys(CATEGORY_META)) CATEGORY_META[key].color = CATEGORY_COLORS[key];


exports.dashboard = async (req, res) => {
  const [user, events] = await Promise.all([
    User.findByPk(req.session.userId),
    Event.findAll({
      where: { userId: req.session.userId },
      order: [['eventDate', 'DESC']],
      limit: 50,
    }),
  ]);

  const ids = events.map((e) => e.id);
  const groupCount = (extraWhere = {}) =>
    ids.length
      ? Guest.findAll({
          attributes: ['eventId', [fn('COUNT', col('id')), 'n']],
          where: { eventId: { [Op.in]: ids }, ...extraWhere },
          group: ['eventId'],
          raw: true,
        })
      : [];
  const [totals, attendedRows] = await Promise.all([groupCount(), groupCount({ attendanceStatus: 'ATTENDED' })]);
  const countMap = {};
  totals.forEach((r) => (countMap[r.eventId] = { total: Number(r.n), attended: 0 }));
  attendedRows.forEach((r) => {
    if (countMap[r.eventId]) countMap[r.eventId].attended = Number(r.n);
  });

  res.render('dashboard', {
    title: 'Dashboard',
    user,
    categories: Object.entries(CATEGORY_META).map(([key, meta], i) => ({ key, index: String(i + 1).padStart(2, '0'), ...meta })),
    swatches: SWATCHES,
    events: events.map((e) => ({
      id: e.id,
      eventName: e.eventName,
      category: e.category,
      meta: CATEGORY_META[e.category],
      when: formatDateTime(e.eventDate),
      venue: e.venue,
      total: countMap[e.id]?.total || 0,
      attended: countMap[e.id]?.attended || 0,
    })),
  });
};

exports.listTemplates = async (req, res) => {
  const where = {};
  if (req.query.category) {
    if (!CardTemplate.CATEGORIES.includes(req.query.category)) {
      return res.status(400).json({ ok: false, message: 'Unknown category.' });
    }
    where.category = req.query.category;
  }
  const templates = await CardTemplate.findAll({
    where,
    order: [['id', 'ASC']],
    attributes: ['id', 'name', 'category', 'designKey', 'backgroundImageUrl'],
  });
  res.json({
    ok: true,
    defaultColor: CATEGORY_COLORS[req.query.category] || null,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      previewUrl: t.backgroundImageUrl,
      dynamic: Boolean(t.designKey), // dynamic previews accept ?color=#rrggbb
    })),
  });
};

exports.createEvent = async (req, res) => {
  const body = req.body || {};
  const uploaded = req.file ? `/uploads/${req.file.filename}` : null;
  const fail = async (status, message) => {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    return res.status(status).json({ ok: false, message });
  };

  const category = String(body.category || '');
  const eventName = String(body.eventName || '').trim();
  const venue = String(body.venue || '').trim();
  const mapsLink = String(body.mapsLink || '').trim();
  const eventDate = parseLocalEat(String(body.eventDate || ''));
  const accentColor = String(body.accentColor || '').trim() || CATEGORY_COLORS[category] || '#e4572e';

  if (!CardTemplate.CATEGORIES.includes(category)) return fail(422, 'Please choose a valid event category.');
  if (eventName.length < 3) return fail(422, 'Event name must be at least 3 characters.');
  if (!eventDate) return fail(422, 'Please provide a valid event date and time.');
  if (!HEX_RE.test(accentColor)) return fail(422, 'Pick a valid card colour.');
  if (venue.length < 2) return fail(422, 'Please provide the venue.');
  if (mapsLink && !/^https?:\/\/\S+$/i.test(mapsLink)) return fail(422, 'The map link must start with http:// or https://');

  // A template is required unless a custom background was uploaded; fall back to the category's first template.
  let template = null;
  if (body.templateId) {
    template = await CardTemplate.findOne({ where: { id: Number(body.templateId), category } });
    if (!template && !uploaded) return fail(422, 'The selected template does not match this category.');
  }
  if (!template) template = await CardTemplate.findOne({ where: { category }, order: [['id', 'ASC']] });
  if (!template && !uploaded) return fail(422, 'No templates are available for this category yet.');

  if (uploaded) {
    // Verify the file really is an image and strip metadata/rotation issues.
    try {
      await sharp(req.file.path).metadata();
    } catch (_) {
      return fail(422, 'That file is not a valid image.');
    }
  }

  const event = await Event.create({
    userId: req.session.userId,
    templateId: template ? template.id : null,
    category,
    eventName,
    eventDate,
    venue,
    mapsLink: mapsLink || null,
    accentColor: accentColor.toLowerCase(),
    customBackgroundUrl: uploaded,
    status: 'ACTIVE',
  });

  res.status(201).json({ ok: true, eventId: event.id, redirect: `/events/${event.id}` });
};

exports.showEvent = async (req, res) => {
  const event = req.event;
  const user = await User.findByPk(req.session.userId);
  res.render('event-details', {
    title: event.eventName,
    user,
    event: {
      id: event.id,
      eventName: event.eventName,
      category: event.category,
      meta: CATEGORY_META[event.category],
      when: formatDateTime(event.eventDate),
      venue: event.venue,
      mapsLink: event.mapsLink,
      accentColor: event.accentColor,
      usesCustomBackground: Boolean(event.customBackgroundUrl),
      background: event.customBackgroundUrl || event.template?.backgroundImageUrl || null,
    },
    swatches: SWATCHES,
    smsProvider: (process.env.SMS_PROVIDER || 'log').toLowerCase(),
    waProvider: (process.env.WHATSAPP_PROVIDER || 'log').toLowerCase(),
    baseUrl: appUrl(),
  });
};

exports.showScanner = (req, res) => {
  const event = req.event;
  res.render('scanner', {
    title: `Scanner · ${event.eventName}`,
    layoutMode: 'bare',
    event: { id: event.id, eventName: event.eventName, when: formatDateTime(event.eventDate), venue: event.venue },
  });
};

exports.stats = async (req, res) => {
  const eventId = req.event.id;
  const [total, attended, withCards, smsSent, waSent, smsFailed, waFailed] = await Promise.all([
    Guest.count({ where: { eventId } }),
    Guest.count({ where: { eventId, attendanceStatus: 'ATTENDED' } }),
    Guest.count({ where: { eventId, generatedCardUrl: { [Op.ne]: null } } }),
    Guest.count({ where: { eventId, smsStatus: 'SENT' } }),
    Guest.count({ where: { eventId, whatsappStatus: 'SENT' } }),
    Guest.count({ where: { eventId, smsStatus: 'FAILED' } }),
    Guest.count({ where: { eventId, whatsappStatus: 'FAILED' } }),
  ]);
  // Expected headcount: Double cards admit two people
  const [doubles, attendedDoubles] = await Promise.all([
    Guest.count({ where: { eventId, cardType: 'Double' } }),
    Guest.count({ where: { eventId, cardType: 'Double', attendanceStatus: 'ATTENDED' } }),
  ]);
  res.json({
    ok: true,
    stats: {
      total,
      attended,
      remaining: total - attended,
      withCards,
      smsSent,
      waSent,
      smsFailed,
      waFailed,
      expectedPeople: total + doubles,
      arrivedPeople: attended + attendedDoubles,
    },
  });
};

exports.deleteEvent = async (req, res) => {
  await removeEvent(req.event);
  res.json({ ok: true, redirect: '/dashboard' });
};

/** PATCH /api/events/:id/appearance — change the card colour and re-render every card. */
exports.updateAppearance = async (req, res) => {
  const accentColor = String(req.body.accentColor || '').trim().toLowerCase();
  if (!HEX_RE.test(accentColor)) return res.status(422).json({ ok: false, message: 'Pick a valid card colour.' });
  if (req.event.customBackgroundUrl) {
    return res.status(422).json({ ok: false, message: 'This event uses your own background image, so the colour setting does not apply.' });
  }
  await req.event.update({ accentColor });
  startCardJob(req.event, true);
  res.json({ ok: true, message: 'Colour updated. Re-creating all cards…' });
};

/** GET /template-preview/:key?color=#rrggbb — public SVG thumbnail of a design in a given colour. */
exports.previewDesign = (req, res) => {
  const design = BY_KEY[req.params.key];
  if (!design) return res.status(404).type('text/plain').send('Unknown design');
  const color = HEX_RE.test(req.query.color || '') ? req.query.color : CATEGORY_COLORS[design.category];
  const { svg } = renderDesign(design.key, color, { preview: true });
  res.set({ 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
  res.send(svg);
};

/** GET / — public landing page. */
exports.landing = (req, res) => {
  res.render('landing', {
    title: 'Digital invitations for every occasion',
    layoutMode: 'landing',
    categories: Object.entries(CATEGORY_META).map(([key, meta], i) => ({ key, index: String(i + 1).padStart(2, '0'), ...meta })),
    isLoggedIn: Boolean(req.session?.userId),
  });
};
