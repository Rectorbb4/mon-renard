// Fabrique les animations du widget Android : le vrai renard 3D, sans fond (seule son ombre reste),
// en boucle fluide dans chaque humeur, éveillé et somnolent (nuit).
// Prérequis : le serveur de dev tourne (npm run dev) et puppeteer-core est disponible.
// Usage : node tools/render-widget.mjs [cheminVersPuppeteerCore] [cheminVersChrome]
//
// Ce qu'il écrit dans android/app/src/main/res/ :
//   drawable-nodpi/fox_<humeur>_jour.webp, _soir.webp   les boucles, en WebP animé
//   drawable/fox_anim_<humeur>.xml, _nuit.xml           ce qui les fait jouer dans le widget
//   drawable-nodpi/fox_preview.webp                     l'aperçu dans la liste des widgets
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const puppeteer = require(process.argv[2] || 'puppeteer-core');
const chrome = process.argv[3] || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const base = process.env.DEV_URL || 'http://localhost:5173';
const res = path.resolve('android/app/src/main/res');
const nodpi = path.join(res, 'drawable-nodpi');
const drawable = path.join(res, 'drawable');
const MOODS = ['creux', 'grisaille', 'equilibre', 'elan', 'emballement'];

const FPS = 24;
const NIGHT_FPS = 16;
const NIGHT_SECONDS = 3;
/** Une boucle trop longue paraîtrait figée sur l'écran d'accueil. */
const MAX_LOOP_SECONDS = 3.5;
/** Il cligne une fois tous les deux tours quand le tour est court. */
const SHORT_LOOP_SECONDS = 2.5;
const BLINK_SECONDS = 0.2;
const SIZE = 384; // côté des images, en pixels
const QUALITY = 0.8;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ WebP animé

/** Les morceaux d'un fichier WebP : [{ id, data }]. */
function chunks(file) {
  const out = [];
  for (let at = 12; at + 8 <= file.length; ) {
    const size = file.readUInt32LE(at + 4);
    out.push({ id: file.toString('latin1', at, at + 4), data: file.subarray(at + 8, at + 8 + size) });
    at += 8 + size + (size & 1);
  }
  return out;
}

function chunk(id, data) {
  const head = Buffer.alloc(8);
  head.write(id, 0, 'latin1');
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat(data.length & 1 ? [head, data, Buffer.alloc(1)] : [head, data]);
}

const uint24 = (b, at, v) => b.writeUIntLE(v, at, 3);

/** Assemble des images WebP de même taille en une boucle infinie ; chaque image remplace la précédente. */
function animatedWebp(frames, size, ms) {
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x12; // transparence + animation
  uint24(vp8x, 4, size - 1);
  uint24(vp8x, 7, size - 1);
  const anim = Buffer.alloc(6); // fond transparent, répétition infinie
  const parts = [chunk('VP8X', vp8x), chunk('ANIM', anim)];
  for (const frame of frames) {
    const head = Buffer.alloc(16);
    uint24(head, 6, size - 1);
    uint24(head, 9, size - 1);
    uint24(head, 12, ms);
    head[15] = 0x02; // sans mélange : les zones devenues transparentes le restent
    // Seulement l'image : Chrome ajoute un profil de couleur (ICCP), interdit à l'intérieur d'une animation
    const image = chunks(frame).filter((c) => ['ALPH', 'VP8 ', 'VP8L'].includes(c.id)).map((c) => chunk(c.id, c.data));
    parts.push(chunk('ANMF', Buffer.concat([head, ...image])));
  }
  const body = Buffer.concat(parts);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'latin1');
  riff.writeUInt32LE(body.length + 4, 4);
  riff.write('WEBP', 8, 'latin1');
  return Buffer.concat([riff, body]);
}

// ------------------------------------------------------------------ rendu

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  protocolTimeout: 600000,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
let bytes = 0;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('Erreur dans la page :', e.message));
  // Grande scène (720 × 540 px, × 1,5), puis toutes les images sont découpées pareil, au plus près du renard
  // (sinon il changerait de taille ou de place d'une humeur à l'autre).
  await page.setViewport({ width: 752, height: 1200, deviceScaleFactor: 1.5 });
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.waitForFunction('!!window.__foxScene', { timeout: 90000 });
  await page.addStyleTag({ content: '.stage{height:auto!important;aspect-ratio:4/3;border-radius:0!important}' });
  await wait(1500);

  const enterMood = async (mood) => {
    await page.evaluate((m) => {
      const s = window.__foxScene;
      s.setWidgetMode(false);
      s.setDrowsy(0);
      s.setMood(m);
    }, mood);
    // Laisser passer le changement de posture (assis ↔ debout) et les gestes en cours
    await wait(4500);
    await page.waitForFunction('window.__foxScene.busy === null', { timeout: 30000, polling: 100 });
    return page.evaluate(() => {
      window.__foxScene.setWidgetMode(true);
      return window.__foxScene.widgetLoopSeconds();
    });
  };

  // 1er passage : le cadre commun, la zone occupée par le renard dans toutes les humeurs.
  // L'ombre (à demi transparente) ne compte pas, sinon elle tirerait le cadre sur le côté.
  await page.evaluate(() => (window.__box = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 }));
  for (const mood of MOODS) {
    await enterMood(mood);
    await page.evaluate(() => {
      const s = window.__foxScene;
      const box = window.__box;
      const measure = (phase, blink, drowsy) => {
        s.setDrowsy(drowsy);
        s.widgetFrame(phase, blink);
        const c = document.createElement('canvas');
        c.width = s.canvas.width;
        c.height = s.canvas.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(s.canvas, 0, 0);
        const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] < 160) continue;
            if (x < box.x0) box.x0 = x;
            if (x > box.x1) box.x1 = x;
            if (y < box.y0) box.y0 = y;
            if (y > box.y1) box.y1 = y;
          }
        }
      };
      for (let i = 0; i < 16; i++) measure(i / 16, 0, 0);
      measure(0.5, 1, 0);
      for (let i = 0; i < 8; i++) measure(i / 8, 0, 1);
    });
    console.log(`cadre : ${mood} mesuré`);
  }
  await page.evaluate(() => {
    const box = window.__box;
    const side = Math.max(box.x1 - box.x0, box.y1 - box.y0) * 1.08;
    window.__crop = { x: (box.x0 + box.x1) / 2 - side / 2, y: box.y1 + side * 0.05 - side, side }; // posé en bas, place pour l'ombre
  });

  // Dessine une image, découpée au cadre commun
  const shoot = async (phase, blink, drowsy) => {
    const url = await page.evaluate(
      ({ phase, blink, drowsy, size, quality }) => {
        const s = window.__foxScene;
        const { x, y, side } = window.__crop;
        s.setDrowsy(drowsy);
        s.widgetFrame(phase, blink);
        const o = document.createElement('canvas');
        o.width = o.height = size;
        const g = o.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(s.canvas, x, y, side, side, 0, 0, size, size);
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
        return o.toDataURL('image/webp', quality);
      },
      { phase, blink, drowsy, size: SIZE, quality: QUALITY }
    );
    return Buffer.from(url.split(',')[1], 'base64');
  };

  const save = (name, frames, ms) => {
    const file = animatedWebp(frames, SIZE, ms);
    bytes += file.length;
    fs.writeFileSync(path.join(nodpi, `${name}.webp`), file);
    return file.length;
  };

  // 2e passage : les boucles
  for (const mood of MOODS) {
    const real = await enterMood(mood);
    const loop = Math.min(MAX_LOOP_SECONDS, real);
    const perTour = Math.round(loop * FPS);
    const ms = Math.round((loop * 1000) / perTour);
    const tours = loop < SHORT_LOOP_SECONDS ? 2 : 1;
    const total = perTour * tours;
    const blinkLen = Math.max(3, Math.round((BLINK_SECONDS * 1000) / ms));
    const blinkFrom = total - perTour + Math.round(perTour * 0.55);

    const day = [];
    for (let i = 0; i < total; i++) {
      const p = (i - blinkFrom + 1) / (blinkLen + 1);
      const blink = p > 0 && p < 1 ? Math.sin(p * Math.PI) : 0;
      day.push(await shoot((i % perTour) / perTour, blink, 0));
    }
    const dayBytes = save(`fox_${mood}_jour`, day, ms);
    if (mood === 'equilibre') fs.writeFileSync(path.join(nodpi, 'fox_preview.webp'), day[0]);

    const nightCount = NIGHT_SECONDS * NIGHT_FPS;
    const night = [];
    for (let i = 0; i < nightCount; i++) night.push(await shoot(i / nightCount, 0, 1));
    const nightBytes = save(`fox_${mood}_soir`, night, Math.round(1000 / NIGHT_FPS));
    console.log(
      `OK ${mood} : tour de ${loop.toFixed(2)} s, ${total} images à ${ms} ms, ` +
        `${(dayBytes / 1024).toFixed(0)} Ko + nuit ${(nightBytes / 1024).toFixed(0)} Ko`
    );
  }
} finally {
  await browser.close();
}

// Ce qui fait jouer chaque boucle dans le widget
for (const mood of MOODS) {
  for (const [xml, webp] of [[`fox_anim_${mood}`, `fox_${mood}_jour`], [`fox_anim_${mood}_nuit`, `fox_${mood}_soir`]]) {
    fs.writeFileSync(
      path.join(drawable, `${xml}.xml`),
      `<?xml version="1.0" encoding="utf-8"?>
<!-- Écrit par tools/render-widget.mjs -->
<animated-image xmlns:android="http://schemas.android.com/apk/res/android"
    android:autoStart="true"
    android:repeatCount="-1"
    android:src="@drawable/${webp}" />
`
    );
  }
}

// Anciennes images fixes de la version à 16 images
for (const name of fs.readdirSync(nodpi)) {
  if (/^fox_[a-z]+_(\d\d|cligne_\d|nuit_\d)\.webp$/.test(name)) fs.rmSync(path.join(nodpi, name));
}
fs.rmSync(path.join(res, 'values/widget_anim.xml'), { force: true });

fs.writeFileSync(
  path.join(res, 'layout/widget_fox.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Écrit par tools/render-widget.mjs : le renard animé (FoxWidget.java choisit la boucle). -->
<ImageView xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/fox"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:importantForAccessibility="yes"
    android:scaleType="fitCenter"
    android:src="@drawable/fox_anim_equilibre" />
`
);
console.log(`Animations : ${(bytes / 1024 / 1024).toFixed(1)} Mo en tout`);
