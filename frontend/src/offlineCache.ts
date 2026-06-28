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

// ─── Client-side flow classification ───────────────────────────────────────
// Ported from backend `classify_flow` so the app can compute flow status
// fully offline (well, given a live CFS reading from USGS). Returns the
// same {status, label} shape the rest of the UI already expects.
function classifyFlow(
  cfs: number | null,
  thresholds?: {
    low_threshold?: number;
    normal_threshold?: number;
    high_threshold?: number;
    // Optional 5th-bucket boundary. If present, flows above this value
    // are reported as "Very high" (danger color) instead of just "High".
    // Rivers without it fall back to the original 4-bucket classifier.
    very_high_threshold?: number;
  } | null
): { status: string; label: string } {
  if (cfs === null || cfs === undefined) return { status: "unknown", label: "No data" };
  if (thresholds) {
    const {
      low_threshold: lo,
      normal_threshold: nm,
      high_threshold: hi,
      very_high_threshold: vh,
    } = thresholds;
    if (typeof lo === "number" && typeof nm === "number" && typeof hi === "number") {
      if (cfs < lo) return { status: "low", label: "Very low" };
      if (cfs < nm) return { status: "info", label: "Low" };
      if (cfs < hi) return { status: "safe", label: "Normal" };
      if (typeof vh === "number") {
        if (cfs < vh) return { status: "warning", label: "High" };
        return { status: "danger", label: "Very high" };
      }
      return { status: "warning", label: "High" };
    }
  }
  if (cfs < 100) return { status: "low", label: "Low" };
  if (cfs < 1500) return { status: "safe", label: "Runnable" };
  if (cfs < 8000) return { status: "warning", label: "High" };
  return { status: "danger", label: "Flood" };
}

/** Fetch live CFS + gauge height directly from USGS public IV API. No
 *  backend dependency. Returns null if the network call fails. */
async function fetchUsgsLiveFlow(siteId: string): Promise<{
  cfs: number | null;
  gauge_height_ft: number | null;
  updated_at?: string;
} | null> {
  if (!siteId) return null;
  try {
    const url =
      "https://waterservices.usgs.gov/nwis/iv/?format=json" +
      `&sites=${encodeURIComponent(siteId)}` +
      "&parameterCd=00060,00065&siteStatus=active";
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const series: any[] = j?.value?.timeSeries || [];
    let cfs: number | null = null;
    let gaugeFt: number | null = null;
    let updatedAt: string | undefined;
    for (const ts of series) {
      const varCode = ts?.variable?.variableCode?.[0]?.value;
      const values = ts?.values?.[0]?.value || [];
      if (!values.length) continue;
      const last = values[values.length - 1];
      const raw = parseFloat(last?.value);
      const v = Number.isFinite(raw) && raw > -999998 ? raw : null;
      const t = last?.dateTime;
      if (varCode === "00060") {
        cfs = v;
        if (t) updatedAt = t;
      } else if (varCode === "00065") {
        gaugeFt = v;
        if (t && !updatedAt) updatedAt = t;
      }
    }
    return { cfs, gauge_height_ft: gaugeFt, updated_at: updatedAt };
  } catch {
    return null;
  }
}

/** Fetch river meta + live flow. River meta + CFS thresholds come from the
 *  in-bundle curated data (no network needed). Live CFS/gauge height comes
 *  directly from USGS's public IV API — bypasses our backend entirely so
 *  the standalone app works without any hosted infrastructure. */
export async function fetchRiverWithCache(
  id: string,
  _opts: FetchOpts = {}
): Promise<RiverMetaResponse> {
  const run = CURATED_BUNDLE?.runs?.[id];
  const bundledRiver: RiverMeta | null = run?.river || null;
  const thresholds = run?.cfs_thresholds || null;

  if (!bundledRiver) {
    // No bundled entry — last resort: previously cached meta
    const cached = await getJson<RiverMeta>(META_PREFIX + id);
    if (cached) return { river: cached, flow: null };
    throw new Error(`No bundled or cached data for river ${id}`);
  }

  // Hit USGS directly for the live reading.
  const live = await fetchUsgsLiveFlow(bundledRiver.usgs_site_id);
  if (!live) {
    return { river: bundledRiver, flow: null };
  }
  const cls = classifyFlow(live.cfs, thresholds);
  const flow: any = {
    cfs: live.cfs,
    gauge_height_ft: live.gauge_height_ft,
    updated_at: live.updated_at,
    status: cls.status,
    label: cls.label,
  };
  // Surface the curated thresholds + attribution to the UI (used by the
  // flow-status info modal on the river detail screen).
  if (thresholds) {
    flow.thresholds = {
      low_threshold: thresholds.low_threshold,
      normal_threshold: thresholds.normal_threshold,
      high_threshold: thresholds.high_threshold,
      // Optional 5th-bucket boundary — only set on rivers whose curated
      // thresholds file declares one (Middle Fork Salmon as of now).
      very_high_threshold: thresholds.very_high_threshold,
    };
    if (thresholds.datasource_attribution) {
      flow.datasource_attribution = thresholds.datasource_attribution;
    }
  }
  return { river: bundledRiver, flow };
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
