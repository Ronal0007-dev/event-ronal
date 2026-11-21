'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AdminUser = sequelize.define(
  'AdminUser',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    fullName: { type: DataTypes.STRING(120), allowNull: false },
    email: { type: DataTypes.STRING(160), allowNull: false, unique: true, validate: { isEmail: true } },
    passwordHash: { type: DataTypes.STRING(100), allowNull: false },
  },
  { tableName: 'admin_users' }
);

module.exports = AdminUser;
