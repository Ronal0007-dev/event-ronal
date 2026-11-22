'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireUserOrAdmin, redirectIfAuthed, loadAccessibleEvent } = require('../middleware/auth');
const auth = require('../controllers/authController');
const admin = require('../controllers/adminController');
const { requireAdmin, redirectIfAdmin } = require('../middleware/adminAuth');
const events = require('../controllers/eventController');
const checkin = require('../controllers/checkinController');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).render('error', { title: 'Too many attempts', message: 'Too many attempts. Please wait a few minutes and try again.' }),
});
const passwordResetRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).render('forgot-password', {
      title: 'Reset your password',
      error: 'Too many reset requests. Please try again in an hour.',
      success: null,
      email: String(req.body.email || ''),
    }),
});
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).render('reset-password', {
      title: 'Choose a new password',
      token: '',
      error: 'Too many password reset attempts. Request a new link and try again later.',
    }),
});

router.get('/', events.landing);
router.get('/template-preview/:key', events.previewDesign);

// Auth
router.get('/login', redirectIfAuthed, auth.showLogin);
router.post('/login', authLimiter, auth.login);
router.get('/register', redirectIfAuthed, auth.showRegister);
router.post('/register', authLimiter, auth.register);
router.get('/forgot-password', auth.showForgotPassword);
router.post('/forgot-password', passwordResetRequestLimiter, auth.requestPasswordReset);
router.get('/reset-password', (req, res, next) => {
  res.set('Referrer-Policy', 'no-referrer');
  next();
}, auth.showResetPassword);
router.post('/reset-password', passwordResetLimiter, auth.resetPassword);
router.post('/logout', auth.logout);

// Administrator console
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).render('login', {
    layoutMode: 'app',
    authMode: 'login',
    adminMode: true,
    title: 'Administrator sign in',
    error: 'Too many sign-in attempts. Please wait a few minutes and try again.',
    email: '',
  }),
});
router.get('/admin/login', redirectIfAdmin, admin.showLogin);
router.post('/admin/login', redirectIfAdmin, adminLoginLimiter, admin.login);
router.post('/admin/logout', requireAdmin, admin.logout);
router.get('/admin', requireAdmin, admin.dashboard);
router.get('/admin/events/:eventId/manage', requireAdmin, loadAccessibleEvent, events.showEvent);
router.get('/admin/events/:eventId/delete', requireAdmin, admin.confirmEventDeletion);
router.post('/admin/events/:eventId/delete', requireAdmin, admin.deleteEvent);

// Organiser pages
router.get('/dashboard', requireAuth, events.dashboard);
router.get('/events/:id', requireAuth, loadAccessibleEvent, events.showEvent);
router.get('/scanner/:eventId', requireUserOrAdmin, loadAccessibleEvent, events.showScanner);

// Public pages (linked from QR codes / SMS)
router.get('/verify-checkin/:token', checkin.publicVerifyPage);
router.get('/c/:token', checkin.publicCardPage);

module.exports = router;
