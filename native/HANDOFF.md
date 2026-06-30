# Native handoff — finish on a Mac, ship to TestFlight

This repo's PR brought barycal's **web + backend** conversion to native as far as a
Linux/CI environment can: the Capacitor config, the runtime bridge, native
share/clipboard + NFC wiring, the push backend, and the daily-reminder cron are
all written and green in CI. What remains needs a **Mac** (Xcode + Android SDK)
and **developer/cloud accounts**, so it's handed off to a local coding agent.

**Read `native/README.md` first** — it has the detailed setup commands. This file
is the ordered runbook + acceptance criteria. Do the steps in order.

> Goal: a working iOS build uploaded to **TestFlight** (and an Android internal
> testing build), with **all** of barycal's native-relevant features wired —
> including any added after this PR (see Step 1).

---

## Step 1 — FIRST: sweep for new features and convert them

> **Status (swept 2026-06-30):** Full codebase sweep done against `main`
> (commits since the conversion: #36 eslint, #37 superadmin/admin console + TOTP
> MFA, #39 MFA hardening). Result:
> - **MFA** renders its TOTP QR **server-side as an SVG** (`lib/actions/mfa.ts`,
>   `QRCode.toString`) for the user to scan with their authenticator app — a
>   displayed image, not camera use; works in the WebView untouched. No bridge.
> - **`/superadmin/*`** is same-origin (covered by `server.allowNavigation`) and
>   intentionally **not** a universal-link target — left out of AASA on purpose.
> - **One gap fixed:** the profile **Share** button (`components/ProfileView.tsx`)
>   bypassed the bridge with a raw `navigator.clipboard.writeText`. Now cascades
>   `nativeShare → nativeCopy → Web Share → clipboard`, mirroring `link.js`. Uses
>   the already-wired `@capacitor/share`/`@capacitor/clipboard` — **no new plugin**.
> - Cast (share/clipboard/NFC/QR/audio) and push were already wired. Web build +
>   87 unit tests still green. **Re-sweep only if features land after 2026-06-30.**

The web app is being developed concurrently, so features may have landed after
this conversion. Before building, find anything native-relevant and wire it
through the **same bridge pattern** used here, so it works in the shell.

**The pattern (don't deviate):** web code feature-detects the injected
`window.Capacitor` and calls injected plugins; **no `@capacitor/*` import ever
enters the Next.js bundle**. The bridge centralizes this. Reference
implementations to copy:

- `lib/native/bridge.js` — `isNative()`, `nativeShare()`, `nativeCopy()`,
  `nativeNfcSupported()/nativeWriteUrlTag()`, `registerPush()`, `initNative()`.
- `app/rooms/_client/cast/link.js` — share/clipboard wired behind the existing
  Web API path.
- `app/rooms/_client/cast/nfc.js` — native plugin behind the stable
  `nfcSupported()/writeRoomToTag()` interface (no call-site changes).

**How to sweep** (from the branch point of this PR to `main`):

```bash
git fetch origin
git diff --stat <this-PR-merge-base>..origin/main   # what changed since the conversion
```

Then grep for native-relevant capabilities the WebView can't do well, or that
feel better native, and wire each one:

| Look for | Examples to grep | Native plugin to add behind the bridge |
| --- | --- | --- |
| New "cast"/share surfaces | `app/rooms/_client/cast/*`, `navigator.share`, `clipboard` | `@capacitor/share`, `@capacitor/clipboard` (already wired) |
| Camera / QR / scanning | `getUserMedia`, `BarcodeDetector`, `jsqr` | works in WebView; just ensure permission strings (Step 5) |
| Microphone / audio | `getUserMedia`, `AudioContext`, `chirp` | works in WebView; permission strings |
| NFC | `NDEFReader`, `cast/nfc.js` | `@exxili/capacitor-nfc` (wired; verify — Step 4) |
| Geolocation | `navigator.geolocation` | `@capacitor/geolocation` |
| Push / notifications | `Notification`, new `/api/push/*` | `@capacitor/push-notifications` (wired) |
| Local files / photos | `<input type=file>`, downloads | `@capacitor/filesystem`, `@capacitor/camera` |
| Haptics, status bar, app links | new deep-linkable routes | `@capacitor/haptics`; update AASA paths (Step 7) |
| New deep-linkable routes | new `app/**/page.tsx` reachable by URL | add to `apple-app-site-association` + `assetlinks.json` + `server.allowNavigation` |

For each new capability: add a **guarded** helper to `lib/native/bridge.js`
(degrade to the web path / no-op when the plugin or runtime is absent), wire the
consumer behind `isNative()`, add the plugin to the install list, and note it.
**Acceptance:** the web build is unchanged for browsers (`npm run build` +
`npm run test` still pass) and the new feature has a native path.

## Step 2 — Generate the native projects

```bash
npm i -D @capacitor/cli @capacitor/assets
npm i @capacitor/core @capacitor/share @capacitor/clipboard \
      @capacitor/push-notifications @capacitor/status-bar \
      @capacitor/splash-screen @capacitor/browser @exxili/capacitor-nfc
# …plus any plugins Step 1 added.
npx cap add ios
npx cap add android
npx cap sync
```

`capacitor.config.ts` already points `server.url` at `https://barycal.com`
(override with `CAP_SERVER_URL` for a preview origin — must be HTTPS). Commit
`ios/` and `android/` once generated.

## Step 3 — Icons & splash

```bash
npx @capacitor/assets generate --iconBackgroundColor '#0C0B10' \
    --splashBackgroundColor '#0C0B10'
```

(Source art: `public/icon.svg`, or supply a 1024² PNG.)

## Step 4 — Verify native NFC (can't be tested without a device)

The bridge calls `window.Capacitor.Plugins.NFC|Nfc`'s
`writeNDEF({ records: [{ type: 'U', payload }] })` (`@exxili/capacitor-nfc`).
Confirm the **registered plugin name** and **method signature** against the
installed version; adjust `nfcPlugin()` in `lib/native/bridge.js` if they differ.
Test writing a tag on a real Android device and an iPhone (Core NFC).

## Step 5 — Native permissions (App Store / Play review will reject without these)

- iOS `ios/App/App/Info.plist`: `NSCameraUsageDescription`,
  `NSMicrophoneUsageDescription`, `NFCReaderUsageDescription`. Add the **Push
  Notifications** + **Associated Domains** capabilities (`applinks:barycal.com`).
- Android `android/app/src/main/AndroidManifest.xml`: `CAMERA`, `RECORD_AUDIO`,
  `NFC`; App Links intent filters for `barycal.com`.
- Add usage strings for anything Step 1 introduced (e.g. location).

## Step 6 — Push (Firebase + APNs)

1. Firebase project; add iOS + Android apps with id `com.barycal.app`.
2. Android: `google-services.json` → `android/app/`. iOS: `GoogleService-Info.plist`
   → Xcode project; upload an **APNs auth key (.p8)** in Firebase so FCM relays to iOS.
3. App-worker secrets (from the service-account JSON) so `lib/push/send.ts` works:
   ```bash
   wrangler secret put FCM_PROJECT_ID
   wrangler secret put FCM_CLIENT_EMAIL
   wrangler secret put FCM_PRIVATE_KEY   # the PEM "private_key" field
   ```

## Step 7 — Deep links

- `public/.well-known/apple-app-site-association`: replace `TEAMID` →
  `TEAMID.com.barycal.app`. Serve over HTTPS, no redirect, `content-type:
  application/json` (verify the static asset's type; if Workers serves it as
  octet-stream, serve it from a tiny route instead).
- `public/.well-known/assetlinks.json`: replace the SHA-256 with the **release**
  signing cert fingerprint (Play Console → App signing, or `keytool -list -v`).
- Add any new deep-linkable routes from Step 1 to both files + `allowNavigation`.
- Verify URL **fragments survive** the handoff so room links
  (`/rooms/enter#i=…&k=…`) still decrypt client-side.

## Step 8 — Deploy the reminder cron

```bash
cd workers/push && npm install
wrangler secret put CRON_SECRET -c ./wrangler.toml   # pick a long random value
npm run deploy
# Same secret on the app worker (repo root) so the route accepts the call:
wrangler secret put CRON_SECRET
```

`APP_URL` is already set in `workers/push/wrangler.toml`. Confirm a tick with
`npm run test:scheduled` (in `workers/push/`) and check `wrangler tail`.

## Step 9 — Build, run, and verify on device

```bash
npx cap sync
npx cap run ios          # or open in Xcode:  npx cap open ios
npx cap run android
```

Acceptance checklist (on a real device):
- [ ] App loads barycal.com; **login persists across a cold start** (WKWebView cookies).
- [ ] QR scan prompts the native camera permission and reads.
- [ ] Audio "chirp" cast works (mic permission).
- [ ] Share opens the **native** sheet; clipboard copy works.
- [ ] NFC write works (Android + iOS) — Step 4.
- [ ] A test FCM push arrives; `push_tokens` gets a row after launch.
- [ ] `https://barycal.com/e/<id>` and a room link open **in the app**.
- [ ] Every feature wired in Step 1 works natively.

## Step 10 — Ship to TestFlight (and Play internal)

- iOS: in Xcode, set the Team + bundle id `com.barycal.app`, bump build number,
  **Product → Archive → Distribute App → App Store Connect → Upload**. Complete
  export compliance + the App Privacy form (phone number collected for OTP). The
  build appears in **TestFlight**; add internal testers.
- Android: `cd android && ./gradlew bundleRelease`, sign, upload the `.aab` to
  **Play Console → Internal testing**; complete the Data safety form.
- Both: privacy-policy URL, content rating, screenshots.

Only after Step 9's checklist is fully green should you push the TestFlight build.
