// Offline cache for curated river data.
//
// We cache 3 pieces of data per river ID, keyed by ID:
//   1. River meta (name, class, hazards, put-in, take-out, USGS gauge ID, …)
//   2. Polyline GeoJSON (the curated river line + mile geometry)
//   3. POIs (rapids, campsites, hazards from /osm-poi — curated or OSM)
//
// Strategy: NETWORK-FIRST with CACHE FALLBACK.
//   - Online: hit the network, write through to cache, return fresh data.
//   - Offline / fetch error: read from cache; if present, return; else throw.
//
// We DO NOT cache USGS flow data — it's live by definition and a stale flow
// reading is dangerous. The river-detail screen falls back to "Flow data
// unavailable offline" when the network is down.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "./theme";

const META_PREFIX = "@riverright:offline:meta:";
const POLY_PREFIX = "@riverright:offline:poly:";
const POIS_PREFIX = "@riverright:offline:pois:";
const TS_PREFIX = "@riverright:offline:ts:";
const FEATURED_KEY = "@riverright:offline:featured";

// ─── Low-level read/write ──────────────────────────────────────────────────
async function setJson(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore — best-effort cache
  }
}
async function getJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ─── Network-first with cache fallback helpers ─────────────────────────────
export type RiverMeta = {
  id: string;
  name: string;
  state: string;
  class_rating: string;
  type: string;
  description: string;
  hazards: string[];
  put_in: { name: string; lat: number; lon: number };
  take_out: { name: string; lat: number; lon: number };
  usgs_site_id: string;
  image: string;
  points_of_interest?: string[];
};

export type RiverMetaResponse = {
  river: RiverMeta;
  flow:
    | {
        cfs: number | null;
        gauge_height_ft: number | null;
        status: string;
        label: string;
        updated_at?: string;
      }
    | null;
};

/** Fetch river meta + flow. On network error, return cached meta + null flow. */
export async function fetchRiverWithCache(
  id: string
): Promise<RiverMetaResponse> {
  try {
    const r = await fetch(`${API}/rivers/${id}`);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j: RiverMetaResponse = await r.json();
    if (j.river) {
      await setJson(META_PREFIX + id, j.river);
      await setJson(TS_PREFIX + id, Date.now());
    }
    return j;
  } catch (err) {
    const cached = await getJson<RiverMeta>(META_PREFIX + id);
    if (cached) {
      return { river: cached, flow: null };
    }
    throw err;
  }
}

/** Fetch the curated polyline GeoJSON, cache it, fall back to cache offline. */
export async function fetchPolylineWithCache(id: string): Promise<any | null> {
  try {
    const r = await fetch(`${API}/rivers/${id}/polyline`);
    if (!r.ok) {
      if (r.status === 404) return null; // No polyline for this river
      throw new Error("HTTP " + r.status);
    }
    const j = await r.json();
    await setJson(POLY_PREFIX + id, j);
    return j;
  } catch (err) {
    const cached = await getJson<any>(POLY_PREFIX + id);
    if (cached) return cached;
    throw err;
  }
}

/** Fetch /osm-poi (which returns curated POIs when curated data exists). */
export async function fetchPoisWithCache(id: string): Promise<any> {
  try {
    const r = await fetch(`${API}/rivers/${id}/osm-poi`);
    const j = await r.json();
    if (!j.error) {
      await setJson(POIS_PREFIX + id, j);
    }
    return j;
  } catch (err) {
    const cached = await getJson<any>(POIS_PREFIX + id);
    if (cached) return cached;
    throw err;
  }
}

/** Fetch the featured-rivers list. On network error, return last cached
 *  list so users can at least see their unlocked rivers offline. */
export async function fetchFeaturedWithCache(): Promise<{ rivers: any[] }> {
  try {
    const r = await fetch(`${API}/rivers/featured`);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    if (j && Array.isArray(j.rivers)) {
      await setJson(FEATURED_KEY, j);
    }
    return j;
  } catch (err) {
    const cached = await getJson<{ rivers: any[] }>(FEATURED_KEY);
    if (cached) return cached;
    throw err;
  }
}

// ─── Inspection / management ───────────────────────────────────────────────

/** Returns true when meta + polyline are both cached (POIs optional). */
export async function hasOfflineBundle(id: string): Promise<boolean> {
  const [meta, poly] = await Promise.all([
    getJson<RiverMeta>(META_PREFIX + id),
    getJson<any>(POLY_PREFIX + id),
  ]);
  return !!meta && !!poly;
}

/** When was this river last cached? Returns null if never. */
export async function getCacheTimestamp(id: string): Promise<number | null> {
  return await getJson<number>(TS_PREFIX + id);
}

/** Eagerly pre-cache all three pieces for a river. Used right after IAP
 *  unlock so the user can go straight to the river offline. */
export async function prefetchRiverBundle(id: string): Promise<void> {
  await Promise.allSettled([
    fetchRiverWithCache(id),
    fetchPolylineWithCache(id),
    fetchPoisWithCache(id),
  ]);
}
