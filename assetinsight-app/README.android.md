# Android local development

## Uploads resume by themselves — 2026-10-02 (local)

Owner request: an upload interrupted by a weak or lost signal should continue
once the signal is back, without someone watching the phone to tap Resume
upload. This replaces, for a report that is still open, the earlier rule
"Reconnection does not start a report automatically".

- **What resumes.** Only an upload the app stopped by itself: the automatic
  pause on a lost connection, a stalled transfer, a transient network or server
  error, or a Submit that found no connection. A Pause the person tapped, an
  account change, and anything that needs a decision (conflicts, "Earlier
  upload accepted", sign-in problems) are unchanged.
- **When.** Only while that report stays open. The form shows "Waiting for
  signal" with **Resume now** and **Pause upload**. The phone must stay
  connected for 15 s and our server must answer its health check before the
  upload starts again; while connected but unanswered, it checks again after
  15, 30, then 60 s. A closed form, a restarted app or a draft reopened from
  Drafts keep the explicit Resume upload button, and Offline captures are still
  never sent without a tap on Submit.
- **How far.** After three automatic tries in a row that store no new file, it
  stops and shows the usual message and Resume upload. A try that stores more
  files resets the count, so a long upload on a patchy signal keeps going.
- **What a resume is.** Exactly the Resume upload action: the same submission
  and upload session, files already in storage are skipped, and the server
  refuses a second report for the same submission.
- **How the app tells pauses apart.** `pauseActiveUploads('connection')` marks
  the automatic pause, and the paused error carries `pauseReason`
  (`uploadCancellation.ts`). Rules and the wait: `services/uploadAutoResume.ts`.
  Form side: `components/forms/useUploadAutoResume.ts` and
  `UploadWaitingForSignal.tsx`, used by both report forms.
- **Related fix.** The pre-upload check refused to start whenever NetInfo's own
  "internet reachable" probe read false, which happens on weak but working
  signal. It now refuses only a reported disconnect and leaves the decision to
  the check of our own server that follows (`offlineSubmissionService.ts`).

Not covered: uploading while the app is closed or the phone is locked. Android
stops the app's JavaScript work in the background; that needs a native
background upload service.

Tests: `uploadAutoResume.test.ts` (which failures qualify; the wait, with a fake
network and clock), `uploadPauseReason.test.ts`, additions to
`offlineQueueManual.test.ts` and `offlineSubmissionService.test.ts`, and nine
cases per form in `AuctioneerForms.test.tsx`. Removing any of the four guards
(the person's Pause, the account check, progress counting, the try limit) fails
a test. Component and mocked-network evidence only; no device run.

## Fewer stuck screens and silent failures — 2026-10-02 (local)

Seven fixes that follow the field reports of a frozen camera and an upload bar
that stops moving. Items 1 to 6 are in this app; item 7 is in the Asset-Insight
backend.

1. **Finalizing asks before re-sending.** When the answer to the completion
   request is lost, the app first asks
   `GET /api/{asset|lot-listing}/upload-session/:sessionId/status` whether the
   server already accepted the upload. An accepted receipt finishes at once,
   reported as `acceptedOnRetry: true`. It asks once more after the last
   attempt, so an accepted report never ends as an error. If the status check
   fails or the server lacks it, the app re-sends as before.
   (`acceptedReceiptFromStatus` in `directR2UploadService.ts`.)
2. **The server fallback has no total time limit.** When a phone's network
   blocks direct storage, files go through the API. That request had a fixed
   120 s limit, which cut off walkaround videos and large photos on slow links
   while they were still moving, the same way on every resume. It now stops only
   after `UPLOAD_IDLE_TIMEOUT_MS` (120 s) without progress, like direct
   transfers.
3. **The camera tap says why it did not open.** The forms save the draft before
   opening the camera. When that save failed, the tap did nothing. Both forms now
   show "Camera not opened" with the save's reason and a **Try again** button
   (`src/utils/cameraOpenFailure.ts`). Try again saves the form as it is when
   tapped, and does nothing once the account or the form has changed.
4. **A Pause during the Submit save is a pause.** A Pause tapped while the draft
   was being saved before upload ended as "Draft not saved ... check device
   storage" although the save had worked. The save is now recorded before the
   pause check, so the draft shows **Resume upload**.
5. **Retries say so.** A re-sent file starts again from zero bytes while the bar
   keeps its highest value, so a working retry looked frozen. The progress text
   now reads "Retrying <file> (2 of 3)..." or "Sending <file> again...".
6. **"Opening camera..." no longer stays up for good.** When the account or the
   draft changed while the camera was open or its photos were being saved, the
   screen kept its spinner with no camera behind it. It now shows "Camera
   closed", says what happened, and offers **Close**. It does not close by
   itself: nothing from the old launch may act on the new draft, which the
   existing stale-handoff tests pin. The captured media stays in the original
   draft's recovery journal.
7. **Backend: the per-photo check reads one entry.**
   `POST .../upload-session/:sessionId/files/:fileId/verify` loaded the whole
   session, up to 5,000 file entries, for every photo checked during a resume.
   It now reads only that photo's entry (`$elemMatch` projection, `.lean()`)
   in `reportUploadSession.controller.ts`.

Tests: `completionRetryReceipt.test.ts` (status checks),
`uploadFallbackAndRetry.test.ts` (fallback deadline, retry text),
`cameraOpenFailure.test.ts`, new cases in `AuctioneerForms.test.tsx` (both
forms: pause during save, camera not opened, Try again and its account guard)
and `NativeAuctionCameraScreen.test.tsx` (camera closed by an account or draft
change). Backend: the photo-check cases in
`report-upload-completion-verification.integration.test.ts`. Each new form and
camera case was confirmed to fail with its fix removed. This is mocked-transport
and component evidence, not a device or field-network run. A new native binary
is required; there is no OTA channel.

## Standard photo size — 2026-10-02 (local)

Installed builds send camera photos at 1200 × 900, about 235 KB (71 app-stamped
staging photos). The source had since raised the Android camera's limit to a
3000 px longest side and a 700 KB JPEG target, about 600 KB per photo, while a
comment still read "keep existing 1200 px limit". The owner chose the office's
own resize settings instead: **Fit** inside **1200 × 900** (width × height),
**Do not enlarge if smaller**, **Maintain aspect ratio**, **Reverse width and
height by orientation** off.

- Both cameras now fit standard photos inside 1200 × 900 without enlarging or
  changing shape, so a landscape photo is at most 1200 × 900 and a 3:4 portrait
  photo at most 675 × 900. The JPEG then steps down from quality 95 until it is
  at most 300 KB. Android: `fitInsideBox` and `STANDARD_PHOTO_MAX_*` in
  `CameraViewEngine.kt`; JS camera: `src/utils/cameraPhotoSize.ts`.
- Measured on 17 full-size originals with the camera's JPEG ladder: 232 KB on
  average, 164 to 293 KB. With the old 700 KB target the same 1200 × 900 photos
  averaged 385 KB.
- Unchanged: the 12 MP option (6000 px longest side, 1 MB), WebP/AVIF output
  choices (also held to 300 KB as before), and gallery imports, which still
  upload the original the user picked.

Tests: `cameraPhotoSize.test.ts`, the updated `cameraPhotoWatermark.test.ts`,
and `nativeCapturePhotoSize.test.ts`, which pins the Kotlin source because the
project has no Kotlin test runner. The Kotlin change was not compiled here (no
JDK or Android SDK on this machine); the next Android build compiles it, and a
real-phone capture should confirm the 1200 × 900 output before release.

## Finalizing safeguards — 2026-10-01 (local)

Field reports: the bar stopped at "Finalizing Report", or the app announced
"Earlier upload accepted" and the draft stayed on **Resume upload** while the
report was in fact accepted and processing.

- A completion retry that the server answers with `reusedAcceptance` is this
  attempt's own acceptance: the first request reached the server and only its
  answer was lost. `directR2UploadService` reports it with
  `reusedAcceptance: false, acceptedOnRetry: true`, so the forms complete
  normally. An acceptance that existed before the attempt began still arrives as
  `alreadyQueued` and keeps the "Earlier upload accepted" review.
- Finalizing cannot be paused. `beginUploadFinalization()` is set before the
  "finalizing" stage is shown and cleared when the completion request settles
  (120 s per attempt, idempotent on the server). Both forms hide **Pause upload**
  and ignore Android back for that step. Account switch and sign-out still cancel
  everything through `pauseActiveUploads()`.
- The automatic pause on connection loss ignores `isInternetReachable`
  (NetInfo's own probe of a public URL, false on weak signal or blocked URLs),
  waits for a disconnect to last `DISCONNECT_PAUSE_DELAY_MS` (10 s, longer
  than a Wi-Fi/cellular handover), and leaves a finalizing submission alone.
  Real outages still stop transfers at the 120 s no-progress deadline.
- Backend companion in Asset-Insight (`reportUploadSession.controller.ts`):
  completion reuses verifications recorded in the last 30 minutes, records its
  own progress as it goes, bounds each storage check at 15 s, and answers a
  storage hiccup with a retryable 503 instead of failing the session as missing.
  It helps installed builds too and should deploy before this binary.

Tests: `completionRetryReceipt.test.ts`, `offlineQueueManual.test.ts` and a
finalizing case in `AuctioneerForms.test.tsx` (both forms). Like the sections
below, this is mocked-transport and component evidence, not a physical-device
or field-network run. A new native binary is required; there is no OTA channel.
No production data, APK build, push or deployment is part of this change.

## Upload acceptance and recovery — 2026-10-01 (local)

Asset/Lot recovery distinguishes a reserved report ID from an accepted report.
Manifest replacement requires the API's explicit `accepted: false` and
`canSupersede: true`; missing/legacy authority never rotates submission IDs.
A confirmed unavailable accepted report offers ordinary drafts an explicit
**Start separate report** only when the API grants `canCreateSeparate`. This
saves a new capture/submission identity before transport, reuses every original
media reference, retains the prior draft/history, and sends neither a supersedes
pointer nor force-new permission. Incoming work remains on its assignment.

Missing, malformed or pre-acceptance receipts cannot hide a draft. An earlier
acceptance (`alreadyQueued`/`reusedAcceptance`) also keeps the current draft and
its newer field edits for review; matching photos do not prove those edits were
accepted. The first successful completion can still finish normally when a fast
worker has already processed it. Failed local saves cannot claim the latest
changes were saved. Network/HTTP/proxy failures use actionable guidance without
raw status codes or HTML, including explicit cloud draft preview failures.

Tests use isolated metadata and mocked transports, including interruption at
85% with 992 and 5,000 references, exact same-identity/manual resume, bounded four
workers, owner/unmount fences and rejected fresh-draft saves. These checks do not
diagnose a physical-device crash, prove real 992-photo memory endurance, or prove
recovery of the reported customer data.
The backend receipt/cleanup safeguards must deploy before the updated mobile
binary. No production data, APK release, push or deployment is part of this work.
Final local gate: 82 Jest suites / 867 tests, 228 focused recovery checks,
TypeScript and Android/iOS production-mode Hermes exports pass. Scoped ESLint
has zero errors (existing style/import warnings remain). Bundles use an isolated
loopback API and live outside the repository. The final source also passes an
offline JDK17 `:app:assembleDebug` build using existing dependencies and SDK
caches, with SDK downloads disabled. This verifies native debug integration;
the Hermes exports separately verify JavaScript bundling. No APK was installed,
release artifact built, or physical-device run made for this acceptance/recovery
task.

## Stalled Asset/Lot uploads — 2026-09-30 (local)

The reported "Uploading Images" hang exposed unbounded waits in native socket
writes and filesystem/fetch callbacks. Native and JS media transfers now stop
after 120 seconds without byte progress, not after 120 seconds of total upload
time. Repeated identical progress events do not reset the deadline. Local size
preparation has a 30-second response bound; API requests retain their own existing
timeouts. Pause settles the app request even if a transport's cancellation or
completion callback never answers. Late progress/results cannot revive that task.

The native uploader preserves four workers, exact-length streaming and original
URIs. A separate watchdog resolves stalled/cancelled promises once, with bounded
off-thread stream cleanup. One failed report cancels its sibling transfers, not
unrelated reports. A stalled attempt stops before working through all queued
photos; the local draft, submission ID and upload session remain for explicit
Resume. Resumed sessions verify stored objects before PUT, then use the original
completion receipt. Reconnection does not start a report automatically.

Both forms show blocking, accessible upload progress with Pause/Pausing/Resume
states; Asset progress remains available from Details or Images. A confirmed
acceptance is never labelled paused. Snapshot editing stays blocked during the
attempt, and late progress is fenced by owner/form identity. No report, photo or
draft is deleted by these changes. Existing count and watermark rules remain.

Isolated tests cover 160 photos in two lots, 5,000-file bounded queues, no-progress
timeouts, slow progress, ignored cancellation, late callbacks, same-session resume,
and missing media metadata. Android API35 local HTTPS/MediaStore instrumentation
exercises real stalled writes/responses, queued cancellation, four-worker reuse,
exact bytes and continuing slow response progress. These checks are not a diagnosis
from the affected customer's device logs or physical-network endurance evidence.
Final gate: 79 suites / 778 tests, TypeScript, Android/iOS Hermes exports, native
debug/test APK builds and isolated API35 upload instrumentation pass. Scoped ESLint
has zero errors; repository style warnings remain. Frozen JS bundle outputs are
outside the repository; the emulator used no customer or production endpoints.
No production access, push or deployment is included. A new native mobile binary
is required; the existing upload-session APIs are reused without backend changes.

## Camera Done handoff — 2026-09-30 (local)

Native camera launch and Done now exchange UUID receipts through Android activity
Intents; the full lot/photo/activity JSON is written atomically to app-private
metadata files. Previously the whole manifest travelled through Binder, whose
shared size limit can strand the JS camera promise after a large capture. This is
a reproduced size hazard matching the reported stuck "Opening camera" symptom,
not a forensic diagnosis of that customer's unavailable device logs.

No photo/video original is copied or deleted by this transport. Exact transport
files are cleaned after reading, while the owner/draft-bound capture journal stays
available until the local draft transaction succeeds. Launch, input and result
failures settle explicitly. A failed Done metadata write keeps the camera open
for retry. A synchronized immutable launch claim prevents a returning camera from
clearing a later launch's promise or metadata. An uncertain return never opens a
second backup camera over the saved
session. The React wrapper distinguishes saving from opening, fences late results
after account/draft changes, and refuses incomplete media instead of clipping or
silently dropping it. Existing 200-photo-per-lot and 5,000-photo limits remain.

Verification: 78 suites / 753 tests, TypeScript, both Android/iOS Hermes exports
and scoped ESLint (zero errors; two pre-existing warnings) pass. Android debug and
instrumentation APKs build. Isolated network-disabled API35 metadata tests cover
19 lots / 254 photos and 25 lots / 5,000 photos, exact ordered round trips, activity
recreation, missing/mismatched receipt rejection, storage obstruction, and durable
journal preservation. Eight-thread launch contention and interleaved old-result,
new-launch and old-failure checks pass on that emulator. New launch/return Intents
are under 512 bytes; the old
5,000-photo result exceeds 1 MiB. These are metadata fixtures, not physical camera
capture/endurance or recovery of the customer's actual draft.

A new native mobile binary is required; OTA JS or server deployment alone cannot
replace the Android handoff code. No production access, customer-data repair,
push or deployment is included. Existing originals and drafts must be preserved.
Process death before transport cleanup can retain small private metadata files;
they are not a second original and do not replace the durable recovery journal.

## Authentication recovery safeguards — 2026-09-30 (local)

Sign-in, verification and both reset paths send the durable installation context.
Usable existing secure-store keys are never rotated; corrupt whitespace or
padded-short keys are replaced before transport. Creation remains single-flight
and awaits secure persistence. Storage failure must not send a partial request.

Public signup/login/forgot/resend/verify/reset requests never refresh/replay using
an old account token. Reset/verification handoff to device approval must not call
`/user/me` without a session: only authenticated receipts refresh the profile.
Malformed token/owner/challenge responses fail before secure-session mutation.
The forms retain error inputs, fence duplicate actions, and let unverified users
return to verification from sign-in. Code inputs require six digits; passwords
are preserved exactly. A reset link is not labelled valid before server checking.

Deploy backend preflight safeguards first, then web and an updated mobile binary.
Existing device approval, account blocking and IP restrictions remain enforced.
No automatic retry, live email, customer password change, push or deployment is
part of this local fix. The reported screenshot demonstrates rejected device
context, but does not identify the installed app version or secure-storage cause.
Physical Android/iOS secure storage and real email delivery need release QA;
mocked screen/service tests and Hermes exports are not physical-device evidence.
Verification: 78 suites / 728 tests, TypeScript and Android/iOS Hermes exports
passed. Scoped lint has zero errors (six existing warnings in API/context files).
An unchanged large-preview test timed out during concurrent bundle builds; the
complete suite passed after builds finished, without changing its timeout.

## Pristine UI synchronization — 2026-09-30

Ported the standalone mobile repository's report labels (2b8abf7) and service
price/checkmark presentation (98c656f). Download filenames and Salvage download
handling are unchanged. The newer owner-scoped Auctioneer 2.0 screens, assignment
checks, draft isolation and continuation replace the older combined-task adapter;
do not restore that obsolete adapter over the current workflow. No accounting,
watermark, upload or report lifecycle behavior changes. A new mobile binary is
required for installed devices; a web deployment does not update the app.

This is an Expo SDK 54 / React Native 0.81 app with a checked-in, manually maintained `android/` project, custom camera/image native code, and a development client. Use the existing native project; Expo Go cannot validate its native modules.

Do not run `expo prebuild --clean`, delete `android/`, or regenerate the native project to solve a dependency/build error. Review native changes explicitly. `app.config.js` extends the normalized `app.json` configuration and omits `android.googleServicesFile` only when the configured file is missing; it does not rewrite native files. Missing Firebase configuration means push notification testing is not complete.

## Toolchain

- Use the repository lockfile (`npm ci`) and keep Expo, React Native, React, Reanimated and Worklets versions compatible. Do not run `npm audit fix --force` or install every package's latest major.
- Install JDK 17 and select it as Android Studio's Gradle JDK. A newer bundled Android Studio JDK is not automatically the correct project JDK.
- In Android Studio's SDK Manager, install Android SDK Platform 36, Build-Tools 36.0.0, Platform-Tools, Android Emulator, and Command-line Tools. Install the NDK/CMake versions requested by Gradle if missing.
- Point the ignored `android/local.properties` at the actual SDK location (`sdk.dir=/absolute/path/to/Android/sdk`), or configure the Android SDK environment in your shell. Never commit machine-specific paths.
- In Device Manager, create an Android virtual device; use an ARM64 system image on Apple Silicon. Start it and check `adb devices` before installing.

Use `java -version` and `./gradlew --version` from `android/` to confirm the selected JDK. React Native recommends JDK 17; see [React Native environment setup](https://reactnative.dev/docs/0.81/set-up-your-environment).

## Asset and Lot Listing video — 2026-09-24

The listing cameras record an optional MP4 clip per capture lot at **720p / 30 fps**
(1280 × 720, or the portrait equivalent), with a 5 Mbps target bitrate. Still-photo
quality, manual shutter/FPS and low-light settings cannot raise video resolution or
lower its configured frame rate. Android CameraX uses strict HD with no other-quality
fallback on any lens/rebind path. The fallback camera uses a separate video session,
an explicit MP4 container, and checks the negotiated resolution/FPS before recording.
Unsupported devices show an error and retain normal photo capture. Configured frame
rate is not a promise that a busy/overheating device will deliver every frame; validate
real-device recordings before release. See [CameraX video capture](https://developer.android.com/media/camera/camerax/video-capture).

Done, lot navigation and photo capture cannot race video preparation, recording or
final saving. Native Android records to durable `files/camera-videos`, journals the
original before gallery publication, and hands back the MediaStore URI only after
the updated lot journal is saved. Only then can its own intermediate be removed.
Gallery failure retains the durable original. The fallback records directly into
document storage and retains its existing optional gallery-save behavior; offline
saves and upload retries do not create more original copies.

Both forms show video attachments separately from photo counts and allow reference-only
removal. Direct R2 uploads use existing native streaming/cancellable filesystem transport
with at most four workers. Sparse `mixed_lots[].video_count` values, including zero,
preserve lot associations on both direct and legacy multipart paths. Video bytes are
never put through still-image resizing or watermarking. The camera's existing photo
stamp policy is unchanged. Offline remains Save/review/manual Submit or Resume only.

Backend support must ship before the updated mobile binary: Asset previously discarded
videos during preview generation, and mobile Lot Listing omitted them from submissions.
The updated backend retains trusted R2 originals in previews, file regeneration, merged
Asset reports and the images/media ZIP. A missing clip fails file publication rather
than silently producing a ZIP without it. Existing historical reports are not repaired
or regenerated automatically. No Auctioneer contract, package or migration change is
required; an OTA-only update cannot replace the Android camera changes.

Verification on 2026-09-24: TypeScript and all **73 Jest suites / 587 tests** pass,
including real form submission/resume, sparse video mapping, native transport,
offline reference reuse and fallback-camera mode/unsupported-profile/race tests.
Android and iOS Hermes exports pass with an isolated API. Android debug and test
APK builds pass; API35 instrumentation verifies gallery byte equality, durable
journals, navigation locks, streamed uploads/cancel/four workers and unchanged
photo-watermark receipts/pixels. An actual emulator recording encoded 1280 × 720
with the encoder/muxer explicitly configured at 30 fps / 5 Mbps. Its final measured
cadence was 29.37 fps; an earlier loaded-emulator short sample was 28.91 fps.
Those measurements are retained as device-timing limitations, not hidden by
transcoding or claiming an exact constant rate. Physical Android/iOS, long-video
memory/network endurance, production R2 and signed release testing are still
required. No production data, packages, push or deployment were involved.
The corresponding frozen-source backend run passed all 2,257 tests, typecheck,
build and report-workflow checks, including 122 focused video/upload/merge cases.

## Dependency and configuration checks

The package configuration pins PostCSS to `8.5.28` through an override to address Expo Metro's older pinned version's security advisories. Both Metro and Tailwind use PostCSS 8; their transform APIs were checked before applying this same-major override. Confirm the installed and locked versions with `npm ls postcss` and rerun `npm audit` after dependency changes. Review the override when upgrading Expo; do not override unrelated native dependencies to force an audit result.

SDK 54 still has upstream audit limitations: Metro depends on the affected `image-size` line, and Expo's Xcode configuration tooling depends on the affected `uuid` line. These are not proof of an exploitable mobile runtime, but they must remain visible in audit results. Track upstream fixes or plan a separately tested SDK migration; do not claim a clean audit or use `npm audit fix --force` to hide them.

Expo Doctor's non-CNG/native-configuration synchronization warning is expected for this manually maintained native project. It is not suppressed: `app.json` or config-plugin changes do not automatically synchronize an existing `android/` project. Review and apply required native changes explicitly, then rebuild and test.

## Use an isolated local API

The default API remains `https://api.assetinsightvaluator.com/api`. **Set a local override before opening the app for local tests**; otherwise it uses production. Run a separately configured local backend on port 4000 with isolated test data and storage. Do not copy production secrets or disable production access controls.

From the app repository, start Metro against the host machine through the Android emulator's local network alias:

```sh
EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4000/api npx expo start --dev-client --localhost
```

In another terminal, connect the emulator to Metro and build/install the existing debug project:

```sh
adb reverse tcp:8081 tcp:8081
cd android
./gradlew :app:installDebug
adb shell am start -n com.assetinsight.app/.MainActivity
```

If the development client asks for its development server, use `http://localhost:8081`. The API URL is separate: `10.0.2.2` reaches the host from the standard Android emulator, while `localhost` inside the emulator is the emulator itself. For a USB device, `adb reverse tcp:4000 tcp:4000` lets the API use `http://127.0.0.1:4000/api`; otherwise use the host's private LAN address and verify firewall access.

`EXPO_PUBLIC_API_BASE_URL` is public bundle configuration, not a secret. It accepts HTTPS URLs, or HTTP loopback/private LAN addresses for local development; include the API path, normally `/api`. Invalid overrides fail explicitly instead of silently falling back to production. Trailing slashes are removed. No credentials, query strings or fragments are accepted. Reopen/reload the app after changing the value; rebuild any embedded JavaScript bundle when changing its API. `EXPO_NO_DOTENV=1` keeps these commands independent of unrelated local environment files. See [Expo environment variables](https://docs.expo.dev/guides/environment-variables/) and [Android emulator networking](https://developer.android.com/studio/run/emulator-networking).

The debug Android manifest permits local HTTP. Do not weaken the release manifest or ship a local HTTP override. The app has no custom APK auto-installer; production updates belong in the Play Store release process.

## Verification and troubleshooting

```sh
npx expo install --check
npx tsc --noEmit
npm test
cd android
./gradlew :app:assembleDebug
```

These are verification commands, not evidence that a build or device test has passed. After installation, check startup/logcat, authentication against the isolated API, camera permissions and capture, photo selection/editing, report save/preview, and local upload error/cancel states. A passing unit test or APK build does not verify physical-camera quality, Firebase push, production credentials or release signing.

Use `adb logcat` to investigate a native startup failure. For dependency errors, inspect the first compiler/Gradle error and `npx expo install --check`; do not remove the native project. If Gradle reports the wrong Java version, correct the Gradle JDK and retry. After native dependency changes, rebuild the debug app rather than only reloading Metro.

Local debug APK output is `android/app/build/outputs/apk/debug/app-debug.apk`. This is not a Play Store release artifact. The checked-in release build configuration currently references debug signing; production signing and store upload require a separately reviewed release workflow.

## Production APK through EAS

`npm run android-build` retains the production Play Store AAB build. For a directly
installable release APK, use `npm run android-build:apk`. Its `production-apk`
profile inherits production resource/version settings, selects the production EAS
environment, pins the public production API URL, disables local dotenv overrides,
and uses EAS-managed remote signing credentials. It does not submit to Google Play.
EAS injects signing configuration into the remote build; verify the downloaded
APK signature instead of assuming local Gradle debug signing proves release identity.

`.easignore` excludes local credentials, dotenv files, assistant memory and build
caches from the uploaded source archive. A release APK with a different signing
certificate cannot replace an existing Play Store/debug installation; do not
uninstall the user's installed app or discard its local drafts to work around this.

The inaccessible previous EAS project link has been removed from `app.json`.
Choose the intended Expo account/team before initializing its replacement. Keep
`com.assetinsight.app` as the native identifier and preserve any existing signing
keys; changing the EAS project is not authorization to replace a published app's
signing identity. The dynamic config preserves the new owner/project link when set.

## Local verification record — 2026-09-07

Verified with Node 26, JDK 17 and an ARM64 Android emulator. The SDK 54 dependency compatibility check, TypeScript, all 26 test suites (141 tests), debug APK build/install, and release merged-manifest generation passed. The merged manifests exclude `REQUEST_INSTALL_PACKAGES`.

Against an isolated mock API (no production report or storage writes), checked login validation/session restoration, dashboard and report navigation, all four report forms including agricultural fields, light/dark switching, photo capture, and image editing. Camera access without microphone access must still allow photo preview and capture; regression coverage protects this behavior. The watermark behaviour tested on that date is superseded by the always-stamp camera policy below; existing images are not rewritten.

The shared Asset/Lot full-screen photo viewer uses an explicitly sized image wrapper. File metadata uses the SDK 54 legacy filesystem entry point; do not prepend `file://` to Android `content://` URIs. An unavailable metadata value must settle to `Unavailable`, not an endless loading label. Emulator verification confirmed a new unstamped capture renders full-screen with its resolution and file size.

Remaining verification limits: no physical-device camera testing, production upload/report-generation end-to-end run, Firebase push validation, iOS build, or signed store release. The audit has 20 findings (8 high, 12 moderate; no critical), Expo Doctor passes 17/18 checks with the documented native-sync warning, and repository-wide formatting still has pre-existing failures. These are not an all-green production release certification.

## Double-logo prevention — 2026-09-11

The current product policy is: Asset Insight camera **always stamps one logo**;
the report upload switch is only for imported, unwatermarked photos and defaults
off. Historical receipt-less captures could receive another logo from the backend.
Native Android normal/portrait/night processing now stamps once after adjustments,
writes a byte-bound receipt after encoding/EXIF, and hands off only the completed
saved URI. Done/back/lot navigation wait for capture processing; errors leave the
user able to retry. If AVIF encoding is unavailable, the file correctly uses JPEG
bytes, filename and MIME. The fallback camera lazy-loads the capture-only Skia
processor, normalizes orientation, stamps one logo and saves a receipt-bearing JPEG
before updating the lot. No camera watermark switch is introduced.

Asset/Lot upload services now explicitly send a false watermark choice when it is
missing, for both direct and legacy multipart uploads. Explicit saved opt-ins stay
authoritative, originals and their order are unchanged, and preview edits send
saved URLs rather than uploading those photos again. The backend recognizes the
shared JPEG/WebP/AVIF receipt and never adds another logo to those camera photos,
even when the upload switch is on. Native and React Native image edits rebind a
valid source receipt to the edited output without another overlay. Older marked
photos and third-party re-encodes may lack receipts and should use watermark off.
Neither change removes a logo from an already-submitted photo. Obtain original
photos and an explicitly reviewed report list before any historical repair.

Verification: 44 Jest suites / 266 tests and TypeScript passed. Debug and Android
test APKs built and installed on the emulator. The offline instrumentation runner
verified actual McDougall logo pixels, JPEG/WebP receipt idempotency and native
decoding; the real backend accepted those native files with no extra overlay for
either upload setting. Backend real-image tests also cover AVIF, both encoding
paths and repeated preview/ZIP processing. No new packages, signed APK release,
physical-device/iOS run, deployment or production report/storage mutation.
The Android/Hermes export includes the shared logo asset and passed with an isolated
API URL. Backend verification passed all 1,505 tests and build on the final full
run, plus workflow checks; the first run had local MongoDB test timeouts, and all
five affected suites passed on retry. Targeted production-source lint and diff
checks passed. React guidance keeps capture processing lazy-loaded outside render.

To repeat the offline pixel check, build `:app:assembleDebug` and
`:app:assembleDebugAndroidTest`, install both debug APKs, then run:
`adb shell am instrument -w com.assetinsight.app.test/com.assetinsight.app.PhotoWatermarkInstrumentation`.
Fixtures are written only to the test device's app-owned `files/watermark-qa/`.
Deploy backend support before the new native build; the previous APK build 10
does not contain this updated camera policy. This is not delivered by JS reload.

## Keyboard-safe CRM and Listings — 2026-09-09

`src/components/KeyboardSafeViewport.tsx` is the shared viewport for bounded
dialogs. Android edge-to-edge dialogs can ignore percentage-based keyboard
avoidance. This component uses the keyboard's screen position and the measured
parent frame, avoiding a second subtraction when Android already resized the
window. iOS retains native padding avoidance. Callers still own safe-area padding,
appearance, and a bounded scrolling body. Keep fields and actions scroll-reachable;
do not add another keyboard inset/avoiding wrapper around this viewport.

CRM Quick Add, task updates, email, transfers, calendar selection and coverage
dialogs use `CrmModalFrame`. Expanded Asset/Lot condition editors and report
rejection reuse the neutral viewport. The full-page Asset/Lot forms retain their
direct keyboard-avoiding layout. `ListingTextInput` provides stable, labelled
native controls and bounded multiline editing; field components must not be
declared inside a parent render. Only complete presence tokens such as `Visible`
or `Not visible` are normalized to Yes/No; narrative condition notes are preserved.

Verification: TypeScript, 41 Jest suites / 246 tests, Android production-configured
JavaScript/Hermes export, and `git diff --check` passed. Targeted ESLint had zero
errors and 29 warnings (including existing unused members, imports and hook
warnings, plus test-mock style warnings); this does not claim repository-wide lint
or formatting is clean.

Pixel emulator checks used Android 17 with a real docked Gboard keyboard:

- 360 × 780 dp with 130% text: CRM multiline Notes, scrolling to Cancel/Create,
  Asset Analysis notes, split contract entry (`93530.3-A`), Listing Details
  collapse/reopen, an added empty lot and its outer scrolling, Asset preview
  description editing, and expanded condition field editing/local apply.
- 320 × 640 dp with 150% text: CRM multiline Notes remain above the keyboard;
  Android Back dismisses the keyboard without closing the form, and Cancel is
  scroll-reachable. Long labels wrap without disabling font scaling.

The authorized live sign-in reached device verification; it was not bypassed.
Form testing therefore used an isolated local fixture with no forwarding and
blocked mutation requests. No production leads/reports/photos were changed.
No packages, backend contracts, native dependencies, store release, or new APK
were added. iOS/physical-device IME and TalkBack/VoiceOver acceptance remain
separate checks; native portrait orientation was not changed.

## Full report-review notifications — 2026-09-13

`preview_review_reminder` notifications open a bounded, scrollable plain-text
message before navigating. The view preserves the full reviewed message, report
error and correction steps. Only an explicit **Open related preview** action
navigates to a validated Asset/Lot Listing report; opening the message does not
submit or regenerate anything. Legacy reminders with `route: /drafts`, the old
exact `route: /dashboard`, or
`kind: draft` retain an **Open drafts** action instead of treating a draft ID as
a report ID. Cached reminder details open immediately; background read receipts
and inbox refreshes never delay their display, even offline. Other notification
navigation remains unchanged.

Push payloads are short delivery envelopes, not complete guidance. A push-opened
reminder hydrates through authenticated `GET /notifications/:id`; this owner-only
endpoint uses no-store responses and existing device-access checks. Loading,
unavailable/offline errors and retry are explicit. Never replace failed hydration
with a short push body presented as the full message. Deploy backend support
before distributing the updated app. No native dependencies or packages changed.

Verification: TypeScript and 46 Jest suites / 278 tests passed, including long
messages, literal markup, invalid report links, legacy drafts, failed hydration,
retry, unavailable notifications and slow/rejected read receipts. The backend endpoint passed eight isolated
ownership/device/response tests. No emulator was connected for this change, so
native screen-reader/device layout, real push delivery and store-release testing
remain pending. No native build/install, production notification or report write,
push, or deployment was performed.

## Asset preview bulk required selections — 2026-09-13

Asset previews now support Running Condition, Completeness and Legal both per lot
and for an explicitly selected subset. With multiple lots, the bulk panel offers
Select all (including every lot in a 100-lot report), Clear selection and one-group
updates. Each lot has a labelled checkbox; its individual editor remains collapsed
until opened, avoiding hundreds of unnecessary option panels. Individual overrides
remain authoritative and can be saved/reopened using the existing preview API.

Selection is temporary UI state, not report data. Loading/reloading, saving,
submitting, deleting a lot or replacing uploaded-photo preview data clears it.
Report-context/request-revision guards ignore stale save/load responses and old
delete confirmations instead of applying index selections to replacement lots.
Bulk edits preserve other groups, narrative text, edited lot numbers, photo order
and covers. Asset Running Condition synchronizes both Running/Working Condition
spec aliases (N/A removes both); the older Lot Listing running-condition shortcut
keeps its previous behavior. Completeness and Legal keep unrelated evidence fields.

Verification: TypeScript and 48 Jest suites / 292 tests passed. The new focused
gate includes 100-lot real PreviewScreen rendering, lots 4/8/9, all three groups,
all-lot application, single-lot overrides, save payload/reopen, clear/delete,
reordered refresh, stale save/delete responses, failed-save preservation and
44px-or-larger wrapped controls. Pure policy checks cover immutable data/media
and legacy spec arrays. No emulator/device was attached, so physical layout,
screen-reader and touch acceptance remain pending; no native build/install, EAS,
production API/storage write, packages, push or deployment was performed.

## Auctioneer 2.0 Incoming and next-lot handoff — 2026-09-14

The drawer's Incoming screen preserves the legacy Auctionsoft feed as the default.
A separate Auctioneer 2.0 / Assigned contracts option is enabled only when the
backend reports the modern integration configured and enabled. It lists incoming
contracts, claims the explicitly chosen Asset or Lot Listing type, then validates
the current work-item setup before opening a form. Legacy task IDs are never
converted into modern work-item IDs. Existing linked reports open through the
ordinary report-preview navigation.

Modern forms offer **Generate files & new lot**. The existing upload/analysis
workflow must first accept the report; only then does the app call
`POST /auctioneer/work-items/:id/continue` with that report ID. The backend returns
one deterministic successor with the same contract/type and a new work-item and
client-submission identity. The form remounts only after validating that successor
as an unused unknown-lots claim with empty source lots. Contract details carry
forward; media, entered lots and upstream Schedule A source identifiers do not.
This starts the next capture without waiting for analysis/file generation to finish.

Before upload, the current modern form is saved locally with its optional
`auctioneerWorkItemId`. Reopening validates the saved type, contract, submission ID
and source-lot structure against a fresh setup. Missing or mismatched drafts fail
closed. A linked upload placeholder can resume only from its exact saved draft
when the backend explicitly sets `canResumeUpload: true`; it cannot open a fresh
blank form. Accepted, sent or abandoned work cannot silently become new capture.
Initial Schedule A source-lot count, order and grouping remain fixed, and each
submitted lot keeps its canonical source key. Ordinary and legacy forms retain
their prior behavior.

Fixed Schedule A capture uses the existing React Native backup camera with an
explicit structure lock: it cannot create another lot, change grouping or remove
an empty source row. Navigation among existing source lots, Bundle and Extra
capture remain available, and camera headings retain imported display lot numbers.
These labels do not change stored IDs, indices or media filenames. The legacy
Android camera can create/rekey/delete rows,
so it is not opened for these fixed-lot sessions. Ordinary and unknown-lot capture
still use the native camera as before. Backup capture always stamps one logo
before publishing the completed photo, and close/lot navigation wait for capture
processing; the upload watermark switch and receipt handling are unchanged.
No Kotlin or native dependency changes are required for this scoped routing fix,
but users still need an updated app build to receive the feature.

An offline queue receipt is not server acceptance. This action leaves offline
media and the current form intact and asks the user to retry online. After server
acceptance, a failed handoff keeps the original form behind a gate whose retry
only resolves/continues that accepted report; it never uploads it again. If the
deterministic successor was already used elsewhere, the gate explains how to
reopen Incoming/Reports instead of mounting an empty form. Handoff messages and
controls use the native light/dark theme and bounded safe-area scrolling.

Verification: `npm run typecheck` and all 53 Jest suites / 364 tests passed,
including 39 service/form policy and acceptance cases, 10 modern Incoming
screen/navigation cases, 8 camera-routing cases and 15 locked-camera cases.
Camera tests cover imported labels, stale handlers, main/Extra/video media,
deferred stamp completion, close/navigation fencing, failed stamps and unchanged
ordinary capture. Tests use mocked network/storage only. Android/Hermes
export passed with `EXPO_NO_DOTENV=1`, an isolated localhost API URL and temporary
output outside the repository (1,955 modules; 6.52 MB Hermes bundle). Targeted
source ESLint has zero errors and only existing warnings; `git diff --check`
passed. Emulator interaction QA was blocked before app startup: the installed
Android 37.1 image reported a missing `super` partition and kernel panic. No app
requests ran in that check, and all QA processes were stopped. Physical-device/iOS,
screen-reader, live upstream delivery and store-release checks remain pending.
No packages, native dependency/config changes, production API/storage writes,
signed release, push or deployment were performed for this feature. Deploy the
coordinated backend contract before distributing the updated native app.

## Owner-scoped offline capture storage (2026-09-17)

Asset and Lot Listing local drafts now use the SDK54-compatible `expo-sqlite`
module (16.0.10). A new native build is required; a JavaScript-only update does
not install SQLite or the camera journal/upload methods. Use JDK17 for local
Gradle builds; the currently installed Android Studio runtime is JDK25.

`OfflineCaptureStore` stores metadata only: owner-scoped draft identity, stable
capture/submission IDs, ordered lot/media references, compact summaries, and a
revision-bound inventory outbox. WAL/exclusive transactions and one serialized
metadata writer protect partial saves. Changed lots use bounded multi-row writes;
unchanged lots/media are not rewritten. Listing reads use the summary table
without loading every photo reference. Contract numbers are grouping metadata,
never draft uniqueness keys. A new Offline draft may have no contract number yet.

Original Android camera photos stay in MediaStore. When gallery publication is
unavailable the already-stamped photo lives under native `files/camera-photos`,
not a purgeable cache. The intermediate stamped file is removed after successful
gallery publication. Offline persistence reuses those durable references and
the fallback camera's document-directory original; it does not copy them into
another draft directory. Temporary/foreign-provider imports still require one
managed durable copy. Import work is bounded to four operations. Each missing
photo remains an ordered, explicitly missing placeholder rather than silently
being removed. Gallery/camera originals are never deleted by draft cleanup.
Managed cleanup is owner-scoped and respects cross-draft and legacy references.

Android capture commits an atomic metadata journal keyed by owner and draft
under `files/capture-journals`. The journal retains session/revision identities
until JavaScript confirms its draft transaction. Done does not consume it.
Reopening that draft offers an explicit recovery with lot/photo counts, even
without opening the camera. The action refuses to replace photos edited while
its confirmation was open. A stale session/revision or another owner cannot
acknowledge it. Legacy unowned camera cache is not silently attached to a user.
Acknowledgement retains only an identity/revision tombstone, so restarting a
camera session cannot reuse an earlier acknowledged revision. Both native and
SQLite journals reject stale acknowledgements after a later capture.

The fallback camera (including iOS and fixed imported lots) uses the same
owner/draft recovery contract through a metadata-only SQLite pending-capture
journal. Photo and video handoff waits for the local draft transaction before
acknowledging that journal or enabling Done/navigation. Failed saves keep the
originals and offer retry from Done; reopening offers explicit journal recovery.
Video originals are moved out of temporary camera storage without an additional
offline copy. Offline/manual-submission captures never invoke cloud enhancement,
even when the report's enhancement preference is retained. Switching into that
mode cancels active enhancement and suppresses queued requests.

The native module streams `content://media` uploads directly with an exact known
length, four transfer slots, progress, cancellation, HTTPS-only URLs and disabled
redirects. JavaScript never materializes the original as Blob/base64 for this
path. `getContentUriInfo` closes its descriptor and reads actual provider length;
avoid Expo legacy `getInfoAsync(content://)` here because its implementation uses
`InputStream.available()` and does not close that stream.

Old AsyncStorage draft/autosave/queue JSON remains preserved in a SQLite recovery
quarantine and in its original key. It is not auto-owned, auto-synced or submitted.
The explicitly confirmed recovery action retains original identities and media
references. Legacy queued work becomes a paused review-only draft; imported work
without trustworthy incoming mappings must be revalidated before upload. Accepted
and discarded drafts leave the normal list but retain metadata/outbox history.
Original photos and unverified legacy folders are retained conservatively.
Once Offline has been selected, a sticky manual-submission flag prevents later
mode changes from enabling background photo/draft uploads. Metadata continues to
sync after those changes. A terminal inventory-validation error pauses only that
metadata revision and appears in its local summary; a new save clears the error
and creates a new revision. This never auto-submits a report.
Imported legacy drafts and queued work both require Incoming review when their
own integration snapshot is missing. Media operations freeze their owner and
directory before awaiting work, abort after account changes, and recheck before
copy/delete/thumbnail side effects. Existing-media descriptor checks share a
four-operation bound even when no import/copy is needed for a 5,000-photo draft.

Verification includes real in-memory SQLite tests for owner isolation, 5,000
photo batching, unchanged-media writes, CAS revisions, legacy claims and outbox
acknowledgements; camera handoff/recovery tests; and no-copy/bounded-import tests.
The Android journal has isolated instrumentation assertions alongside watermark
and real MediaStore upload checks. These require an attached working emulator or
device and do not replace real-storage interrupted-upload or iOS device QA.
The isolated Pixel_10_Pro_XL emulator booted successfully with a read-only,
no-snapshot SwiftShader session. Native journal owner/revision acknowledgements
and JPEG/WebP watermark pixel/receipt checks passed with WiFi and cellular disabled.
Debug APK, AndroidTest APK and instrumentation Java/Kotlin compilation passed.
The native uploader also passed against an isolated loopback HTTPS fixture:
exact Content-Length and SHA256 bytes, progress, changed-length rejection,
active and queued cancellation, duplicate transfer IDs, and four-worker bounds.
The journal test includes acknowledgement followed by a new capture and a late
old acknowledgement. Test-only TLS trust was restored and the two fixture gallery
rows were removed. No production endpoint or storage credentials were used.
No production login, report upload, database or storage operation was used.
## Report Activity verification — 2026-09-18

The native capture journal now retains compact activity through crash/handoff,
including Next Lot, per-lot counts, stable photo positions and removal/reordering.
The existing offline instrumentation runner also exercises a 25-lot/5,000-photo
metadata fixture, restart, exact/stale acknowledgement and no duplicate replay.
It uses local fixture files and loopback HTTPS, not production APIs or login.

Verification passed: 67 Jest suites/520 tests, TypeScript, Android debug/test
builds and Android/iOS Hermes exports. Actual emulator instrumentation passed
the journal checks, streamed content-URI exact bytes/progress, four-worker bound,
active/queued cancellation, native logo pixels and receipt idempotency.
Full hardware capture endurance, physical iOS and production rollout remain
unverified; these are not implied by metadata or emulator tests. This change
requires backend support first and a new native binary, not an OTA-only release.
