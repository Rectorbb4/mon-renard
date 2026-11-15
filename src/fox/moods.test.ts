import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOOD_IDS, MOODS, clipsUsed, isMoodId, moodFromScore, randomBetween } from './moods';

/** Lit les noms d'animations directement dans le fichier du modèle. */
function clipsInModel(): string[] {
  const buf = readFileSync(new URL('../../public/models/fox.glb', import.meta.url));
  const jsonLength = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
  return gltf.animations.map((a: { name: string }) => a.name);
}

describe('moodFromScore', () => {
  it('couvre les cinq humeurs du plus bas au plus haut', () => {
    expect(moodFromScore(-1)).toBe('creux');
    expect(moodFromScore(-0.4)).toBe('grisaille');
    expect(moodFromScore(0)).toBe('equilibre');
    expect(moodFromScore(0.4)).toBe('elan');
    expect(moodFromScore(1)).toBe('emballement');
  });

  it('place les limites de façon stable', () => {
    expect(moodFromScore(-0.6)).toBe('creux');
    expect(moodFromScore(-0.25)).toBe('grisaille');
    expect(moodFromScore(0.25)).toBe('elan');
    expect(moodFromScore(0.6)).toBe('emballement');
  });

  it('borne les valeurs hors échelle et ignore les valeurs invalides', () => {
    expect(moodFromScore(-5)).toBe('creux');
    expect(moodFromScore(5)).toBe('emballement');
    expect(moodFromScore(Number.NaN)).toBe('equilibre');
  });

  it("monte dans l'ordre quand le score augmente", () => {
    let last = -1;
    for (let s = -1; s <= 1.0001; s += 0.05) {
      const index = MOOD_IDS.indexOf(moodFromScore(s));
      expect(index).toBeGreaterThanOrEqual(last);
      last = index;
    }
  });
});

describe('MOODS', () => {
  it('décrit chaque humeur avec son propre identifiant', () => {
    for (const id of MOOD_IDS) expect(MOODS[id].id).toBe(id);
  });

  it("n'utilise que des animations présentes dans le modèle 3D", () => {
    const available = new Set(clipsInModel());
    const missing = clipsUsed().filter((c) => !available.has(c));
    expect(missing).toEqual([]);
  });

  it('garde des réglages dans des plages raisonnables', () => {
    for (const m of Object.values(MOODS)) {
      expect(m.weatherAmount).toBeGreaterThanOrEqual(0);
      expect(m.weatherAmount).toBeLessThanOrEqual(1);
      expect(m.lids).toBeLessThanOrEqual(1);
      expect(m.earsDown).toBeLessThanOrEqual(1);
      expect(m.speed).toBeGreaterThan(0);
      expect(m.blinkEvery[0]).toBeLessThanOrEqual(m.blinkEvery[1]);
      expect(m.gestureEvery[0]).toBeLessThanOrEqual(m.gestureEvery[1]);
    }
  });
});

describe('outils', () => {
  it('tire une durée dans l’intervalle demandé', () => {
    expect(randomBetween([2, 4], () => 0)).toBe(2);
    expect(randomBetween([2, 4], () => 1)).toBe(4);
    expect(randomBetween([2, 4], () => 0.5)).toBe(3);
  });

  it('reconnaît les identifiants valides', () => {
    expect(isMoodId('elan')).toBe(true);
    expect(isMoodId('joie')).toBe(false);
    expect(isMoodId(3)).toBe(false);
  });
});
