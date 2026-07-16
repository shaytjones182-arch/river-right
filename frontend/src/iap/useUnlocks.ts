// Local entitlement store.
//
// Tracks which river-run IDs the user has unlocked. Mocked today via
// AsyncStorage. When we wire up real Apple StoreKit IAP, this file does NOT
// change shape — only the contents of `unlock()` swap from a local write to
// a StoreKit purchase call followed by the same local write on success, and
// `restorePurchases()` swaps from a no-op to `RNIap.getAvailablePurchases()`.
//
// Consumers (PaywallSheet, ProfileMenu, river card UI) stay identical.

import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@riverright:unlocked_runs_v1";

// ─── TEMPORARY PAYWALL BYPASS ──────────────────────────────────────────────
// Set to `true` to treat every river as already unlocked for ALL users.
// Used to ship TestFlight builds for field testing the curated maps
// (offline tile downloads, polylines, POIs) while the In-App Purchase
// products are still pending review in App Store Connect.
//
// REVERT BEFORE PUBLIC LAUNCH — flip this back to `false` and the
// normal paywall flow ("pay to download" → "download" → "downloaded")
// resumes for any river the user hasn't actually purchased.
const BYPASS_PAYWALL_FOR_TESTFLIGHT = false;

// ─── TEMPORARY: DISABLE LOCAL UNLOCK PERSISTENCE ───────────────────────────
// Set to `true` to prevent the app from remembering purchases in
// AsyncStorage across launches. When enabled:
//   • The stored unlock set is CLEARED on every app launch, so testers
//     always start with zero unlocked rivers regardless of what they
//     bought last session.
//   • Successful purchases still unlock the river IN-MEMORY for the
//     current session (so testers can verify the "downloaded" state),
//     but the unlock is NOT written back to disk.
// Used specifically for TestFlight campaigns where multiple sandbox
// accounts need to make purchases on the same device to verify
// Apple-side transaction recording. Apple's own record (per sandbox
// Apple ID) is untouched by this flag — that's what testers are
// verifying. To force a "fresh" purchase attempt with a sandbox ID
// that has already bought a run, testers must either sign in with a
// different sandbox account (Settings → App Store → Sandbox Account)
// or clear purchase history for the existing sandbox tester in App
// Store Connect (Users and Access → Sandbox Testers → Edit → Clear
// Purchase and Subscription History).
//
// REVERT BEFORE PUBLIC LAUNCH — flip this back to `false` so real
// users' unlocks survive app restarts / reinstalls without them
// having to tap "Restore Purchases" each time.
const DISABLE_UNLOCK_PERSISTENCE = true;

type Listener = (set: Set<string>) => void;
let memoryCache: Set<string> | null = null;
const listeners = new Set<Listener>();

async function readFromStorage(): Promise<Set<string>> {
  // When persistence is disabled (multi-sandbox-tester campaigns), we
  // wipe any previously-stored unlocks on read and return an empty set,
  // so every launch of the app starts with zero owned rivers regardless
  // of what a prior test purchase saved.
  if (DISABLE_UNLOCK_PERSISTENCE) {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore — worst case is stale data lingers until next launch */
    }
    return new Set();
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x) => typeof x === "string"));
  } catch {
    return new Set();
  }
}

async function writeToStorage(set: Set<string>) {
  // Bail out silently when persistence is off. The in-memory Set that
  // consumers see is still updated by the caller, so within a single
  // session the UI reflects the unlock — it just doesn't survive a
  // relaunch.
  if (DISABLE_UNLOCK_PERSISTENCE) return;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // Best-effort; in-memory cache still reflects the unlock for this session.
  }
}

function notify() {
  if (!memoryCache) return;
  for (const l of listeners) l(new Set(memoryCache));
}

/** Mark a river ID as unlocked locally. In production this is called AFTER
 *  StoreKit confirms a successful purchase. */
export async function unlockRunLocally(riverId: string): Promise<void> {
  if (!memoryCache) memoryCache = await readFromStorage();
  memoryCache.add(riverId);
  await writeToStorage(memoryCache);
  notify();
}

/** Restore previously-purchased runs. Today this just reloads from
 *  AsyncStorage (no-op). In production this calls
 *  `RNIap.getAvailablePurchases()` and merges Apple-confirmed entitlements. */
export async function restorePurchasesLocally(): Promise<number> {
  const reloaded = await readFromStorage();
  memoryCache = reloaded;
  notify();
  return reloaded.size;
}

/** Dev-only helper for testing: wipes all unlocked runs. */
export async function _devResetUnlocks(): Promise<void> {
  memoryCache = new Set();
  await writeToStorage(memoryCache);
  notify();
}

export function useUnlocks() {
  const [unlocked, setUnlocked] = useState<Set<string>>(
    () => memoryCache ?? new Set()
  );
  const [ready, setReady] = useState<boolean>(memoryCache !== null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!memoryCache) memoryCache = await readFromStorage();
      if (!mounted) return;
      setUnlocked(new Set(memoryCache));
      setReady(true);
    })();
    const l: Listener = (s) => {
      if (mounted) setUnlocked(s);
    };
    listeners.add(l);
    return () => {
      mounted = false;
      listeners.delete(l);
    };
  }, []);

  const isUnlocked = useCallback(
    (riverId: string) =>
      BYPASS_PAYWALL_FOR_TESTFLIGHT ? true : unlocked.has(riverId),
    [unlocked]
  );

  return { ready, unlocked, isUnlocked };
}
