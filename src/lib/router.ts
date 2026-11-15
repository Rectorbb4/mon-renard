// Navigation par l'ancre de l'URL (#/reperes) : marche hors ligne et sur GitHub Pages sans configuration serveur.

export const ROUTES = ['accueil', 'reperes'] as const;
export type Route = (typeof ROUTES)[number];

export const DEFAULT_ROUTE: Route = 'accueil';

/** Transforme une ancre d'URL (« #/reperes », « #reperes », « ») en écran connu. */
export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0].toLowerCase();
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : DEFAULT_ROUTE;
}

export function hrefFor(route: Route): string {
  return `#/${route}`;
}
