import { createElement, useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { useAdConsent } from '../context/AdConsentContext';

const CLIENT_ID = process.env.EXPO_PUBLIC_ADSENSE_CLIENT_ID;
const SLOT_ID = process.env.EXPO_PUBLIC_ADSENSE_SLOT_ID;

// Loaded once for the whole session, on the first ad slot that's actually
// allowed to render — never at app startup, since GDPR/ePrivacy require the
// ad script (and the cookies it sets) to not load at all until consent is
// granted, not just the visible ad unit.
let scriptRequested = false;
function ensureAdSenseScript(clientId: string) {
  if (scriptRequested || typeof document === 'undefined') return;
  scriptRequested = true;
  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
  document.head.appendChild(script);
}

// Web-only in-feed ad slot — see app/(tabs)/feed.tsx. A no-op everywhere
// else: native builds aren't in scope (Readigma is used as a web app only,
// see .env.example), and without consent or without real AdSense ids
// (EXPO_PUBLIC_ADSENSE_CLIENT_ID/SLOT_ID in .env) there's nothing to show.
export default function AdBanner() {
  const { consent } = useAdConsent();
  const pushedRef = useRef(false);
  const active = Platform.OS === 'web' && consent === 'granted' && !!CLIENT_ID && !!SLOT_ID;

  useEffect(() => {
    if (!active || pushedRef.current) return;
    pushedRef.current = true;
    ensureAdSenseScript(CLIENT_ID!);
    // adsbygoogle.push needs the <ins> tag already in the DOM, which only
    // happens after this same render commits — deferring one tick is enough.
    const t = setTimeout(() => {
      try {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;

  return (
    <View style={{ width: '100%', marginVertical: 12 }}>
      {createElement('ins', {
        className: 'adsbygoogle',
        style: { display: 'block' },
        'data-ad-client': CLIENT_ID,
        'data-ad-slot': SLOT_ID,
        'data-ad-format': 'auto',
        'data-full-width-responsive': 'true',
      })}
    </View>
  );
}
