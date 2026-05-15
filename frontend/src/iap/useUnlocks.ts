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

type Listener = (set: Set<string>) => void;
let memoryCache: Set<string> | null = null;
const listeners = new Set<Listener>();

async function readFromStorage(): Promise<Set<string>> {
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
    (riverId: string) => unlocked.has(riverId),
    [unlocked]
  );

  return { ready, unlocked, isUnlocked };
}
