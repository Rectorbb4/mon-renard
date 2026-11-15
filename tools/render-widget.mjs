// Fabrique les images animées du widget Android : le vrai renard 3D, sans fond (seule son ombre reste),
// en boucle dans chaque humeur, éveillé et somnolent (nuit).
// Prérequis : le serveur de dev tourne (npm run dev) et puppeteer-core est disponible.
// Usage : node tools/render-widget.mjs [cheminVersPuppeteerCore] [cheminVersChrome]
//
// Ce qu'il écrit dans android/app/src/main/res/ :
//   drawable-nodpi/fox_<humeur>_00 … _15.webp   la boucle de repos (16 images)
//   drawable-nodpi/fox_<humeur>_cligne_1, _2    deux images où il cligne des yeux
//   drawable-nodpi/fox_<humeur>_nuit_0 … _7     la boucle de nuit, yeux mi-clos (8 images)
//   values/widget_anim.xml                      la vitesse de chaque boucle
//   layout/widget_fox.xml                       le ViewFlipper qui fait défiler les images (32 cases)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const puppeteer = require(process.argv[2] || 'puppeteer-core');
const chrome = process.argv[3] || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const base = process.env.DEV_URL || 'http://localhost:5173';
const res = path.resolve('android/app/src/main/res');
const out = path.join(res, 'drawable-nodpi');
const MOODS = ['creux', 'grisaille', 'equilibre', 'elan', 'emballement'];

// Doit rester d'accord avec FoxWidget.java
const FRAMES = 16; // images par tour de la boucle de repos
const SLOTS = FRAMES * 2; // cases du ViewFlipper : deux tours, il ne cligne qu'au second
const BLINK_AT = 9; // image du second tour remplacée par le clignement (et la suivante)
const NIGHT = 8; // images de la boucle de nuit, montrées deux fois chacune
const NIGHT_MS = 190;
const SIZE = 420; // côté des images, en pixels
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const speeds = {};
let bytes = 0;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('Erreur dans la page :', e.message));
  // Grande scène (720 × 540 px, × 1,5) : chaque image est gardée entière, puis toutes sont découpées
  // pareil, au plus près du renard (sinon il changerait de taille ou de place d'une humeur à l'autre).
  await page.setViewport({ width: 752, height: 1200, deviceScaleFactor: 1.5 });
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.waitForFunction('!!window.__foxScene', { timeout: 90000 });
  await page.addStyleTag({ content: '.stage{height:auto!important;aspect-ratio:4/3;border-radius:0!important}' });
  await page.evaluate(() => (window.__frames = []));
  await wait(1500);

  // Dessine une image et la met de côté, en entier
  const shoot = (name, phase, blink, drowsy) =>
    page.evaluate(
      ({ name, phase, blink, drowsy }) => {
        const s = window.__foxScene;
        s.setDrowsy(drowsy);
        s.widgetFrame(phase, blink);
        const c = document.createElement('canvas');
        c.width = s.canvas.width;
        c.height = s.canvas.height;
        c.getContext('2d').drawImage(s.canvas, 0, 0);
        window.__frames.push({ name, c });
      },
      { name, phase, blink, drowsy }
    );

  for (const mood of MOODS) {
    await page.evaluate((m) => {
      const s = window.__foxScene;
      s.setWidgetMode(false);
      s.setDrowsy(0);
      s.setMood(m);
    }, mood);
    // Laisser passer le changement de posture (assis ↔ debout) et les gestes en cours
    await wait(4500);
    await page.waitForFunction('window.__foxScene.busy === null', { timeout: 30000, polling: 100 });
    const loop = await page.evaluate(() => {
      window.__foxScene.setWidgetMode(true);
      return window.__foxScene.widgetLoopSeconds();
    });
    // Ni trop lent ni trop rapide pour l'écran d'accueil : entre 110 et 220 ms par image
    speeds[mood] = Math.round(Math.min(220, Math.max(110, (loop * 1000) / FRAMES)));

    for (let i = 0; i < FRAMES; i++) await shoot(`fox_${mood}_${String(i).padStart(2, '0')}`, i / FRAMES, 0, 0);
    await shoot(`fox_${mood}_cligne_1`, BLINK_AT / FRAMES, 1, 0);
    await shoot(`fox_${mood}_cligne_2`, (BLINK_AT + 1) / FRAMES, 0.45, 0);
    for (let i = 0; i < NIGHT; i++) await shoot(`fox_${mood}_nuit_${i}`, i / NIGHT, 0, 1);
    console.log(`OK ${mood} : boucle de ${loop.toFixed(2)} s, ${speeds[mood]} ms par image`);
  }

  // Le cadre commun : la zone occupée par le renard sur toutes les images, en carré.
  // L'ombre (à demi transparente) ne compte pas, sinon elle tirerait le cadre sur le côté.
  const files = await page.evaluate((size) => {
    const box = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 };
    for (const { c } of window.__frames) {
      const { data, width, height } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] < 160) continue;
          if (x < box.x0) box.x0 = x;
          if (x > box.x1) box.x1 = x;
          if (y < box.y0) box.y0 = y;
          if (y > box.y1) box.y1 = y;
        }
      }
    }
    const side = Math.max(box.x1 - box.x0, box.y1 - box.y0) * 1.08;
    const x = (box.x0 + box.x1) / 2 - side / 2;
    const y = box.y1 + side * 0.05 - side; // posé en bas du cadre, avec un peu de place pour l'ombre
    return window.__frames.map(({ name, c }) => {
      const o = document.createElement('canvas');
      o.width = o.height = size;
      const g = o.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(c, x, y, side, side, 0, 0, size, size);
      // Bords fondus : si un bout d'ombre dépasse, pas de trait net sur le fond d'écran
      g.globalCompositeOperation = 'destination-in';
      for (const [x0, y0, x1, y1] of [[0, 0, size, 0], [size, 0, 0, 0]]) {
        const fade = g.createLinearGradient(x0, y0, x1, y1);
        fade.addColorStop(0, 'rgba(0,0,0,0)');
        fade.addColorStop(0.06, 'rgba(0,0,0,1)');
        fade.addColorStop(1, 'rgba(0,0,0,1)');
        g.fillStyle = fade;
        g.fillRect(0, 0, size, size);
      }
      return [name, o.toDataURL('image/webp', 0.82)];
    });
  }, SIZE);
  for (const [name, dataUrl] of files) {
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    bytes += buf.length;
    fs.writeFileSync(path.join(out, `${name}.webp`), buf);
  }
} finally {
  await browser.close();
}

// Anciennes images fixes (une par humeur), remplacées par les boucles
for (const mood of MOODS) {
  for (const old of [`fox_${mood}.webp`, `fox_${mood}_nuit.webp`]) fs.rmSync(path.join(out, old), { force: true });
}

const ints = MOODS.map((m) => `    <integer name="fox_${m}_ms">${speeds[m]}</integer>`).join('\n');
fs.writeFileSync(
  path.join(res, 'values/widget_anim.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Écrit par tools/render-widget.mjs : vitesse des boucles du widget (millisecondes par image). -->
<resources>
${ints}
    <integer name="fox_night_ms">${NIGHT_MS}</integer>
    <integer name="fox_frames">${FRAMES}</integer>
    <integer name="fox_blink_at">${BLINK_AT}</integer>
    <integer name="fox_night_frames">${NIGHT}</integer>
</resources>
`
);

const slots = Array.from(
  { length: SLOTS },
  (_, i) => `    <ImageView
        android:id="@+id/f${String(i).padStart(2, '0')}"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:scaleType="fitCenter"
        android:src="@drawable/fox_equilibre_${String(i % FRAMES).padStart(2, '0')}" />`
).join('\n');
fs.writeFileSync(
  path.join(res, 'layout/widget_fox.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Écrit par tools/render-widget.mjs : le renard animé, image par image (FoxWidget.java choisit les images). -->
<ViewFlipper xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/fox"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:autoStart="true"
    android:flipInterval="${speeds.equilibre}"
    android:importantForAccessibility="yes">
${slots}
</ViewFlipper>
`
);
console.log(`Images : ${(bytes / 1024 / 1024).toFixed(1)} Mo en tout`);
