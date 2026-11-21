'use strict';
/**
 * Renders one sample card per occasion with the real card generator, for the landing page.
 * Output: public/img/showcase/<category>.jpg   (re-run after changing designs:  npm run showcase)
 */
process.env.APP_URL = 'https://yourdomain.com';
const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');
const { generateCard } = require('../services/cardGeneratorService');
const { DESIGNS } = require('../services/templateDesigns');

const OUT = path.join(__dirname, '..', 'public', 'img', 'showcase');
const when = (iso) => new Date(`${iso}+03:00`);

const SAMPLES = {
  birthday: { design: 'birthday-confetti', color: '#e4572e', event: "Asha's 30th Birthday", guest: 'Baraka Mwita', venue: 'Slipway, Msasani, Dar es Salaam', date: '2026-12-19T18:00' },
  wedding: { design: 'wedding-arch', color: '#b4455f', event: "Juma & Neema's Wedding", guest: 'Mama Zawadi', venue: 'Mlimani City Hall, Dar es Salaam', date: '2026-12-12T16:00', type: 'Double' },
  anniversary: { design: 'anniversary-deco', color: '#c9a227', event: 'Mushi Family 25th Anniversary', guest: 'Mzee Peter Mushi', venue: 'Kilimanjaro Hotel, Arusha', date: '2026-12-27T19:00', type: 'Double' },
  engagement: { design: 'engagement-rings', color: '#c46a3a', event: 'Amani & Rehema Engagement', guest: 'Dada Joyce', venue: 'Njiro Gardens, Arusha', date: '2026-11-28T15:00' },
  'baby-shower': { design: 'baby-shower-bunting', color: '#4f9a89', event: "Baby Tumaini's Shower", guest: 'Shangazi Rose', venue: 'Mikocheni B, Dar es Salaam', date: '2026-12-05T14:00' },
  'bridal-shower': { design: 'bridal-shower-scallop', color: '#d4688a', event: "Neema's Kitchen Party", guest: 'Mama Asha', venue: 'Sea Cliff Courtyard, Dar es Salaam', date: '2026-11-29T15:30' },
  'retirement-farewell': { design: 'retirement-farewell-sunset', color: '#d9801f', event: "Mzee Salim's Retirement", guest: 'Mwalimu Hamisi', venue: 'Dodoma Secondary School Hall', date: '2026-12-10T11:00' },
  graduation: { design: 'graduation-cap', color: '#1f6f50', event: 'Mahafali — Class of 2026', guest: 'Grace Mollel', venue: 'UDOM Main Campus, Dodoma', date: '2026-12-18T10:00' },
  'send-off': { design: 'send-off-plane', color: '#178c8c', event: "Grace's Send-off", guest: 'Kaka Emmanuel', venue: 'Mwanza Gymkhana Club', date: '2026-12-13T17:00' },
  confirmation: { design: 'confirmation-evening', color: '#c9a227', event: 'Kipaimara ya Daudi', guest: 'Familia ya Kimaro', venue: 'Parokia ya Mt. Joseph, Moshi', date: '2026-12-06T09:30', type: 'Double' },
};

(async () => {
  await fs.mkdir(OUT, { recursive: true });
  for (const [category, s] of Object.entries(SAMPLES)) {
    const template = { designKey: s.design, qrPositionX: 390, qrPositionY: 1040, namePositionX: 540, namePositionY: 700 };
    const event = { id: 'demo', category, eventName: s.event, eventDate: when(s.date), venue: s.venue, accentColor: s.color, customBackgroundUrl: null };
    const guest = { guestName: s.guest, cardType: s.type || 'Single', qrToken: `sample-${category}` };
    const url = await generateCard({ guest, event, template });
    const file = path.join(__dirname, '..', 'public', url);
    await sharp(file).resize(600, 833).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(OUT, `${category}.jpg`));
    await fs.unlink(file);
    console.log('showcase', category);
  }
  console.log(`${DESIGNS.length} designs available.`);
})().catch((e) => { console.error(e); process.exit(1); });
