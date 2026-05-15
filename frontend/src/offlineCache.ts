// Offline cache for curated river data.
//
// We cache 3 pieces of data per river ID, keyed by ID:
//   1. River meta (name, class, hazards, put-in, take-out, USGS gauge ID, …)
//   2. Polyline GeoJSON (the curated river line + mile geometry)
//   3. POIs (rapids, campsites, hazards from /osm-poi — curated or OSM)
//
// Strategy: NETWORK-FIRST with EXPLICIT-WRITE caching.
//   - Every normal viewer fetch goes straight to the network.
//   - We DO NOT auto-populate the offline cache. The user must explicitly
//     hit "Download offline map" on a river to save the bundle — that flow
//     lives behind the $5 IAP paywall (the download button only renders on
//     the river-detail page, which is reached only after unlocking the run).
//   - On any later network failure we *read* from cache and serve that. If
//     the user never explicitly downloaded, there is no cache to read.
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

/** Options for the fetch helpers below. */
export type FetchOpts = {
  /** When true, write the successful response to the offline cache. Default
   *  is `false` — viewer fetches do NOT pollute the offline cache. Only the
   *  explicit "Download offline map" flow passes `true`. */
  writeCache?: boolean;
};

/** Fetch river meta + flow. On network error, return cached meta + null flow. */
export async function fetchRiverWithCache(
  id: string,
  opts: FetchOpts = {}
): Promise<RiverMetaResponse> {
  try {
    const r = await fetch(`${API}/rivers/${id}`);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j: RiverMetaResponse = await r.json();
    if (j.river && opts.writeCache) {
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

/** Fetch the curated polyline GeoJSON. Only writes to cache when opts.writeCache. */
export async function fetchPolylineWithCache(
  id: string,
  opts: FetchOpts = {}
): Promise<any | null> {
  try {
    const r = await fetch(`${API}/rivers/${id}/polyline`);
    if (!r.ok) {
      if (r.status === 404) return null; // No polyline for this river
      throw new Error("HTTP " + r.status);
    }
    const j = await r.json();
    if (opts.writeCache) {
      await setJson(POLY_PREFIX + id, j);
    }
    return j;
  } catch (err) {
    const cached = await getJson<any>(POLY_PREFIX + id);
    if (cached) return cached;
    throw err;
  }
}

/** Fetch /osm-poi (which returns curated POIs when curated data exists). */
export async function fetchPoisWithCache(
  id: string,
  opts: FetchOpts = {}
): Promise<any> {
  try {
    const r = await fetch(`${API}/rivers/${id}/osm-poi`);
    const j = await r.json();
    if (!j.error && opts.writeCache) {
      await setJson(POIS_PREFIX + id, j);
    }
    return j;
  } catch (err) {
    const cached = await getJson<any>(POIS_PREFIX + id);
    if (cached) return cached;
    throw err;
  }
}

/** Fetch the featured-rivers list. The home-tab list itself is harmless to
 *  cache (it's just names + thumbnails), so this still auto-writes the cache
 *  so users see *something* if they open the app offline. The per-river
 *  detailed bundles are still gated by the explicit download flow. */
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

/** Explicit "save offline" — called by the Download offline-map flow.
 *  Writes meta + polyline + POIs to disk so they are available without
 *  network. Behind the $5 paywall by virtue of where the trigger lives. */
export async function saveRiverOfflineBundle(id: string): Promise<void> {
  await Promise.allSettled([
    fetchRiverWithCache(id, { writeCache: true }),
    fetchPolylineWithCache(id, { writeCache: true }),
    fetchPoisWithCache(id, { writeCache: true }),
  ]);
}

/** Explicit "wipe offline" — called when the user deletes an offline map.
 *  Removes meta + poly + POIs + timestamp. (Tiles are handled separately by
 *  `deleteOfflineTiles` in tileDownloader.) */
export async function deleteRiverOfflineBundle(id: string): Promise<void> {
  await Promise.allSettled([
    AsyncStorage.removeItem(META_PREFIX + id),
    AsyncStorage.removeItem(POLY_PREFIX + id),
    AsyncStorage.removeItem(POIS_PREFIX + id),
    AsyncStorage.removeItem(TS_PREFIX + id),
  ]);
}
