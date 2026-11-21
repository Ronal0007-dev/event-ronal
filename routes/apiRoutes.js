'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth, loadOwnedEvent } = require('../middleware/auth');
const { backgroundUpload, guestListUpload } = require('../middleware/upload');
const events = require('../controllers/eventController');
const guests = require('../controllers/guestController');
const checkin = require('../controllers/checkinController');

const router = express.Router();
router.use(requireAuth);

// Scanning can be rapid at a busy gate, so this limit is generous
const scanLimiter = rateLimit({ windowMs: 60 * 1000, limit: 240, standardHeaders: 'draft-7', legacyHeaders: false, message: { ok: false, result: 'ERROR', message: 'Too many scans, slow down a little.' } });

// Templates & events
router.get('/templates', events.listTemplates);
router.post('/events', backgroundUpload.single('customBackground'), events.createEvent);
router.delete('/events/:id', loadOwnedEvent, events.deleteEvent);
router.patch('/events/:id/appearance', loadOwnedEvent, events.updateAppearance);
router.get('/events/:id/stats', loadOwnedEvent, events.stats);

// Guests
router.get('/events/:id/guests', loadOwnedEvent, guests.list);
router.post('/events/:id/guests', loadOwnedEvent, guests.add);
router.post('/events/:id/guests/bulk', loadOwnedEvent, guestListUpload.single('file'), guests.bulkUpload);
router.get('/events/:id/guests/export', loadOwnedEvent, guests.exportCsv);
router.delete('/events/:id/guests/:guestId', loadOwnedEvent, guests.remove);

// Cards & delivery
router.post('/events/:id/generate-cards', loadOwnedEvent, guests.generateCards);
router.post('/events/:id/send', loadOwnedEvent, guests.sendInvitations);
router.post('/events/:id/thank-you', loadOwnedEvent, guests.sendThankYou);
router.get('/events/:id/delivery-logs', loadOwnedEvent, guests.deliveryLogs);
router.get('/credits', guests.credits);

// Gate check-in
router.post('/checkin/verify', scanLimiter, checkin.verify);
router.post('/checkin/undo', scanLimiter, checkin.undo);

module.exports = router;
