import { describe, expect, it } from 'vitest';
import { hrefFor, parseRoute } from './router';

describe('parseRoute', () => {
  it("renvoie l'accueil quand l'ancre est vide", () => {
    expect(parseRoute('')).toBe('accueil');
    expect(parseRoute('#')).toBe('accueil');
    expect(parseRoute('#/')).toBe('accueil');
  });

  it('reconnaît les écrans connus, avec ou sans barre oblique', () => {
    expect(parseRoute('#/reperes')).toBe('reperes');
    expect(parseRoute('#reperes')).toBe('reperes');
    expect(parseRoute('#/REPERES')).toBe('reperes');
  });

  it('ignore la suite du chemin et les paramètres', () => {
    expect(parseRoute('#/reperes/detail')).toBe('reperes');
    expect(parseRoute('#/reperes?x=1')).toBe('reperes');
  });

  it("revient à l'accueil pour un écran inconnu", () => {
    expect(parseRoute('#/nimporte-quoi')).toBe('accueil');
  });

  it('fabrique un lien que parseRoute relit à l’identique', () => {
    expect(parseRoute(hrefFor('reperes'))).toBe('reperes');
  });
});
