'use strict';
const sequelize = require('../config/database');
const User = require('./User');
const AdminUser = require('./AdminUser');
const PasswordReset = require('./PasswordReset');
const CardTemplate = require('./CardTemplate');
const Event = require('./Event');
const Guest = require('./Guest');
const DeliveryLog = require('./DeliveryLog');

// User 1 - * Event
User.hasMany(Event, { foreignKey: 'userId', onDelete: 'CASCADE' });
Event.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(PasswordReset, { foreignKey: 'userId', onDelete: 'CASCADE' });
PasswordReset.belongsTo(User, { foreignKey: 'userId' });

// CardTemplate 1 - * Event
CardTemplate.hasMany(Event, { foreignKey: 'templateId', onDelete: 'SET NULL' });
Event.belongsTo(CardTemplate, { foreignKey: 'templateId', as: 'template' });

// Event 1 - * Guest
Event.hasMany(Guest, { foreignKey: 'eventId', as: 'guests', onDelete: 'CASCADE' });
Guest.belongsTo(Event, { foreignKey: 'eventId', as: 'event' });

// Guest 1 - * DeliveryLog, Event 1 - * DeliveryLog
Guest.hasMany(DeliveryLog, { foreignKey: 'guestId', as: 'logs', onDelete: 'CASCADE' });
DeliveryLog.belongsTo(Guest, { foreignKey: 'guestId' });
Event.hasMany(DeliveryLog, { foreignKey: 'eventId', onDelete: 'CASCADE' });
DeliveryLog.belongsTo(Event, { foreignKey: 'eventId' });

module.exports = { sequelize, User, AdminUser, PasswordReset, CardTemplate, Event, Guest, DeliveryLog };
