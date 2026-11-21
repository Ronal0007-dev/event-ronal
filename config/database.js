'use strict';
require('dotenv').config();
const { Sequelize } = require('sequelize');

const isProd = process.env.NODE_ENV === 'production';

let sequelize;

if (process.env.DB_DIALECT === 'sqlite') {
  // Used only for automated smoke tests / quick local trials without MySQL.
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: process.env.DB_STORAGE || ':memory:',
    logging: false,
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'event_invite',
    process.env.DB_USER || 'root',
    process.env.DB_PASS || '',
    {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      dialect: 'mysql',
      dialectOptions: { charset: 'utf8mb4' },
      define: { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
      // Dar es Salaam is UTC+3 all year (no DST)
      timezone: '+03:00',
      logging: process.env.DB_LOGGING === 'true' ? console.log : false,
      pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    }
  );
}

module.exports = sequelize;
module.exports.isProd = isProd;
