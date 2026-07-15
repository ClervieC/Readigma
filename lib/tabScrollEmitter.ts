// Lets the custom TabBar (components/TabBar.tsx) tell a tab screen to scroll
// back to top when its own tab is tapped while already active — mirrors the
// iOS "tap the active tab" convention. A plain listener map rather than
// react-navigation's tabPress event, since our TabBar fully replaces the
// default bottom-tab-bar UI and no longer emits that event itself.
type Listener = () => void;

const listeners: Record<string, Listener[]> = {};

export function onScrollToTop(routeName: string, cb: Listener) {
  (listeners[routeName] ??= []).push(cb);
  return () => {
    listeners[routeName] = (listeners[routeName] ?? []).filter(l => l !== cb);
  };
}

export function emitScrollToTop(routeName: string) {
  listeners[routeName]?.forEach(cb => cb());
}
