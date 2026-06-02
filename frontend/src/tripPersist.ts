// Active-trip persistence.
//
// The Trip Tracker tab keeps the in-progress trip in React state. iOS will
// kill the app process after enough time backgrounded (especially with
// continuous GPS running), so we need to flush the live state to disk
// periodically + on AppState background. On cold launch we look for a
// recently-saved active trip and offer to resume.
//
// Storage is intentionally a single JSON blob under one key — small enough
// (a few hundred KB worst case for a multi-day trip) that we don't bother
// with chunking, and atomic enough that a partial write can never produce
// an unparseable state (AsyncStorage writes are atomic per key).

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TripDay, TripPoint } from "./storage";

const KEY = "@riverright:active_trip_v1";
// If an "active" trip is older than this, we ignore it on cold launch —
// it's almost certainly a stale leftover from a long-since-killed process.
const RESUME_WINDOW_MS = 36 * 60 * 60 * 1000; // 36 h

export type ActiveTripSnapshot = {
  /** Always bumped on each save so we can ignore stale rehydrates. */
  savedAt: number;
  /** "idle" never persists — we only save while tracking or paused. */
  tripState: "tracking" | "paused";
  tripStartedAt: number;
  dayStartedAt: number | null;
  /** Cumulative paused milliseconds before the current segment.  Used to
   *  derive total elapsed seconds from `Date.now() - dayStartedAt`. */
  pausedMs: number;
  /** If `tripState === 'paused'`, the epoch ms when we paused (for adding
   *  to `pausedMs` on resume). Null while tracking. */
  pausedAt: number | null;
  river: { id: string | null; name: string | null };
  loggedDays: TripDay[];
  // Current-day accumulators
  points: TripPoint[];
  distMiles: number;
  movingSec: number;
  maxMph: number;
};

export async function saveActiveTripSnapshot(s: ActiveTripSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    // Best-effort. Don't surface to UI.
    console.warn("saveActiveTripSnapshot", e);
  }
}

export async function loadActiveTripSnapshot(): Promise<ActiveTripSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ActiveTripSnapshot;
    if (!s || typeof s !== "object") return null;
    if (!s.savedAt || Date.now() - s.savedAt > RESUME_WINDOW_MS) {
      // Too old — drop it silently.
      await AsyncStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch (e) {
    console.warn("loadActiveTripSnapshot", e);
    return null;
  }
}

export async function clearActiveTripSnapshot(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
