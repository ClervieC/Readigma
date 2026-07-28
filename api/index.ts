// @ts-nocheck — CommonJS Node entry point (module/__dirname/require), run
// directly by Vercel's Node runtime rather than through this app's own
// Metro/tsc setup, so it's not worth pulling @types/node into the whole
// project just for this one file.
//
// Vercel serverless entry point for the exported Expo Router server build
// (dist/server, produced by `expo export -p web` with app.json's
// web.output: "server"). Every request — static route or app/api/**+api.ts
// handler — gets delegated to Expo's own request handler; see vercel.json's
// rewrites, which route everything here.
const { createRequestHandler } = require('expo-server/adapter/vercel');

module.exports = createRequestHandler({
  build: require('path').join(__dirname, '../dist/server'),
});
