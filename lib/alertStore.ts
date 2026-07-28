export type AlertButton = { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' };
export type AlertState = { title: string; message?: string; buttons: AlertButton[] };

// Bare module-level pub/sub instead of a Context — lib/alert.ts's alert()
// is called from plain non-component code (`.catch(() => alert(...))`
// throughout the app), so there's no component tree to thread a Context
// value through at the call site. AlertHost (mounted once in app/_layout.tsx)
// is the sole subscriber; it re-renders whenever showAlert/dismissAlert runs.
let listeners: Array<(state: AlertState | null) => void> = [];
let current: AlertState | null = null;

export function showAlert(state: AlertState) {
  current = state;
  listeners.forEach((l) => l(current));
}

export function dismissAlert() {
  current = null;
  listeners.forEach((l) => l(current));
}

export function subscribeAlert(listener: (state: AlertState | null) => void) {
  listeners.push(listener);
  listener(current);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
