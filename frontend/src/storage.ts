// AsyncStorage-backed trip persistence for RiverRight.
// Lives entirely on-device; no auth required. Designed so we can later migrate
// the same JSON shape to the backend once we add Plus/account features.

import AsyncStorage from "@react-native-async-storage/async-storage";

const TRIPS_KEY = "riverright.trips.v1";

export type TripPoint = {
  lat: number;
  lon: number;
  t: number; // epoch ms
  speed: number; // mph at the moment of fix
};

export type TripDay = {
  dayNumber: number; // 1-indexed
  startedAt: number;
  endedAt: number;
  points: TripPoint[];
  distMiles: number;
  movingSec: number; // seconds spent above the moving-speed threshold
  totalSec: number; // seconds the timer ran (excludes paused time)
  maxMph: number;
  avgMph: number; // distance / moving time (mph) — AllTrails-style
};

export type SavedTrip = {
  id: string;
  createdAt: number; // first day started
  endedAt: number; // trip ended
  riverId: string | null;
  riverName: string | null;
  days: TripDay[];
  // Trip-wide totals
  totalDistMiles: number;
  totalMovingSec: number;
  totalSec: number;
  maxMph: number;
  avgMph: number;
};

/** Read all trips (newest first). */
export async function getAllTrips(): Promise<SavedTrip[]> {
  try {
    const raw = await AsyncStorage.getItem(TRIPS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SavedTrip[];
    return Array.isArray(arr) ? arr.sort((a, b) => b.createdAt - a.createdAt) : [];
  } catch (e) {
    console.warn("getAllTrips failed", e);
    return [];
  }
}

export async function getTrip(id: string): Promise<SavedTrip | null> {
  const all = await getAllTrips();
  return all.find((t) => t.id === id) || null;
}

export async function saveTrip(trip: SavedTrip): Promise<void> {
  const all = await getAllTrips();
  const idx = all.findIndex((t) => t.id === trip.id);
  if (idx >= 0) all[idx] = trip;
  else all.push(trip);
  await AsyncStorage.setItem(TRIPS_KEY, JSON.stringify(all));
}

export async function deleteTrip(id: string): Promise<void> {
  const all = await getAllTrips();
  const remaining = all.filter((t) => t.id !== id);
  await AsyncStorage.setItem(TRIPS_KEY, JSON.stringify(remaining));
}

/** Compute trip-wide rollup from its days. */
export function rollupTrip(
  days: TripDay[],
  riverId: string | null,
  riverName: string | null,
  id: string,
  createdAt: number
): SavedTrip {
  const totalDistMiles = days.reduce((s, d) => s + d.distMiles, 0);
  const totalMovingSec = days.reduce((s, d) => s + d.movingSec, 0);
  const totalSec = days.reduce((s, d) => s + d.totalSec, 0);
  const maxMph = days.reduce((m, d) => Math.max(m, d.maxMph), 0);
  const avgMph =
    totalMovingSec > 0 ? totalDistMiles / (totalMovingSec / 3600) : 0;
  return {
    id,
    createdAt,
    endedAt: Date.now(),
    riverId,
    riverName,
    days,
    totalDistMiles,
    totalMovingSec,
    totalSec,
    maxMph,
    avgMph,
  };
}

/** Pretty-format helpers (shared by all stats screens). */
export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function fmtClockDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function fmtDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Speed threshold below which we treat the user as "stopped". */
export const MOVING_MPH_THRESHOLD = 0.5;
