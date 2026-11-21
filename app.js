'use strict';
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const multer = require('multer');

const { sequelize } = require('./models');
const { seedTemplates } = require('./scripts/seedTemplates');
const webRoutes = require('./routes/webRoutes');
const apiRoutes = require('./routes/apiRoutes');

const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

if (isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  console.error('SESSION_SECRET must be set to a random string of 32+ characters in production.');
  process.exit(1);
}

const app = express();
// cPanel / DirectAdmin / Nginx sit in front of Node: trust the first proxy for secure cookies and client IPs
app.set('trust proxy', 1);
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

// Make sure writable folders exist
['public/uploads', 'public/generated-cards', 'public/templates'].forEach((d) => fs.mkdirSync(path.join(__dirname, d), { recursive: true }));

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        // Everything (Bootstrap, icons, fonts, QR scanner) is self-hosted under /vendor and /fonts
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
    // WhatsApp / SMS gateways fetch the generated card images from other origins
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // The scanner needs the camera; everything else is denied
  })
);
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  next();
});

app.use(compression());
if (process.env.NODE_ENV !== 'test') {
  app.use(
    morgan(isProd ? 'combined' : 'dev', {
      // Reset URLs carry bearer tokens and must not be written to access logs.
      skip: (req) => req.path === '/reset-password',
    })
  );
}
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));

const sessionStore = new SequelizeStore({ db: sequelize, tableName: 'sessions', expiration: 7 * 24 * 60 * 60 * 1000 });
app.use(
  session({
    name: 'sid',
    secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd && process.env.COOKIE_SECURE !== 'false',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: isProd ? '7d' : 0,
    index: false,
    dotfiles: 'ignore',
  })
);

// Template locals
app.use((req, res, next) => {
  res.locals.currentUserId = req.session?.userId || null;
  res.locals.layoutMode = 'app';
  next();
});

app.use('/api', apiRoutes);
app.use('/', webRoutes);

app.use((req, res) => {
  if (req.originalUrl.startsWith('/api/')) return res.status(404).json({ ok: false, message: 'Not found.' });
  return res.status(404).render('error', { title: 'Not found', message: 'The page you are looking for does not exist.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const isApi = req.originalUrl.startsWith('/api/');
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'That file is too large.'
        : err.code === 'LIMIT_UNEXPECTED_FILE'
        ? 'Unsupported file type. Use JPG/PNG/WEBP for images, or CSV/XLSX for guest lists.'
        : 'Upload failed.';
    return res.status(422).json({ ok: false, message });
  }
  console.error(err);
  const message = isProd ? 'Something went wrong. Please try again.' : err.message;
  if (isApi) return res.status(500).json({ ok: false, message });
  return res.status(500).render('error', { title: 'Server error', message });
});

async function start() {
  await sequelize.authenticate();
  await sequelize.sync(); // creates missing tables; use { alter: true } deliberately when you change models
  await sessionStore.sync();
  await seedTemplates({ silent: true });
  const server = app.listen(PORT, () => console.log(`Event Invite running on http://localhost:${PORT} (${isProd ? 'production' : 'development'})`));

  const shutdown = () => server.close(() => sequelize.close().then(() => process.exit(0)));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return server;
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = { app, start };
