// Action demandée par un bouton du widget Android, en attente que l'accueil la traite.
import type { AppAction } from './android';

export const appAction = $state({ action: null as AppAction | null, count: 0 });

export function requestAction(action: AppAction): void {
  appAction.action = action;
  appAction.count += 1;
}

/** Prend l'action en attente (une seule fois). */
export function consumeAction(): AppAction | null {
  const action = appAction.action;
  appAction.action = null;
  return action;
}
