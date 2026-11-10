// Draw the Android app icons from the GFD logo (brand guide: volt #D4FF3A, ink #0D0F12, plate ring + "GFD" in Archivo 900).
//
// Usage:  node tools/build_android_icons.js      (needs Playwright's Chromium and the internet for the Archivo font)
// Writes PNGs into android/app/src/main/res/: launcher icons (legacy square, round, adaptive foreground, which also
// serves as the themed monochrome icon), the notification icon (white on transparent) and the Android 12+ splash icon.
// Run it again only if the logo changes; the PNGs are checked in.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const VOLT = '#D4FF3A', INK = '#0D0F12';
const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const FONT = '<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,900&display=block" rel="stylesheet">';
const TEXT = c => `<text x="50" y="60" text-anchor="middle" font-family="Archivo" font-weight="900" font-size="30" style="font-stretch:70%" fill="${c}">GFD</text>`;

// each icon: a 100x100 drawing placed on a canvas of `dp` density-independent pixels
const ICONS = [
  // legacy launcher (Android 7): the app icon from the brand guide
  { file: 'mipmap-{d}/ic_launcher.png', dp: 48, svg: `<rect width="100" height="100" rx="22" fill="${VOLT}"/><circle cx="50" cy="50" r="37" fill="none" stroke="${INK}" stroke-width="8"/>${TEXT(INK)}` },
  { file: 'mipmap-{d}/ic_launcher_round.png', dp: 48, svg: `<circle cx="50" cy="50" r="50" fill="${VOLT}"/><circle cx="50" cy="50" r="37" fill="none" stroke="${INK}" stroke-width="8"/>${TEXT(INK)}` },
  // adaptive foreground: 108dp canvas, the ring kept inside the 66dp safe circle (scale 0.62 of the canvas)
  { file: 'mipmap-{d}/ic_launcher_foreground.png', dp: 108, scale: 0.62, svg: `<circle cx="50" cy="50" r="44" fill="none" stroke="${INK}" stroke-width="9"/>${TEXT(INK)}` },
  // notification: white silhouette only (Android tints it)
  { file: 'drawable-{d}/ic_stat_gfd.png', dp: 24, scale: 0.92, svg: `<circle cx="50" cy="50" r="44" fill="none" stroke="#fff" stroke-width="10"/>${TEXT('#fff')}` },
  // splash (Android 12+): 288dp canvas, the icon inside the 192dp circle on the ink background
  { file: 'drawable-{d}/splash_icon.png', dp: 288, scale: 0.6, svg: `<circle cx="50" cy="50" r="50" fill="${VOLT}"/><circle cx="50" cy="50" r="37" fill="none" stroke="${INK}" stroke-width="8"/>${TEXT(INK)}` },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let n = 0;
  for (const ic of ICONS) {
    for (const [d, k] of Object.entries(DENS)) {
      const px = Math.round(ic.dp * k), inner = Math.round(px * (ic.scale || 1)), off = Math.round((px - inner) / 2);
      await page.setViewportSize({ width: px, height: px });
      await page.setContent(`<!doctype html><html><head>${FONT}<style>html,body{margin:0;background:transparent}svg{position:absolute;left:${off}px;top:${off}px}</style></head>
        <body><svg width="${inner}" height="${inner}" viewBox="0 0 100 100">${ic.svg}</svg></body></html>`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const out = path.join(RES, ic.file.replace('{d}', d));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await page.screenshot({ path: out, omitBackground: true });
      n++;
    }
  }
  await browser.close();
  console.log(n + ' icons written to android/app/src/main/res');
})();
