'use strict';
const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');
const QRCode = require('qrcode');
const { formatEventDate, formatEventTime } = require('../utils/format');
const { renderDesign, DESIGNS } = require('./templateDesigns');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const OUTPUT_DIR = path.join(PUBLIC_DIR, 'generated-cards');

// Card canvas (portrait). Templates are authored at this size; any other image is cover-cropped.
const CARD_W = 1080;
const CARD_H = 1500;
const QR_SIZE = 300;
const FONT = "'DejaVu Sans', 'Segoe UI', Arial, Helvetica, sans-serif";

const DEFAULT_LAYOUT = {
  textColor: '#2b2b2b',
  qrPositionX: 390,
  qrPositionY: 1040,
  namePositionX: 540,
  namePositionY: 700,
};

function appUrl() {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function verificationUrl(token) {
  return `${appUrl()}/verify-checkin/${token}`;
}

function cardPageUrl(token) {
  return `${appUrl()}/c/${token}`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Greedy word-wrap by character count; truncates with an ellipsis after maxLines. */
function wrapText(text, maxChars, maxLines) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/…$/, '').slice(0, maxChars - 1)}…`;
    return kept;
  }
  return lines;
}

function textBlock(lines, x, y, { size, weight = 'normal', color, lineHeight, letterSpacing = 0, anchor = 'middle' }) {
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + i * (lineHeight || size * 1.25)}" font-family="${FONT}" font-size="${size}" ` +
        `font-weight="${weight}" fill="${color}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${esc(line)}</text>`
    )
    .join('');
}

function resolvePublicPath(urlPath) {
  // urlPath is like "/templates/wedding-1.jpg" or "/uploads/abc.png"
  const clean = path.normalize(urlPath).replace(/^([/\\])+/, '');
  const full = path.join(PUBLIC_DIR, clean);
  if (!full.startsWith(PUBLIC_DIR)) throw new Error('Invalid background path');
  return full;
}

async function loadBackground(backgroundUrl, fallbackColor = '#f4f1ea') {
  try {
    if (backgroundUrl) {
      const file = resolvePublicPath(backgroundUrl);
      await fs.access(file);
      return await sharp(file).rotate().resize(CARD_W, CARD_H, { fit: 'cover', position: 'centre' }).jpeg({ quality: 92 }).toBuffer();
    }
  } catch (err) {
    console.warn(`[cards] background unavailable (${backgroundUrl}): ${err.message}`);
  }
  return sharp({ create: { width: CARD_W, height: CARD_H, channels: 3, background: fallbackColor } })
    .jpeg()
    .toBuffer();
}

function buildOverlaySvg({ guest, event, layout, isCustomBackground }) {
  const color = layout.textColor;
  const cx = layout.namePositionX;
  const nameY = layout.namePositionY;
  const guestName = String(guest.guestName || '').trim();

  const nameSize = guestName.length > 28 ? 46 : guestName.length > 20 ? 56 : 68;
  const nameLines = wrapText(guestName, nameSize >= 68 ? 22 : 30, 2);
  const titleLen = String(event.eventName || '').length;
  const eventSize = titleLen > 34 ? 42 : titleLen > 20 ? 50 : 58;
  const eventLines = wrapText(event.eventName, eventSize >= 58 ? 26 : eventSize >= 50 ? 30 : 36, 3);
  const venueLines = wrapText(event.venue, 38, 2);

  const isDouble = guest.cardType === 'Double';
  const badgeText = isDouble ? 'DOUBLE CARD  •  ADMITS 2' : 'SINGLE CARD  •  ADMITS 1';
  const badgeW = 420;
  const badgeY = nameY + 40 + (nameLines.length - 1) * nameSize * 1.2;

  const dateY = badgeY + 140;
  const venueY = dateY + 62;

  const qrX = layout.qrPositionX;
  const qrY = layout.qrPositionY;

  // Custom uploads have unknown contrast: add a dark rounded panel and force white text.
  const panel = isCustomBackground
    ? `<rect x="70" y="120" width="${CARD_W - 140}" height="${CARD_H - 240}" rx="36" fill="#000000" fill-opacity="0.50"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
    ${panel}
    ${textBlock(['YOU ARE INVITED'], cx, nameY - 400, { size: 32, weight: 'bold', color, letterSpacing: 8 })}
    ${textBlock(eventLines, cx, nameY - 320, { size: eventSize, weight: 'bold', color, lineHeight: eventSize * 1.25 })}
    ${textBlock(['HONOURED GUEST'], cx, nameY - nameSize - 24, { size: 24, color, letterSpacing: 5 })}
    ${textBlock(nameLines, cx, nameY, { size: nameSize, weight: 'bold', color, lineHeight: nameSize * 1.2 })}
    <rect x="${cx - badgeW / 2}" y="${badgeY}" width="${badgeW}" height="58" rx="29" fill="none" stroke="${color}" stroke-width="3"/>
    ${textBlock([badgeText], cx, badgeY + 38, { size: 24, weight: 'bold', color, letterSpacing: 2 })}
    ${textBlock([`${formatEventDate(event.eventDate)}`], cx, dateY, { size: 34, weight: 'bold', color })}
    ${textBlock([`${formatEventTime(event.eventDate)} hrs`], cx, dateY + 46, { size: 30, color })}
    ${textBlock(venueLines, cx, venueY + 40, { size: 30, color, lineHeight: 40 })}
    <rect x="${qrX - 20}" y="${qrY - 20}" width="${QR_SIZE + 40}" height="${QR_SIZE + 40}" rx="22" fill="#ffffff"/>
    ${textBlock(['SCAN AT THE ENTRANCE'], cx, qrY + QR_SIZE + 60, { size: 24, weight: 'bold', color, letterSpacing: 4 })}
  </svg>`;
}

/**
 * Render one guest's card and save it as /public/generated-cards/<eventId>-<token>.jpg
 * @returns {Promise<string>} public URL path of the generated card (e.g. "/generated-cards/12-abc.jpg")
 */
async function generateCard({ guest, event, template }) {
  const isCustom = Boolean(event.customBackgroundUrl);

  const layout = {
    textColor: template?.textColor || DEFAULT_LAYOUT.textColor,
    qrPositionX: template?.qrPositionX ?? DEFAULT_LAYOUT.qrPositionX,
    qrPositionY: template?.qrPositionY ?? DEFAULT_LAYOUT.qrPositionY,
    namePositionX: template?.namePositionX ?? DEFAULT_LAYOUT.namePositionX,
    namePositionY: template?.namePositionY ?? DEFAULT_LAYOUT.namePositionY,
  };

  let backgroundPromise;
  if (isCustom) {
    layout.textColor = '#ffffff'; // uploads get a dark panel + white text
    backgroundPromise = loadBackground(event.customBackgroundUrl);
  } else if (template?.designKey || !template) {
    // Recolourable design: re-tinted from the organiser's accent colour.
    // (No template row, e.g. a retired legacy one: use the first design of the category.)
    const key = template?.designKey || (DESIGNS.find((d) => d.category === event.category) || DESIGNS[0]).key;
    const design = renderDesign(key, event.accentColor);
    layout.textColor = design.textColor;
    backgroundPromise = sharp(Buffer.from(design.svg)).jpeg({ quality: 92 }).toBuffer();
  } else {
    backgroundPromise = loadBackground(template?.backgroundImageUrl);
  }

  const [background, qrBuffer] = await Promise.all([
    backgroundPromise,
    QRCode.toBuffer(verificationUrl(guest.qrToken), {
      type: 'png',
      width: QR_SIZE,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    }),
  ]);

  const overlay = Buffer.from(buildOverlaySvg({ guest, event, layout, isCustomBackground: isCustom }));

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const fileName = `${event.id}-${guest.qrToken}.jpg`;
  const outPath = path.join(OUTPUT_DIR, fileName);

  await sharp(background)
    .composite([
      { input: overlay, top: 0, left: 0 },
      { input: qrBuffer, top: layout.qrPositionY, left: layout.qrPositionX },
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(outPath);

  return `/generated-cards/${fileName}`;
}

async function deleteCardFile(generatedCardUrl) {
  if (!generatedCardUrl) return;
  try {
    await fs.unlink(path.join(PUBLIC_DIR, path.normalize(generatedCardUrl)));
  } catch (_) {
    /* already gone */
  }
}

module.exports = {
  generateCard,
  deleteCardFile,
  verificationUrl,
  cardPageUrl,
  appUrl,
  CARD_W,
  CARD_H,
  QR_SIZE,
  DEFAULT_LAYOUT,
};
