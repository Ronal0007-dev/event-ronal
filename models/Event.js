'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const CardTemplate = require('./CardTemplate');

const Event = sequelize.define(
  'Event',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    templateId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    category: { type: DataTypes.ENUM(...CardTemplate.CATEGORIES), allowNull: false },
    eventName: { type: DataTypes.STRING(160), allowNull: false },
    eventDate: { type: DataTypes.DATE, allowNull: false },
    venue: { type: DataTypes.STRING(255), allowNull: false },
    mapsLink: { type: DataTypes.STRING(500), allowNull: true },
    // Colour chosen by the organiser; every template design re-tints from it
    accentColor: { type: DataTypes.STRING(7), allowNull: false, defaultValue: '#e4572e' },
    customBackgroundUrl: { type: DataTypes.STRING(255), allowNull: true },
    status: { type: DataTypes.ENUM('DRAFT', 'ACTIVE', 'COMPLETED'), allowNull: false, defaultValue: 'ACTIVE' },
  },
  { tableName: 'events' }
);

module.exports = Event;
