'use strict';
const bcrypt = require('bcryptjs');
const { Op, fn, col } = require('sequelize');
const { AdminUser, User, Event, Guest } = require('../models');
const { formatDateTime, formatShortDateTime } = require('../utils/format');
const { deleteEvent } = require('../services/eventDeletionService');

const PAGE_SIZE = 25;

exports.showLogin = (req, res) => {
  if (req.session?.adminAuthenticated) return res.redirect('/admin');
  return res.render('login', {
    layoutMode: 'app',
    authMode: 'login',
    adminMode: true,
    title: 'Administrator sign in',
    error: null,
    email: '',
  });
};

exports.login = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const admin = email ? await AdminUser.findOne({ where: { email } }) : null;
  const valid = admin
    ? await bcrypt.compare(password, admin.passwordHash)
    : await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');

  if (!admin || !valid) {
    return res.status(401).render('login', {
      layoutMode: 'app',
      authMode: 'login',
      adminMode: true,
      title: 'Administrator sign in',
      error: 'Incorrect administrator email or password.',
      email,
    });
  }

  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.adminAuthenticated = true;
  req.session.adminId = admin.id;
  await new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
  return res.redirect('/admin');
};

exports.logout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('sid');
    return res.redirect('/admin/login');
  });
};

exports.dashboard = async (req, res) => {
  const parsedPage = Number.parseInt(req.query.page, 10);
  const requestedPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [userCount, eventCount, guestCount, cardCount] = await Promise.all([
    User.count(),
    Event.count(),
    Guest.count(),
    Guest.count({ where: { generatedCardUrl: { [Op.ne]: null } } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(userCount / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const users = await User.findAll({
    attributes: ['id', 'fullName', 'email', 'phone', 'smsCredits', 'whatsappCredits', 'createdAt'],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const userIds = users.map((user) => user.id);
  const events = userIds.length
    ? await Event.findAll({
        attributes: ['id', 'userId', 'category', 'eventName', 'eventDate', 'venue', 'status', 'accentColor', 'createdAt'],
        where: { userId: { [Op.in]: userIds } },
        order: [['eventDate', 'DESC'], ['id', 'DESC']],
      })
    : [];
  const eventIds = events.map((event) => event.id);
  const groupedCount = (where = {}) =>
    eventIds.length
      ? Guest.findAll({
          attributes: ['eventId', [fn('COUNT', col('id')), 'count']],
          where: { eventId: { [Op.in]: eventIds }, ...where },
          group: ['eventId'],
          raw: true,
        })
      : [];
  const [guestRows, cardRows, attendedRows] = await Promise.all([
    groupedCount(),
    groupedCount({ generatedCardUrl: { [Op.ne]: null } }),
    groupedCount({ attendanceStatus: 'ATTENDED' }),
  ]);
  const counts = new Map();
  for (const [rows, key] of [[guestRows, 'guests'], [cardRows, 'cards'], [attendedRows, 'attended']]) {
    rows.forEach((row) => {
      const eventId = Number(row.eventId);
      const item = counts.get(eventId) || { guests: 0, cards: 0, attended: 0 };
      item[key] = Number(row.count);
      counts.set(eventId, item);
    });
  }

  const eventsByUser = new Map(userIds.map((id) => [Number(id), []]));
  events.forEach((event) => {
    const stats = counts.get(Number(event.id)) || { guests: 0, cards: 0, attended: 0 };
    eventsByUser.get(Number(event.userId)).push({
      id: event.id,
      category: event.category,
      eventName: event.eventName,
      eventDate: formatDateTime(event.eventDate),
      venue: event.venue,
      status: event.status,
      accentColor: event.accentColor,
      createdAt: formatShortDateTime(event.createdAt),
      ...stats,
    });
  });

  const totalPages = Array.from({ length: pageCount }, (_, index) => index + 1);
  return res.render('admin-dashboard', {
    layoutMode: 'bare',
    title: 'Admin console',
    page,
    pageCount,
    totalPages,
    stats: { users: userCount, events: eventCount, guests: guestCount, cards: cardCount },
    users: users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      smsCredits: user.smsCredits,
      whatsappCredits: user.whatsappCredits,
      createdAt: formatShortDateTime(user.createdAt),
      events: eventsByUser.get(Number(user.id)) || [],
    })),
    deleted: req.query.deleted === '1',
  });
};

async function findEventForDeletion(req, res) {
  const id = Number(req.params.eventId);
  if (!Number.isInteger(id) || id < 1) {
    res.status(404).render('error', { layoutMode: 'bare', title: 'Not found', message: 'That event could not be found.' });
    return null;
  }
  const event = await Event.findByPk(id, { include: [{ model: User, attributes: ['id', 'fullName', 'email'] }] });
  if (!event) {
    res.status(404).render('error', { layoutMode: 'bare', title: 'Not found', message: 'That event could not be found.' });
    return null;
  }
  return event;
}

exports.confirmEventDeletion = async (req, res) => {
  const event = await findEventForDeletion(req, res);
  if (!event) return;
  const [guests, cards] = await Promise.all([
    Guest.count({ where: { eventId: event.id } }),
    Guest.count({ where: { eventId: event.id, generatedCardUrl: { [Op.ne]: null } } }),
  ]);
  const page = Number.parseInt(req.query.page, 10);
  return res.render('admin-event-delete', {
    layoutMode: 'bare',
    title: 'Confirm event deletion',
    event: {
      id: event.id,
      eventName: event.eventName,
      category: event.category,
      ownerName: event.User.fullName,
      ownerEmail: event.User.email,
      eventDate: formatDateTime(event.eventDate),
      venue: event.venue,
      guests,
      cards,
    },
    page: Number.isInteger(page) && page > 0 ? page : 1,
  });
};

exports.deleteEvent = async (req, res) => {
  const event = await findEventForDeletion(req, res);
  if (!event) return;
  await deleteEvent(event);
  const parsedPage = Number.parseInt(req.body.page, 10);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  return res.redirect(`/admin?page=${page}&deleted=1`);
};
