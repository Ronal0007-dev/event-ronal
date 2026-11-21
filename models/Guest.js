'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DELIVERY_STATUSES = ['NOT_SENT', 'PENDING', 'SENT', 'FAILED'];

const Guest = sequelize.define(
  'Guest',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    eventId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    guestName: { type: DataTypes.STRING(120), allowNull: false },
    phoneNumber: { type: DataTypes.STRING(15), allowNull: false }, // normalised: 255XXXXXXXXX
    cardType: { type: DataTypes.ENUM('Single', 'Double'), allowNull: false, defaultValue: 'Single' },
    qrToken: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    generatedCardUrl: { type: DataTypes.STRING(255), allowNull: true },
    smsStatus: { type: DataTypes.ENUM(...DELIVERY_STATUSES), allowNull: false, defaultValue: 'NOT_SENT' },
    whatsappStatus: { type: DataTypes.ENUM(...DELIVERY_STATUSES), allowNull: false, defaultValue: 'NOT_SENT' },
    attendanceStatus: { type: DataTypes.ENUM('INVITED', 'ATTENDED'), allowNull: false, defaultValue: 'INVITED' },
    checkedInAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'guests',
    indexes: [{ fields: ['eventId'] }, { fields: ['eventId', 'attendanceStatus'] }],
  }
);

module.exports = Guest;
