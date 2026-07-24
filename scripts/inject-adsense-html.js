// Runs after `expo export -p web` (see package.json's build:web). Google's
// AdSense site-verification crawler doesn't reliably execute the app's JS
// (this is a client-only SPA — web.output "single" — so the exported
// dist/index.html is an near-empty shell until React mounts), so the
// runtime script injection in app/_layout.tsx alone isn't enough: the
// verification script has to be present in the *static* HTML Vercel serves.
// lib/adsense.ts's runtime ensureAdSenseScript() checks the DOM before
// adding its own copy, so having both this static tag and that runtime
// effect never double-loads the script.
const fs = require('fs');
const path = require('path');
// Unlike `expo export` (which loads .env itself for EXPO_PUBLIC_ vars), this
// plain `node` script gets none of that for free — dotenv is what makes the
// local .env file visible here too. Vercel's own build env vars still work
// the same either way, since dotenv only fills in what's *not* already set.
require('dotenv').config();

const clientId = process.env.EXPO_PUBLIC_ADSENSE_CLIENT_ID;
if (!clientId) {
  console.log('EXPO_PUBLIC_ADSENSE_CLIENT_ID not set — skipping AdSense script injection.');
  process.exit(0);
}

const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.warn(`${htmlPath} not found — did the web export run first?`);
  process.exit(0);
}

let html = fs.readFileSync(htmlPath, 'utf8');
if (html.includes('adsbygoogle.js')) {
  console.log('AdSense script already present in dist/index.html — skipping.');
  process.exit(0);
}

const tag = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}" crossorigin="anonymous"></script>`;
html = html.replace('</head>', `  ${tag}\n</head>`);
fs.writeFileSync(htmlPath, html);
console.log('Injected AdSense verification script into dist/index.html');
