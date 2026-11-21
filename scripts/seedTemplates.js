'use strict';
/**
 * Registers every recolourable design from services/templateDesigns.js in the card_templates table.
 * Safe to re-run: existing designs are left untouched, missing ones are added.
 * Legacy image-only templates from the first release are retired (events fall back to a design).
 *
 *   npm run seed
 */
require('dotenv').config();
const { Op } = require('sequelize');
const { DESIGNS } = require('../services/templateDesigns');

async function seedTemplates({ silent = false } = {}) {
  const { CardTemplate } = require('../models');
  let created = 0;

  await CardTemplate.destroy({ where: { designKey: null, backgroundImageUrl: { [Op.like]: '/templates/%' } } });

  for (const d of DESIGNS) {
    const exists = await CardTemplate.findOne({ where: { designKey: d.key } });
    if (exists) continue;
    await CardTemplate.create({
      name: d.name,
      category: d.category,
      designKey: d.key,
      backgroundImageUrl: `/template-preview/${d.key}`,
      textColor: '#2b2b2b', // overridden per colour at render time
      qrPositionX: 390,
      qrPositionY: 1040,
      namePositionX: 540,
      namePositionY: 700,
    });
    created += 1;
  }
  if (!silent) console.log(`Seeded ${created} card design(s).`);
  return created;
}

module.exports = { seedTemplates };

if (require.main === module) {
  (async () => {
    const { sequelize } = require('../models');
    await sequelize.sync();
    await seedTemplates();
    await sequelize.close();
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
