/** Home-screen install: a real prompt on Chrome/Android, a how-to tip on iPhone. */

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPrompt;
  listeners.forEach((fn) => fn());
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  listeners.forEach((fn) => fn());
});

export const standalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const canPrompt = () => !!deferred;

export async function promptInstall() {
  if (!deferred) return false;
  const d = deferred;
  deferred = null;
  try {
    await d.prompt();
    const { outcome } = await d.userChoice;
    return outcome === 'accepted';
  } catch {
    return false;
  } finally {
    listeners.forEach((fn) => fn());
  }
}

/** Re-render something when install availability changes. Returns an unsubscribe fn. */
export function onInstallChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
