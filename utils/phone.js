'use strict';

/**
 * Normalise a Tanzanian mobile number to international format without "+":
 *   0712345678      -> 255712345678
 *   712345678       -> 255712345678
 *   +255 712 345 678-> 255712345678
 *   255712345678    -> 255712345678
 *   00255712345678  -> 255712345678
 * Returns null when the input cannot be a valid Tanzanian mobile number
 * (mobile numbers start with 6 or 7 after the country code).
 */
function normalizeTzPhone(input) {
  if (input === null || input === undefined) return null;
  let digits = String(input).replace(/[^\d]/g, '');
  if (!digits) return null;

  if (digits.startsWith('00255')) digits = digits.slice(2);

  if (digits.startsWith('255')) {
    // already international
  } else if (digits.startsWith('0')) {
    digits = '255' + digits.slice(1);
  } else if (digits.length === 9) {
    digits = '255' + digits;
  }

  return /^255[67]\d{8}$/.test(digits) ? digits : null;
}

/** "255712345678" -> "+255712345678" */
function toE164(normalized) {
  return `+${normalized}`;
}

module.exports = { normalizeTzPhone, toE164 };
