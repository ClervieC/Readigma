# Readigma

A social reading tracker built with React Native (Expo) and Express/PostgreSQL.

## Prerequisites

- Node.js 18+
- PostgreSQL running locally (or a remote connection string)
- Expo Go app on your phone (or an iOS/Android simulator)

## Backend

```bash
cd backend
npm install
cp .env.example .env   # then fill in your values
npm run dev            # starts on http://localhost:3000
```

Required `.env` variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing tokens |
| `GOOGLE_BOOKS_API_KEY` | Google Books API key |
| `HARDCOVER_API_KEY` | Hardcover Bearer token (e.g. `Bearer eyJ...`) |
| `PORT` | Server port (default 3000) |

## Mobile

```bash
cd mobile
npm install
```

The project uses `expo-dev-client`, so **Expo Go won't work**. You need to build and install a native development build first (one-time, requires Xcode for iOS / Android Studio for Android):

```bash
npx expo run:ios        # builds and installs on iOS simulator
npx expo run:android    # builds and installs on Android emulator
```

After the first build, just use:

```bash
npx expo start          # then press i (iOS) or a (Android)
```

> If you want to skip the native build and use Expo Go instead, run `npx expo start --go`. You'll lose any native-only features but it works instantly.

The app connects to the backend via the `API_URL` set in `mobile/src/services/api.ts`. Change it to your local IP if running on a physical device (e.g. `http://192.168.x.x:3000`).

## Project structure

```
readigma/
├── backend/          Express + TypeScript API
│   └── src/
│       ├── routes/   REST endpoints
│       └── app.ts    Entry point
└── mobile/           Expo (SDK 56) React Native app
    └── src/
        ├── screens/
        ├── navigation/
        ├── contexts/
        ├── services/
        └── theme/
```
