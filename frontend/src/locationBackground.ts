// Background-location plumbing for RiverRight.
//
// When the user taps START on the Track tab we register a TaskManager task
// with expo-location's `startLocationUpdatesAsync`. iOS / Android will then
// deliver GPS pings to the task even when the JS engine has been suspended
// (phone locked, app backgrounded, screen off in the user's drybag, etc.).
//
// The catch: when the task fires in the background the React tree isn't
// alive, so we CAN'T poke trip-state directly. Instead the task writes
// every ping to an AsyncStorage queue. When the Track tab next comes to
// the foreground it calls `drainBackgroundQueue()` to fold the queued
// pings into live trip state and clear the queue.
//
// CRITICAL: `TaskManager.defineTask` must be called at MODULE TOP LEVEL —
// not inside a component / effect — because both iOS and Android need to
// find the task definition immediately on cold app launch (otherwise the
// OS gives up and drops the location update).

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export const RR_BG_LOCATION_TASK = "rr-bg-location-task";
const QUEUE_KEY = "@riverright:bg_location_queue_v1";

/** Shape of one queued location ping. */
export type BgLocPing = {
  lat: number;
  lon: number;
  ts: number; // ms since epoch
  speed?: number | null; // m/s as reported by the OS
  acc?: number | null; // horizontal accuracy in meters
};

/* ------------------------------------------------------------------ */
/*  Task definition (module top level)                                 */
/* ------------------------------------------------------------------ */

if (Platform.OS !== "web" && !TaskManager.isTaskDefined(RR_BG_LOCATION_TASK)) {
  TaskManager.defineTask(RR_BG_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[bg-location] task error:", error);
      return;
    }
    const locations =
      (data as { locations?: Location.LocationObject[] } | undefined)
        ?.locations || [];
    if (!locations.length) return;
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      const queue: BgLocPing[] = raw ? JSON.parse(raw) : [];
      for (const loc of locations) {
        if (!loc?.coords) continue;
        queue.push({
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
          ts: loc.timestamp || Date.now(),
          speed: loc.coords.speed ?? null,
          acc: loc.coords.accuracy ?? null,
        });
      }
      // Hard cap so a long offline trip doesn't blow up AsyncStorage.
      const MAX = 20000;
      const trimmed = queue.length > MAX ? queue.slice(-MAX) : queue;
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[bg-location] failed to persist ping(s):", e);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Request the "Always" permission (background) AFTER foreground permission
 * has already been granted. iOS requires the two-step flow.
 * Returns true if background is authorized.
 */
export async function ensureBackgroundPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) return false;
  const bg = await Location.getBackgroundPermissionsAsync();
  if (bg.granted) return true;
  const req = await Location.requestBackgroundPermissionsAsync();
  return req.granted;
}

/** True if the background task is currently registered with the OS. */
export async function isBackgroundLocationRunning(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(RR_BG_LOCATION_TASK);
  } catch {
    return false;
  }
}

/** Start delivering background location pings to the registered task. */
export async function startBackgroundLocation(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (await isBackgroundLocationRunning()) return true;
  try {
    await Location.startLocationUpdatesAsync(RR_BG_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      // Throttle pings a bit so iOS doesn't drain the battery in calm flat
      // water (where positions barely change). 4 s / 5 m is a good balance
      // for river-trip recording.
      timeInterval: 4000,
      distanceInterval: 5,
      // OtherNavigation is the right activity hint for water sports —
      // iOS won't try to auto-pause "because the user stopped walking".
      activityType: Location.ActivityType.OtherNavigation,
      pausesUpdatesAutomatically: false,
      // Show the iOS blue/green pill-shaped indicator at the top of the
      // screen ("RiverRight is using your location"). This both reassures
      // the user that GPS is actively running in the background AND
      // signals to iOS that the app is a legit nav app, which helps
      // avoid aggressive throttling during multi-hour offline trips.
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "RiverRight is recording your trip",
        notificationBody:
          "GPS tracking continues while the app is in the background.",
        notificationColor: "#1a2440",
      },
    });
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[bg-location] failed to start updates:", e);
    return false;
  }
}

/** Stop the background task. Idempotent. */
export async function stopBackgroundLocation(): Promise<void> {
  if (Platform.OS === "web") return;
  if (!(await isBackgroundLocationRunning())) return;
  try {
    await Location.stopLocationUpdatesAsync(RR_BG_LOCATION_TASK);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[bg-location] failed to stop updates:", e);
  }
}

/**
 * Pull every queued background ping into memory and clear the storage
 * queue atomically. Call this on Track-tab focus + on app foreground so
 * the polyline & odometer catch up with whatever was recorded offline.
 */
export async function drainBackgroundQueue(): Promise<BgLocPing[]> {
  if (Platform.OS === "web") return [];
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const queue: BgLocPing[] = JSON.parse(raw);
    await AsyncStorage.removeItem(QUEUE_KEY);
    return Array.isArray(queue) ? queue : [];
  } catch {
    return [];
  }
}

/** Wipe the queue without consuming. Use when the user discards a trip. */
export async function resetBackgroundQueue(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    /* swallow */
  }
}
