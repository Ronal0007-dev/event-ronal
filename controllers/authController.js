'use strict';
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { sequelize, User, PasswordReset } = require('../models');
const { normalizeTzPhone } = require('../utils/phone');
const { getSmtpConfig, sendPasswordResetEmail } = require('../services/passwordResetEmailService');

const FREE_SMS = Number(process.env.DEFAULT_SMS_CREDITS ?? 50);
const FREE_WA = Number(process.env.DEFAULT_WHATSAPP_CREDITS ?? 50);
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

exports.showLogin = (req, res) =>
  res.render('login', {
    authMode: 'login',
    title: 'Sign in',
    error: null,
    email: '',
    success: req.query.reset === '1' ? 'Your password has been reset. Sign in with your new password.' : null,
  });
exports.showRegister = (req, res) => res.render('register', { authMode: 'register', title: 'Create account', error: null, form: {} });

exports.showForgotPassword = (req, res) =>
  res.render('forgot-password', { title: 'Reset your password', error: null, success: null, email: '' });

exports.requestPasswordReset = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const renderForm = (status, error, success) =>
    res.status(status).render('forgot-password', { title: 'Reset your password', error, success, email });
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 160) {
    return renderForm(422, 'Enter a valid email address.', null);
  }
  if (!getSmtpConfig()) {
    return renderForm(
      503,
      'Password reset is temporarily unavailable because email delivery is not configured. Please contact support.',
      null
    );
  }

  await PasswordReset.destroy({ where: { expiresAt: { [Op.lte]: new Date() } } });
  const user = await User.findOne({ where: { email } });
  if (user) {
    await PasswordReset.destroy({ where: { userId: user.id } });
    const token = crypto.randomBytes(32).toString('base64url');
    const reset = await PasswordReset.create({
      userId: user.id,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });
    try {
      await sendPasswordResetEmail(user, token);
    } catch (error) {
      await reset.destroy();
      throw error;
    }
  }

  return renderForm(
    200,
    null,
    'If an account exists for that email, a password reset link has been sent. Check your inbox.'
  );
};

exports.showResetPassword = async (req, res) => {
  const token = String(req.query.token || '');
  const reset = /^[A-Za-z0-9_-]{43}$/.test(token)
    ? await PasswordReset.findOne({
        where: {
          tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
          expiresAt: { [Op.gt]: new Date() },
        },
      })
    : null;
  return res.status(reset ? 200 : 400).render('reset-password', {
    title: 'Choose a new password',
    token: reset ? token : '',
    error: reset ? null : 'This password reset link is invalid or has expired. Request a new link to continue.',
  });
};

exports.resetPassword = async (req, res) => {
  const token = String(req.body.token || '');
  const password = String(req.body.password || '');
  const confirmation = String(req.body.confirmPassword || '');
  const renderInvalid = (error) =>
    res.status(400).render('reset-password', { title: 'Choose a new password', token: '', error });

  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return renderInvalid('This password reset link is invalid or has expired. Request a new link to continue.');
  if (password.length < 8) {
    return res.status(422).render('reset-password', {
      title: 'Choose a new password',
      token,
      error: 'Your password must be at least 8 characters.',
    });
  }
  if (password !== confirmation) {
    return res.status(422).render('reset-password', {
      title: 'Choose a new password',
      token,
      error: 'The passwords do not match.',
    });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const passwordHash = await bcrypt.hash(password, 12);
  const changed = await sequelize.transaction(async (transaction) => {
    const reset = await PasswordReset.findOne({
      where: { tokenHash, expiresAt: { [Op.gt]: new Date() } },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!reset) return false;
    await User.update({ passwordHash }, { where: { id: reset.userId }, transaction });
    await PasswordReset.destroy({ where: { userId: reset.userId }, transaction });
    return true;
  });

  if (!changed) return renderInvalid('This password reset link is invalid or has expired. Request a new link to continue.');
  return res.redirect('/login?reset=1');
};

exports.register = async (req, res) => {
  const { fullName = '', email = '', phone = '', password = '' } = req.body;
  const form = { fullName: fullName.trim(), email: email.trim().toLowerCase(), phone: phone.trim() };
  const fail = (error) => res.status(422).render('register', { authMode: 'register', title: 'Create account', error, form });

  if (form.fullName.length < 2) return fail('Please enter your full name.');
  if (!/^\S+@\S+\.\S+$/.test(form.email)) return fail('Please enter a valid email address.');
  if (password.length < 8) return fail('Password must be at least 8 characters.');
  const normalizedPhone = form.phone ? normalizeTzPhone(form.phone) : null;
  if (form.phone && !normalizedPhone) return fail('Phone number is not a valid Tanzanian mobile number.');
  if (await User.findOne({ where: { email: form.email } })) return fail('An account with that email already exists.');

  const user = await User.create({
    fullName: form.fullName,
    email: form.email,
    phone: normalizedPhone,
    passwordHash: await bcrypt.hash(password, 12),
    smsCredits: FREE_SMS,
    whatsappCredits: FREE_WA,
  });

  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.userId = user.id;
    req.session.save(() => res.redirect('/dashboard'));
  });
};

exports.login = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = email ? await User.findOne({ where: { email } }) : null;
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');

  if (!user || !valid) {
    return res.status(401).render('login', { authMode: 'login', title: 'Sign in', error: 'Incorrect email or password.', email });
  }
  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.userId = user.id;
    req.session.save(() => res.redirect('/dashboard'));
  });
};

exports.logout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('sid');
    res.redirect('/');
  });
};
