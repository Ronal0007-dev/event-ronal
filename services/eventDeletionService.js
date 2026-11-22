'use strict';
const fs = require('fs/promises');
const path = require('path');
const { Guest } = require('../models');
const { deleteCardFile } = require('./cardGeneratorService');

async function removeCustomBackground(backgroundUrl) {
  if (!backgroundUrl?.startsWith('/uploads/')) return;
  try {
    await fs.unlink(path.join(__dirname, '..', 'public', 'uploads', path.basename(backgroundUrl)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function deleteEvent(event) {
  const guests = await Guest.findAll({ where: { eventId: event.id }, attributes: ['generatedCardUrl'] });
  await Promise.all(guests.map((guest) => deleteCardFile(guest.generatedCardUrl)));
  await removeCustomBackground(event.customBackgroundUrl);
  await event.destroy();
}

module.exports = { deleteEvent, removeCustomBackground };
