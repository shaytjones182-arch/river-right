# RiverRight — Standing Rules (do not violate)

These rules are set by the project owner and MUST be enforced by every agent
session on this repo. Do not treat them as advisory. If a change conflicts
with any of them, revert the change or restore the missing value.

---

## 1. `frontend/app.json` — required `expo.extra` block

Whenever `frontend/app.json` is generated, modified, or restored, the file
MUST contain this exact block under `expo.extra`:

```json
"extra": {
  "router": {},
  "eas": {
    "projectId": "7d527e8a-3a24-46b9-ab47-7be0e252c405"
  }
}
```

Rationale: this field is normally produced by the EAS CLI on the owner's
local machine and never by anything in the agent's environment, so it will
NOT appear naturally in edits generated here. Builds fail to submit
correctly without it.

Rule: preserve on every edit. If it's missing (for any reason — reset,
regeneration, template restore, migration), restore it verbatim.

---

## 2. Pre-push checklist for `main`

Before every push to `main`, VERIFY all four of the following. Do not push
if any of them is wrong:

1. `frontend/app.json` → `expo.plugins` array contains `"expo-iap"` and
   does NOT contain `"react-native-iap"`.
2. `frontend/app.json` → `expo.version`, `expo.ios.buildNumber`, and
   `expo.android.versionCode` are ALL incremented relative to whatever
   is currently on `main`. Bump all three in lockstep.
3. `frontend/eas.json` → `submit.production.ios.ascAppId` is still
   `"6772459732"`.
4. `frontend/app.json` → the `expo.extra` block from rule #1 is intact.

If any check fails, fix it FIRST and re-verify before proceeding.

---

## 3. Reference: current known-good values (last verified)

- App Store Connect App ID (`ascAppId`): `6772459732`
- EAS `projectId`: `7d527e8a-3a24-46b9-ab47-7be0e252c405`
- IAP plugin: `expo-iap` (NOT `react-native-iap`)
