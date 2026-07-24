// Google requires this base script present on every page unconditionally to
// verify site ownership (see app/_layout.tsx) — it does not itself request
// or render an ad. Only the actual ad unit (components/AdBanner.tsx: the
// <ins> tag + adsbygoogle.push call) is gated behind user consent, since
// that's the part that triggers an ad request/cookie under GDPR/ePrivacy.
export const ADSENSE_CLIENT_ID = process.env.EXPO_PUBLIC_ADSENSE_CLIENT_ID;
export const ADSENSE_SLOT_ID = process.env.EXPO_PUBLIC_ADSENSE_SLOT_ID;

let scriptRequested = false;
export function ensureAdSenseScript() {
  if (scriptRequested || !ADSENSE_CLIENT_ID || typeof document === 'undefined') return;
  scriptRequested = true;
  // scripts/inject-adsense-html.js already bakes this same tag into the
  // static dist/index.html at build time (needed for Google's verification
  // crawler, which doesn't run this app's JS) — checking the DOM, not just
  // the in-memory flag above, is what stops this from loading it a second
  // time on top of that one.
  if (document.querySelector('script[src*="adsbygoogle.js"]')) return;
  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;
  document.head.appendChild(script);
}
