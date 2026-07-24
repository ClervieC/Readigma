import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Platform } from 'react-native';

// Ads (Google AdSense) only exist on the web build — see components/AdBanner.tsx
// and components/AdConsentBanner.tsx. GDPR/ePrivacy require opt-in consent
// *before* any ad script or cookie loads, not an opt-out after the fact, so
// 'unknown' must never be treated as granted anywhere that reads this.
export type AdConsent = 'unknown' | 'granted' | 'denied';

const STORAGE_KEY = 'readigma_ad_consent';

const AdConsentContext = createContext<{
  consent: AdConsent;
  setConsent: (c: AdConsent) => void;
}>({ consent: 'denied', setConsent: () => {} });

export function AdConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsentState] = useState<AdConsent>('unknown');

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'granted' || stored === 'denied') setConsentState(stored);
  }, []);

  const setConsent = (c: AdConsent) => {
    setConsentState(c);
    if (Platform.OS === 'web') window.localStorage.setItem(STORAGE_KEY, c);
  };

  return (
    <AdConsentContext.Provider value={{ consent, setConsent }}>
      {children}
    </AdConsentContext.Provider>
  );
}

export const useAdConsent = () => useContext(AdConsentContext);
