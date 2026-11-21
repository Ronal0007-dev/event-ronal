'use strict';
const { Event } = require('../models');

const wantsJson = (req) => req.originalUrl.startsWith('/api/') || req.xhr || (req.get('accept') || '').includes('application/json');

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  if (wantsJson(req)) return res.status(401).json({ ok: false, message: 'Please sign in again.' });
  return res.redirect('/login');
}

function redirectIfAuthed(req, res, next) {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  return next();
}

/** Loads the event named by :eventId / :id and makes sure it belongs to the signed-in organizer. */
async function loadOwnedEvent(req, res, next) {
  const id = Number(req.params.eventId || req.params.id);
  if (!Number.isInteger(id) || id < 1) return notFound(req, res);
  const event = await Event.findOne({ where: { id, userId: req.session.userId }, include: [{ association: 'template' }] });
  if (!event) return notFound(req, res);
  req.event = event;
  return next();
}

function notFound(req, res) {
  if (wantsJson(req)) return res.status(404).json({ ok: false, message: 'Event not found.' });
  return res.status(404).render('error', { title: 'Not found', message: 'That event could not be found.' });
}

module.exports = { requireAuth, redirectIfAuthed, loadOwnedEvent, wantsJson };
