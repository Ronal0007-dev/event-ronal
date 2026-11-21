'use strict';
const nodemailer = require('nodemailer');
const { appUrl } = require('./cardGeneratorService');

function getSmtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const from = String(process.env.SMTP_FROM || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '');
  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535 || Boolean(user) !== Boolean(pass)) return null;
  return { host, port, from, user, pass, secure: process.env.SMTP_SECURE === 'true' || port === 465 };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function sendPasswordResetEmail(user, token) {
  const config = getSmtpConfig();
  if (!config) throw new Error('Password reset email is not configured. Set SMTP_HOST, SMTP_PORT, and SMTP_FROM, plus SMTP_USER and SMTP_PASS when authentication is required.');

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user ? { auth: { user: config.user, pass: config.pass } } : {}),
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  const resetUrl = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const name = escapeHtml(user.fullName);
  await transporter.sendMail({
    from: config.from,
    to: user.email,
    subject: 'Reset your Event Invite password',
    text: `Hello ${user.fullName},\n\nUse the link below to reset your Event Invite password. This link expires in 30 minutes and can only be used once.\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Hello ${name},</p><p>We received a request to reset your Event Invite password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 30 minutes and can only be used once. If you did not request this, you can ignore this email.</p>`,
  });
}

module.exports = { getSmtpConfig, sendPasswordResetEmail };
