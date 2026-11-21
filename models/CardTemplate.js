'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CATEGORIES = [
  'birthday',
  'wedding',
  'anniversary',
  'engagement',
  'baby-shower',
  'bridal-shower',
  'retirement-farewell',
  'graduation',
  'send-off',
  'confirmation',
];

const CardTemplate = sequelize.define(
  'CardTemplate',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    category: { type: DataTypes.ENUM(...CATEGORIES), allowNull: false },
    // Key of a recolourable design in services/templateDesigns.js (null for legacy image-only templates)
    designKey: { type: DataTypes.STRING(60), allowNull: true },
    // Preview / static background. For designs this is /template-preview/<designKey> (colour via ?color=)
    backgroundImageUrl: { type: DataTypes.STRING(255), allowNull: false },
    textColor: { type: DataTypes.STRING(9), allowNull: false, defaultValue: '#2b2b2b' },
    // QR top-left corner (px) on the 1080 x 1500 card canvas
    qrPositionX: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 390 },
    qrPositionY: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1040 },
    // Guest name anchor (text is centred on X, baseline at Y)
    namePositionX: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 540 },
    namePositionY: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 700 },
  },
  { tableName: 'card_templates' }
);

CardTemplate.CATEGORIES = CATEGORIES;
module.exports = CardTemplate;
