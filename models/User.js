'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define(
  'User',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    fullName: { type: DataTypes.STRING(120), allowNull: false },
    email: { type: DataTypes.STRING(160), allowNull: false, unique: true, validate: { isEmail: true } },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    passwordHash: { type: DataTypes.STRING(100), allowNull: false },
    smsCredits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    whatsappCredits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: 'users' }
);

module.exports = User;
