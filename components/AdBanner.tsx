import { createElement, useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { useAdConsent } from '../context/AdConsentContext';
import { ADSENSE_CLIENT_ID, ADSENSE_SLOT_ID, ensureAdSenseScript } from '../lib/adsense';

// Web-only in-feed ad slot — see app/(tabs)/feed.tsx. A no-op everywhere
// else: native builds aren't in scope (Readigma is used as a web app only,
// see .env.example), and without consent or without a real ad unit
// (EXPO_PUBLIC_ADSENSE_SLOT_ID in .env) there's nothing to show. The base
// AdSense script itself loads unconditionally from app/_layout.tsx — this
// component only ever gates the actual ad *request*, which is the part
// GDPR/ePrivacy require consent for.
export default function AdBanner() {
  const { consent } = useAdConsent();
  const pushedRef = useRef(false);
  const active = Platform.OS === 'web' && consent === 'granted' && !!ADSENSE_CLIENT_ID && !!ADSENSE_SLOT_ID;

  useEffect(() => {
    if (!active || pushedRef.current) return;
    pushedRef.current = true;
    ensureAdSenseScript();
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
        'data-ad-client': ADSENSE_CLIENT_ID,
        'data-ad-slot': ADSENSE_SLOT_ID,
        'data-ad-format': 'auto',
        'data-full-width-responsive': 'true',
      })}
    </View>
  );
}
