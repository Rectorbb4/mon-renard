// Propose l'installation de l'appli sur l'écran d'accueil quand Chrome le permet.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;

export const install = $state({
  /** Chrome a signalé que l'appli peut être installée. */
  available: false,
  /** L'appli tourne déjà comme appli installée. */
  installed: typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
});

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    install.available = true;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    install.available = false;
    install.installed = true;
  });
}

export async function promptInstall(): Promise<void> {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice;
  deferred = null;
  install.available = false;
}
