'use strict';

const TZ = 'Africa/Dar_es_Salaam';

function formatEventDate(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date));
}

function formatEventTime(date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(date)
  );
}

function formatDateTime(date) {
  if (!date) return '';
  return `${formatEventDate(date)}, ${formatEventTime(date)}`;
}

function formatShortDateTime(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(date));
}

/**
 * Parse the value of an <input type="datetime-local"> ("2026-12-05T16:00")
 * as East Africa Time (UTC+3), regardless of the server's own timezone.
 */
function parseLocalEat(value) {
  if (!value) return null;
  const withSeconds = /T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
  const d = new Date(`${withSeconds}+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

module.exports = { formatEventDate, formatEventTime, formatDateTime, formatShortDateTime, parseLocalEat };
