# Asset Insight Front End

Three independently built applications, with their existing report previews,
branding, media ordering and review workflows preserved:

| Directory | Application | Local port |
| --- | --- | --- |
| `assetinsight-admin` | Next.js operations/admin console | 3001 |
| `assetinsight-client` | Next.js appraiser web application | 3000 |
| `assetinsight-app` | Expo / React Native mobile application | 8081 |

The matching backend is maintained separately in
[pristine77/Asset-Insight](https://github.com/pristine77/Asset-Insight).
Generated PDF, DOCX and spreadsheet report layouts remain backend-owned.

## Setup

Use Node.js 22–26 and npm 10–11. Each application owns its dependencies and
lockfile; install inside the application folder with `npm ci`. This repository
intentionally does not hoist dependencies across the different React versions.
Copy the app's `.env.example` to a local `.env` and configure the backend endpoint.
Environment files and signing credentials are not committed.

Start the admin with `npm run dev -- -p 3001`, the web application with
`npm run dev -- -p 3000`, and mobile with `npm start` in their respective folders.
The Android emulator normally reaches a local backend through `10.0.2.2`, not
`localhost`. Production mobile builds require an HTTPS API URL.

## Verification

```sh
node --test tests/export-boundaries.test.mjs
npm --prefix assetinsight-admin run verify
(cd assetinsight-admin && node --test tests/*.test.mjs)
npm --prefix assetinsight-client run typecheck
npm --prefix assetinsight-client run lint
npm --prefix assetinsight-client test
npm --prefix assetinsight-client run build
npm --prefix assetinsight-app run typecheck
npm --prefix assetinsight-app test -- --watch=false
```

Web browser checks use `npm run test:e2e` inside `assetinsight-client`.
Use isolated fixtures and a local backend for checks, never production mutations.
Installing dependencies or verifying builds does not deploy any application.

## Native builds

Android native sources and the custom camera module are included. Generated
native caches, APK/AAB files and all signing keys are excluded. Before a local
debug build, generate a disposable debug-only keystore if it is not present:

```sh
cd assetinsight-app
keytool -genkeypair -keystore android/app/debug.keystore -storepass android \
  -alias androiddebugkey -keypass android -dname "CN=Android Debug,O=Android,C=US" \
  -keyalg RSA -keysize 2048 -validity 10000
npm run android
```

Never use that debug key for a store release. EAS production profiles use the
authorized project's remote signing credentials; confirm project access before
starting a cloud build. The existing Expo project/package identity is preserved.
An iOS native project is generated through Expo when needed.

Keep the admin HttpOnly-cookie BFF boundary, user ownership checks, stable upload
identities, manual offline submissions and camera watermark receipts intact.
See each app's README files for detailed operational behavior and release gates.
