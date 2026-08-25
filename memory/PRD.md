# RiverRunner — Product Requirements (MVP)

## Vision
A river-focused GPS app for both whitewater and calmer river trips, surfacing live USGS flow data and curated river guide info for the United States.

## Audience
Kayakers, rafters, canoeists, and casual paddlers in the U.S.

## MVP Scope (built)
- **Live GPS tracking**: OSM map (Leaflet via WebView/iframe) with route trail, current speed (mph), distance (mi), elapsed time, max speed. Uses `expo-location` foreground permission.
- **USGS flow data**:
  - Nearby gauges by current location + radius (default 50 mi)
  - Browse by U.S. state (19 paddler-relevant states)
  - Filter/search by river name or site ID
  - Per-site detail with CFS, gauge height (ft), status badge (Low / Runnable / High / Flood) and mini map
- **River guidebook**: 8 curated rivers (whitewater + mixed + calm) with class rating, hazards, put-in / take-out coordinates, and live flow data joined from USGS.
- **Bottom-tab navigation**: Home, Track, Gauges, Rivers, plus pushable detail screens (`/river/[id]`, `/gauge/[id]`).

## Tech
- **Frontend**: Expo SDK 54, expo-router, react-native-webview, expo-location, Leaflet + OpenStreetMap.
- **Backend**: FastAPI proxy to `waterservices.usgs.gov/nwis/iv/` (no API key needed).
- **Storage**: None for MVP (no auth, no trip history).

## Out of scope (future)
- Trip logging / history persistence
- Offline maps and offline gauge cache
- International (non-USGS) flow sources
- Authentication
- Per-river runnable CFS ranges (current status uses heuristic global buckets)

## Smart enhancement opportunity
Add a "Trip Sharing" feature — generate a shareable link/QR of a completed GPS track + the day's river flow snapshot. Drives organic growth via paddling communities (Facebook groups, AW boater forums) and creates a content loop back into the app.

## Update — June 2026 (build 8)
- Fixed "Redeem special offer code" doing nothing in TestFlight: root cause was `Linking.canOpenURL("itms-apps://...")` always returning false on iOS because `itms-apps` was not declared in `LSApplicationQueriesSchemes`. Fix: removed the canOpenURL gate in `src/iap/storekit.ts` (openURL directly, with `https://apps.apple.com/redeem` universal-link fallback) and added `LSApplicationQueriesSchemes: ["itms-apps"]` to `app.json` ios.infoPlist.
- Bumped versions per standing rules: 1.0.7 / iOS build 8 / Android versionCode 8.

## Update — June 2026 (build 9): offer-code transactions never delivered into app
- Root cause: NO `purchaseUpdatedListener` was ever registered (comments claimed initStoreKit installed one, but it didn't). Offer-code redemptions completed at Apple but the app had no callback receiving the transaction. Paid purchases only worked because purchaseRun() polls getAvailablePurchases() afterwards.
- Fix in `src/iap/storekit.ts`:
  - `armTransactionListeners()`: registers `purchaseUpdatedListener` + `purchaseErrorListener` BEFORE `initConnection()` so queued transactions are delivered on connect. Every event traced; unlock + finishTransaction each wrapped in try/catch that traces errors.
  - `armForegroundResync()`: on AppState "active", calls restoreRuns() and unlocks all Apple-owned rivers (safety net when returning from App Store).
  - Trace log now persisted to AsyncStorage (`@riverright:storekit_trace_v1`); Diagnostics alert shows previous-session tail + current session.
  - restoreRuns() now traces getAvailablePurchases results/failures instead of silent console.warn.
- Versions bumped: 1.0.8 / iOS build 9 / Android versionCode 9.

## Update — June 2026 (build 10): StoreKit native calls were deadlocking
- Evidence from user's build-9 trace: "resyncing owned products" lines appeared but the result lines (`getAvailablePurchases: N items`, `fetchProducts: returned`) NEVER did — the native expo-iap promises were hanging, not returning empty.
- Root cause: iOS StoreKit ops via expo-iap must not run concurrently (hyochan/expo-iap#130). App fired them concurrently (startup init + _layout restore + AppState resync on every foreground), locking the queue so no promise ever resolved.
- Fix in `src/iap/storekit.ts`:
  - `iapCall(label, fn, timeoutMs)`: serializes ALL native calls (initConnection, fetchProducts, getAvailablePurchases, requestPurchase, finishTransaction) through a single promise chain; each call has a hard timeout (15s default, 120s for requestPurchase) that traces "TIMEOUT — native call never resolved" instead of silent hang.
  - Foreground resync now single-flight (`_resyncInflight` guard) — skips + traces if previous resync still pending.
- Versions bumped: 1.0.9 / iOS build 10 / Android versionCode 10.
