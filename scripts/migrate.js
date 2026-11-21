'use strict';
/**
 * One-off schema upgrade for databases created by an earlier version
 * (adds events.accentColor, card_templates.designKey and the new category values).
 * Back up your database first, then:   npm run migrate
 */
require('dotenv').config();
const { sequelize } = require('../models');
const { seedTemplates } = require('./seedTemplates');

(async () => {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });
  await seedTemplates();
  console.log('Migration finished.');
  await sequelize.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
