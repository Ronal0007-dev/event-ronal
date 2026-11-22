'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireUserOrAdmin, loadAccessibleEvent } = require('../middleware/auth');
const { backgroundUpload, guestListUpload } = require('../middleware/upload');
const events = require('../controllers/eventController');
const guests = require('../controllers/guestController');
const checkin = require('../controllers/checkinController');

const router = express.Router();
router.use(requireUserOrAdmin);

// Scanning can be rapid at a busy gate, so this limit is generous
const scanLimiter = rateLimit({ windowMs: 60 * 1000, limit: 240, standardHeaders: 'draft-7', legacyHeaders: false, message: { ok: false, result: 'ERROR', message: 'Too many scans, slow down a little.' } });

// Templates & events
router.get('/templates', requireAuth, events.listTemplates);
router.post('/events', requireAuth, backgroundUpload.single('customBackground'), events.createEvent);
router.patch('/events/:id', loadAccessibleEvent, events.updateEvent);
router.delete('/events/:id', loadAccessibleEvent, events.deleteEvent);
router.patch('/events/:id/appearance', loadAccessibleEvent, events.updateAppearance);
router.get('/events/:id/stats', loadAccessibleEvent, events.stats);

// Guests
router.get('/events/:id/guests', loadAccessibleEvent, guests.list);
router.post('/events/:id/guests', loadAccessibleEvent, guests.add);
router.post('/events/:id/guests/bulk', loadAccessibleEvent, guestListUpload.single('file'), guests.bulkUpload);
router.get('/events/:id/guests/export', loadAccessibleEvent, guests.exportCsv);
router.delete('/events/:id/guests/:guestId', loadAccessibleEvent, guests.remove);

// Cards & delivery
router.post('/events/:id/generate-cards', loadAccessibleEvent, guests.generateCards);
router.post('/events/:id/send', loadAccessibleEvent, guests.sendInvitations);
router.post('/events/:id/thank-you', loadAccessibleEvent, guests.sendThankYou);
router.get('/events/:id/credits', loadAccessibleEvent, guests.eventCredits);
router.get('/events/:id/delivery-logs', loadAccessibleEvent, guests.deliveryLogs);
router.get('/credits', requireAuth, guests.credits);

// Gate check-in
router.post('/checkin/verify', scanLimiter, checkin.verify);
router.post('/checkin/undo', scanLimiter, checkin.undo);

module.exports = router;
