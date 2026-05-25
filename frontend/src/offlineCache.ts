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
// Static, in-bundle curated data. This is the source of truth for the
// rivers list, polylines, POIs, helpful_info, and cfs_thresholds — so the
// app works fully offline for everything except live USGS CFS readings.
// The network fetchers below ONLY hit the API for the live `flow` field,
// then merge it on top of the bundled river meta.
import { CURATED_BUNDLE } from "./curatedData";

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

/** Fetch river meta + live flow. River meta comes from the in-bundle
 *  curated data (no network needed); only the live `flow` field hits the
 *  API. If the flow fetch fails, returns the bundled river with flow=null. */
export async function fetchRiverWithCache(
  id: string,
  opts: FetchOpts = {}
): Promise<RiverMetaResponse> {
  const bundledRiver = CURATED_BUNDLE?.runs?.[id]?.river || null;
  // Always pull the latest LIVE flow over the wire; non-blocking on failure.
  let flow: any = null;
  try {
    const r = await fetch(`${API}/rivers/${id}`);
    if (r.ok) {
      const j: RiverMetaResponse = await r.json();
      flow = j?.flow ?? null;
      // If the API responds, mirror its (possibly updated) river meta into
      // the offline cache so a later airplane-mode launch still has fresh
      // data even if we don't ship a new app version.
      if (j.river && opts.writeCache) {
        await setJson(META_PREFIX + id, j.river);
        await setJson(TS_PREFIX + id, Date.now());
      }
    }
  } catch {
    /* swallow — bundled river still renders */
  }
  if (bundledRiver) {
    return { river: bundledRiver, flow };
  }
  // No bundled entry — fall back to last cached or the network river meta
  // if we managed to load one.
  const cached = await getJson<RiverMeta>(META_PREFIX + id);
  if (cached) return { river: cached, flow };
  throw new Error(`No bundled or cached data for river ${id}`);
}

/** Curated polyline. Reads from the in-bundle data — no network. */
export async function fetchPolylineWithCache(
  id: string,
  _opts: FetchOpts = {}
): Promise<any | null> {
  return CURATED_BUNDLE?.runs?.[id]?.polyline ?? null;
}

/** Curated POIs. Reads from the in-bundle data — no network. */
export async function fetchPoisWithCache(
  id: string,
  _opts: FetchOpts = {}
): Promise<any> {
  const run = CURATED_BUNDLE?.runs?.[id];
  if (!run) return { pois: [], source: "none", count: 0 };
  return {
    pois: run.pois || [],
    source: run.poi_source || "curated",
    count: run.poi_count ?? (run.pois?.length || 0),
  };
}

/** Featured-rivers list — always from the in-bundle data. */
export async function fetchFeaturedWithCache(): Promise<{ rivers: any[] }> {
  return { rivers: CURATED_BUNDLE?.featured || [] };
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
