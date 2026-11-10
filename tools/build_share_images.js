// Draw the link-preview images that WhatsApp, Facebook, X, LinkedIn and others show when someone shares getfitdaily.co.za
// (brand guide: reversed logo, volt plate with chalk letters on ink; Archivo 900 + Figtree).
//
// Usage:  node tools/build_share_images.js      (needs Playwright's Chromium and the internet for the fonts)
// Writes icons/share-card.png (1200x630, the big card) and icons/share-square.png (600x600, the small square that
// WhatsApp shows in chats). Both stay well under WhatsApp's ~300 KB limit. The og: tags live in tools/build_pages.py.
// Run it again only if the logo or tagline changes; the PNGs are checked in.
const path = require('path');
const { chromium } = require('playwright');

const VOLT = '#D4FF3A', INK = '#0D0F12', CHALK = '#F3F2EC', SURF = '#171A1F';
const OUT = path.join(__dirname, '..', 'icons');
const FONT = '<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,900&family=Figtree:wght@500;700&display=block" rel="stylesheet">';
// reversed logo from the brand guide
const PLATE = size => `<svg viewBox="0 0 100 100" width="${size}" height="${size}"><circle cx="50" cy="50" r="44" fill="none" stroke="${VOLT}" stroke-width="9"/><circle cx="50" cy="50" r="34" fill="none" stroke="${CHALK}" stroke-opacity=".3" stroke-width="1.5"/><text x="50" y="60" text-anchor="middle" font-family="Archivo" font-weight="900" font-size="30" style="font-stretch:70%" fill="${CHALK}">GFD</text></svg>`;
const BASE = `html,body{margin:0}body{background:${INK};color:${CHALK};font-family:Figtree,sans-serif;overflow:hidden;position:relative}
.name{font-family:Archivo;font-weight:900;font-stretch:72%;line-height:.9;text-transform:uppercase;letter-spacing:-.01em}
.tag{color:${VOLT};font-weight:700;text-transform:uppercase;letter-spacing:.22em}
.glow{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(212,255,58,.16),rgba(212,255,58,0) 65%)}`;

const CARDS = [
  { file: 'share-card.png', w: 1200, h: 630, html: `
    <div class="glow" style="width:900px;height:900px;left:-260px;top:-135px"></div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:14px;background:${VOLT}"></div>
    <div style="position:absolute;left:110px;top:115px">${PLATE(400)}</div>
    <div style="position:absolute;left:580px;top:150px;right:60px">
      <div class="name" style="font-size:132px">Get Fit<br>Daily</div>
      <div class="tag" style="font-size:25px;margin-top:26px">Great Form and Discipline</div>
      <div style="font-size:29px;font-weight:500;margin-top:30px;color:#C9C8C1;line-height:1.3">Plan, log and track your workouts.</div>
    </div>
    <div style="position:absolute;left:580px;bottom:50px;font-size:24px;font-weight:700;color:${VOLT};letter-spacing:.04em">getfitdaily.co.za</div>` },
  { file: 'share-square.png', w: 600, h: 600, html: `
    <div class="glow" style="width:640px;height:640px;left:-20px;top:-80px"></div>
    <div style="position:absolute;left:0;right:0;top:56px;text-align:center">${PLATE(300)}</div>
    <div class="name" style="position:absolute;left:0;right:0;top:384px;text-align:center;font-size:78px">Get Fit Daily</div>
    <div class="tag" style="position:absolute;left:0;right:0;top:478px;text-align:center;font-size:21px">Great Form and Discipline</div>` },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const c of CARDS) {
    await page.setViewportSize({ width: c.w, height: c.h });
    await page.setContent(`<!doctype html><html><head>${FONT}<style>${BASE}</style></head><body style="width:${c.w}px;height:${c.h}px">${c.html}</body></html>`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, c.file) });
  }
  await browser.close();
  console.log('share images written to icons/');
})();
