// Fabrique les images du widget Android : le vrai renard 3D dans chaque humeur, éveillé et somnolent (nuit).
// Prérequis : le serveur de dev tourne (npm run dev) et puppeteer-core est disponible.
// Usage : node tools/render-widget.mjs [cheminVersPuppeteerCore] [cheminVersChrome]
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const puppeteer = require(process.argv[2] || 'puppeteer-core');
const chrome = process.argv[3] || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const base = process.env.DEV_URL || 'http://localhost:5173';
const out = path.resolve('android/app/src/main/res/drawable-nodpi');
const MOODS = ['creux', 'grisaille', 'equilibre', 'elan', 'emballement'];
// Décalage du carré vers la gauche (en part de son côté) pour que le renard tombe au milieu
const SHIFT = 0.15;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('Erreur dans la page :', e.message));
  // 565 px de large → scène de 533 × 400 px ; × 1,2 = images carrées de 480 px
  await page.setViewport({ width: 565, height: 900, deviceScaleFactor: 1.2 });
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.waitForFunction('!!window.__foxScene', { timeout: 90000 });
  // Scène un peu large, sans coins arrondis (le widget arrondit lui-même) : on y découpe un carré
  // recentré sur le renard, qui est vu de trois quarts et paraît décalé vers la gauche sinon.
  await page.addStyleTag({ content: '.stage{height:auto!important;aspect-ratio:4/3;border-radius:0!important}' });
  await wait(1500);
  for (const mood of MOODS) {
    await page.evaluate((m) => {
      window.__foxScene.setDrowsy(0);
      window.__foxScene.setMood(m);
    }, mood);
    await wait(4500);
    for (const night of [false, true]) {
      await page.evaluate((n) => window.__foxScene.setDrowsy(n ? 1 : 0), night);
      // Attendre qu'il ne fasse pas un geste (saut, salto…) au moment de la photo
      await page.waitForFunction('window.__foxScene.busy === null', { timeout: 30000, polling: 100 });
      await wait(700);
      const file = path.join(out, `fox_${mood}${night ? '_nuit' : ''}.webp`);
      const box = await (await page.$('.stage')).boundingBox();
      const side = box.height;
      const x = box.x + (box.width - side) / 2 - side * SHIFT;
      await page.screenshot({ path: file, type: 'webp', quality: 86, clip: { x, y: box.y, width: side, height: side } });
      console.log('OK', path.relative(process.cwd(), file));
    }
  }
} finally {
  await browser.close();
}
