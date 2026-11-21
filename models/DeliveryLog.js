'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DeliveryLog = sequelize.define(
  'DeliveryLog',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    guestId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    eventId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    channel: { type: DataTypes.ENUM('SMS', 'WHATSAPP'), allowNull: false },
    provider: { type: DataTypes.STRING(30), allowNull: true },
    providerResponse: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.ENUM('PENDING', 'SENT', 'FAILED'), allowNull: false, defaultValue: 'PENDING' },
    sentAt: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'delivery_logs', indexes: [{ fields: ['guestId'] }, { fields: ['eventId', 'channel'] }] }
);

module.exports = DeliveryLog;
