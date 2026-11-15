// Allège le modèle du renard : tools/source/fox-original.glb → public/models/fox.glb.
// Prérequis : le serveur de dev tourne (npm run dev) et puppeteer-core est disponible.
// Usage : node tools/optimize-model.mjs [cheminVersPuppeteerCore] [cheminVersChrome]
// Pour utiliser une nouvelle animation dans l'appli, l'ajouter à KEEP puis relancer l'outil.
// Le test src/fox/model.test.ts vérifie que toutes les animations utilisées sont dans le modèle.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const KEEP = [
  'Fox_Idle',
  'Fox_Sit1',
  'Fox_Sit2_Idle',
  'Fox_Sit3_StandUp',
  'Fox_Sit_Idle_Break',
  'Fox_Sit_Yes',
  'Fox_Jump_Pivot_InPlace',
  'Fox_Walk_Left_InPlace',
  'Fox_Walk_Right_InPlace',
  'Fox_Run_InPlace',
  'Fox_Run_Left_InPlace',
  'Fox_Run_Right_InPlace',
  'Fox_Somersault_InPlace'
];

const require = createRequire(import.meta.url);
const puppeteer = require(process.argv[2] || 'puppeteer-core');
const chrome = process.argv[3] || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const base = process.env.DEV_URL || 'http://localhost:5173';
const out = path.resolve('public/models/fox.glb');

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('Erreur dans la page :', e.message));
  const query = new URLSearchParams({ keep: KEEP.join(','), color: '0.86', normal: '0.92', size: '2048' });
  await page.goto(`${base}/tools/optimize-model.html?${query}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__result', { timeout: 120000 });
  const result = await page.evaluate(() => window.__result);
  if (result.error) throw new Error(result.error);
  console.log(result.log.trim());
  writeFileSync(out, Buffer.from(result.base64, 'base64'));
  console.log('Écrit :', path.relative(process.cwd(), out));
} finally {
  await browser.close();
}
