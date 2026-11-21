'use strict';
const fs = require('fs/promises');
const path = require('path');
const { Guest } = require('../models');
const { deleteCardFile } = require('./cardGeneratorService');

async function deleteEvent(event) {
  const guests = await Guest.findAll({ where: { eventId: event.id }, attributes: ['generatedCardUrl'] });
  await Promise.all(guests.map((guest) => deleteCardFile(guest.generatedCardUrl)));

  if (event.customBackgroundUrl?.startsWith('/uploads/')) {
    try {
      await fs.unlink(path.join(__dirname, '..', 'public', 'uploads', path.basename(event.customBackgroundUrl)));
    } catch (_) {
      // The upload may already have been removed.
    }
  }

  await event.destroy();
}

module.exports = { deleteEvent };
