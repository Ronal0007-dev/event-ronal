'use strict';
/**
 * Modular SMS + WhatsApp dispatcher.
 *
 * Every provider is a small function: (args) => Promise<{ ok: boolean, response: any }>
 * Add a new gateway by writing one function and registering it in SMS_PROVIDERS / WHATSAPP_PROVIDERS.
 * Select providers with SMS_PROVIDER / WHATSAPP_PROVIDER in .env ("log" = dry-run, nothing is sent).
 *
 * NOTE: request shapes follow each vendor's public docs at the time of writing.
 * Always confirm them against your own account's current docs before going live.
 */
const { toE164 } = require('../utils/phone');
const { formatEventDate, formatEventTime } = require('../utils/format');
const { appUrl, cardPageUrl } = require('./cardGeneratorService');

const REQUEST_TIMEOUT_MS = 20000;

async function httpRequest(url, { method = 'POST', headers = {}, body, form } = {}) {
  const init = { method, headers: { ...headers }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
  if (form) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

const basicAuth = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

/* ------------------------------------------------------------------ */
/* SMS providers  ({ to: "255712345678", message })                    */
/* ------------------------------------------------------------------ */
const SMS_PROVIDERS = {
  // Dry-run: logs to the console, always succeeds. Safe default for development.
  log: async ({ to, message }) => {
    console.log(`[SMS:log] -> ${to}: ${message}`);
    return { ok: true, response: { dryRun: true } };
  },

  // NextSMS (messaging-service.co.tz) - Basic auth, JSON body
  nextsms: async ({ to, message }) => {
    const { NEXTSMS_USERNAME, NEXTSMS_PASSWORD, NEXTSMS_SENDER_ID } = process.env;
    const r = await httpRequest('https://messaging-service.co.tz/api/sms/v1/text/single', {
      headers: { Authorization: basicAuth(NEXTSMS_USERNAME, NEXTSMS_PASSWORD), Accept: 'application/json' },
      body: { from: NEXTSMS_SENDER_ID || 'NEXTSMS', to, text: message },
    });
    return { ok: r.ok, response: r.data };
  },

  // Beem Africa - Basic auth (api_key:secret_key), JSON body
  beem: async ({ to, message }) => {
    const { BEEM_API_KEY, BEEM_SECRET_KEY, BEEM_SENDER_ID } = process.env;
    const r = await httpRequest('https://apisms.beem.africa/v1/send', {
      headers: { Authorization: basicAuth(BEEM_API_KEY, BEEM_SECRET_KEY) },
      body: {
        source_addr: BEEM_SENDER_ID || 'INFO',
        schedule_time: '',
        encoding: 0,
        message,
        recipients: [{ recipient_id: 1, dest_addr: to }],
      },
    });
    const accepted = r.ok && (r.data?.successful === true || r.data?.code === 100 || r.data?.valid > 0);
    return { ok: Boolean(accepted), response: r.data };
  },

  // Briq (karibu.briq.tz) - X-API-Key header, JSON body
  briq: async ({ to, message }) => {
    const { BRIQ_API_KEY, BRIQ_SENDER_ID } = process.env;
    const r = await httpRequest('https://karibu.briq.tz/v1/message/send-instant', {
      headers: { 'X-API-Key': BRIQ_API_KEY },
      body: { content: message, recipients: [to], sender_id: BRIQ_SENDER_ID },
    });
    return { ok: r.ok && r.data?.success !== false, response: r.data };
  },
};

/* ------------------------------------------------------------------ */
/* WhatsApp providers  ({ to, imageUrl, caption })                     */
/* imageUrl must be publicly reachable => APP_URL must be a real domain */
/* ------------------------------------------------------------------ */
const WHATSAPP_PROVIDERS = {
  log: async ({ to, imageUrl, caption }) => {
    console.log(`[WA:log] -> ${to}\n  image: ${imageUrl}\n  caption: ${caption.replace(/\n/g, ' | ')}`);
    return { ok: true, response: { dryRun: true } };
  },

  // Meta WhatsApp Cloud API.
  // Free-form image messages only reach users who messaged you in the last 24h.
  // For cold outreach, set WHATSAPP_CLOUD_TEMPLATE to an approved template with an IMAGE header
  // and one body variable (guest name); it is sent instead of a free-form message.
  cloudapi: async ({ to, imageUrl, caption, guestName }) => {
    const { WHATSAPP_CLOUD_TOKEN, WHATSAPP_CLOUD_PHONE_ID, WHATSAPP_CLOUD_TEMPLATE, WHATSAPP_CLOUD_TEMPLATE_LANG } =
      process.env;
    const version = process.env.WHATSAPP_CLOUD_API_VERSION || 'v21.0';

    const payload = WHATSAPP_CLOUD_TEMPLATE
      ? {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: WHATSAPP_CLOUD_TEMPLATE,
            language: { code: WHATSAPP_CLOUD_TEMPLATE_LANG || 'en' },
            components: [
              { type: 'header', parameters: [{ type: 'image', image: { link: imageUrl } }] },
              { type: 'body', parameters: [{ type: 'text', text: guestName }] },
            ],
          },
        }
      : { messaging_product: 'whatsapp', to, type: 'image', image: { link: imageUrl, caption } };

    const r = await httpRequest(`https://graph.facebook.com/${version}/${WHATSAPP_CLOUD_PHONE_ID}/messages`, {
      headers: { Authorization: `Bearer ${WHATSAPP_CLOUD_TOKEN}` },
      body: payload,
    });
    return { ok: r.ok && Boolean(r.data?.messages?.length), response: r.data };
  },

  // Twilio WhatsApp (sandbox or approved sender)
  twilio: async ({ to, imageUrl, caption }) => {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = process.env;
    const r = await httpRequest(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      headers: { Authorization: basicAuth(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) },
      form: { From: `whatsapp:${TWILIO_WHATSAPP_FROM}`, To: `whatsapp:${toE164(to)}`, Body: caption, MediaUrl: imageUrl },
    });
    return { ok: r.ok && !r.data?.error_code, response: r.data };
  },

  // UltraMsg
  ultramsg: async ({ to, imageUrl, caption }) => {
    const { ULTRAMSG_INSTANCE_ID, ULTRAMSG_TOKEN } = process.env;
    const r = await httpRequest(`https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/image`, {
      form: { token: ULTRAMSG_TOKEN, to: toE164(to), image: imageUrl, caption },
    });
    const sent = r.ok && (r.data?.sent === 'true' || r.data?.sent === true) && !r.data?.error;
    return { ok: Boolean(sent), response: r.data };
  },
};

/* Text-only WhatsApp messages are separate because thank-you messages do not include card media. */
const WHATSAPP_TEXT_PROVIDERS = {
  log: async ({ to, message }) => {
    console.log(`[WA:log] -> ${to}: ${message}`);
    return { ok: true, response: { dryRun: true } };
  },

  cloudapi: async ({ to, message }) => {
    const { WHATSAPP_CLOUD_TOKEN, WHATSAPP_CLOUD_PHONE_ID } = process.env;
    const version = process.env.WHATSAPP_CLOUD_API_VERSION || 'v21.0';
    const r = await httpRequest(`https://graph.facebook.com/${version}/${WHATSAPP_CLOUD_PHONE_ID}/messages`, {
      headers: { Authorization: `Bearer ${WHATSAPP_CLOUD_TOKEN}` },
      body: { messaging_product: 'whatsapp', to, type: 'text', text: { body: message } },
    });
    return { ok: r.ok && Boolean(r.data?.messages?.length), response: r.data };
  },

  twilio: async ({ to, message }) => {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = process.env;
    const r = await httpRequest(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      headers: { Authorization: basicAuth(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) },
      form: { From: `whatsapp:${TWILIO_WHATSAPP_FROM}`, To: `whatsapp:${toE164(to)}`, Body: message },
    });
    return { ok: r.ok && !r.data?.error_code, response: r.data };
  },

  ultramsg: async ({ to, message }) => {
    const { ULTRAMSG_INSTANCE_ID, ULTRAMSG_TOKEN } = process.env;
    const r = await httpRequest(`https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`, {
      form: { token: ULTRAMSG_TOKEN, to: toE164(to), body: message },
    });
    const sent = r.ok && (r.data?.sent === 'true' || r.data?.sent === true) && !r.data?.error;
    return { ok: Boolean(sent), response: r.data };
  },
};

/* ------------------------------------------------------------------ */
/* Message builders                                                    */
/* ------------------------------------------------------------------ */
function buildMessages(guest, event) {
  const lang = (process.env.MESSAGE_LANG || 'sw').toLowerCase();
  const date = formatEventDate(event.eventDate);
  const time = formatEventTime(event.eventDate);
  const link = cardPageUrl(guest.qrToken);
  const maps = event.mapsLink ? `\n${event.mapsLink}` : '';
  const admits = guest.cardType === 'Double' ? 2 : 1;

  if (lang === 'en') {
    return {
      sms: `Dear ${guest.guestName}, you are invited to ${event.eventName} on ${date}, ${time} hrs at ${event.venue}. Your ${guest.cardType} card (admits ${admits}): ${link}`,
      whatsapp:
        `Dear *${guest.guestName}*,\nYou are warmly invited to *${event.eventName}*.\n\n` +
        `📅 ${date}, ${time} hrs\n📍 ${event.venue}${maps}\n🎫 ${guest.cardType} card (admits ${admits})\n\n` +
        `Please present the QR code on this card at the entrance. Thank you!`,
    };
  }
  return {
    sms: `Ndugu ${guest.guestName}, unakaribishwa ${event.eventName} tarehe ${date}, saa ${time} katika ${event.venue}. Kadi yako (${guest.cardType === 'Double' ? 'Double - watu 2' : 'Single - mtu 1'}): ${link}`,
    whatsapp:
      `Ndugu *${guest.guestName}*,\nUnakaribishwa kwa heshima kubwa katika *${event.eventName}*.\n\n` +
      `📅 ${date}, saa ${time}\n📍 ${event.venue}${maps}\n🎫 Kadi ${guest.cardType === 'Double' ? 'Double (watu 2)' : 'Single (mtu 1)'}\n\n` +
      `Tafadhali onyesha QR code kwenye kadi hii mlangoni. Karibu sana!`,
  };
}

function providerName(channel) {
  return channel === 'SMS'
    ? (process.env.SMS_PROVIDER || 'log').toLowerCase()
    : (process.env.WHATSAPP_PROVIDER || 'log').toLowerCase();
}

/**
 * Send one message on one channel. Never throws: failures are returned as { ok:false }.
 * @returns {Promise<{ ok: boolean, provider: string, response: any }>}
 */
async function send(channel, guest, event) {
  const name = providerName(channel);
  const registry = channel === 'SMS' ? SMS_PROVIDERS : WHATSAPP_PROVIDERS;
  const provider = registry[name];
  if (!provider) {
    return { ok: false, provider: name, response: { error: `Unknown ${channel} provider "${name}"` } };
  }

  const messages = buildMessages(guest, event);
  try {
    const result =
      channel === 'SMS'
        ? await provider({ to: guest.phoneNumber, message: messages.sms })
        : await provider({
            to: guest.phoneNumber,
            imageUrl: `${appUrl()}${guest.generatedCardUrl}`,
            caption: messages.whatsapp,
            guestName: guest.guestName,
          });
    return { ok: Boolean(result.ok), provider: name, response: result.response };
  } catch (err) {
    return { ok: false, provider: name, response: { error: err.name === 'TimeoutError' ? 'Request timed out' : err.message } };
  }
}

async function sendText(channel, to, message) {
  const name = providerName(channel);
  const registry = channel === 'SMS' ? SMS_PROVIDERS : WHATSAPP_TEXT_PROVIDERS;
  const provider = registry[name];
  if (!provider) {
    return { ok: false, provider: name, response: { error: `Unknown ${channel} provider "${name}"` } };
  }

  try {
    const result = await provider({ to, message });
    return { ok: Boolean(result.ok), provider: name, response: result.response };
  } catch (err) {
    return { ok: false, provider: name, response: { error: err.name === 'TimeoutError' ? 'Request timed out' : err.message } };
  }
}

module.exports = { send, sendText, buildMessages, SMS_PROVIDERS, WHATSAPP_PROVIDERS, providerName };
