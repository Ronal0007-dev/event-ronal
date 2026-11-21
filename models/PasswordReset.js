'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PasswordReset = sequelize.define(
  'PasswordReset',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    tableName: 'password_resets',
    indexes: [{ unique: true, fields: ['userId'] }, { fields: ['expiresAt'] }],
  }
);

module.exports = PasswordReset;
