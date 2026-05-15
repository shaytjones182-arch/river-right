// Slippy-map tile math for the USGS Topo basemap (Web Mercator / Z/X/Y).
//
// USGS Topo tile URL:
//   https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}
//   (note: USGS uses {z}/{y}/{x} with Y BEFORE X, unlike the OSM convention)
//
// Internally we always use the convention `tileX, tileY` (X = column, Y = row)
// at a given zoom Z. The URL builder below handles the USGS-specific swap.

const TILE_SIZE = 256;

export type Bbox = {
  /** South-west corner (min lat, min lon) */
  swLat: number;
  swLon: number;
  /** North-east corner (max lat, max lon) */
  neLat: number;
  neLon: number;
};

export type TileKey = { z: number; x: number; y: number };

// ─── lat/lon ↔ tile X/Y ────────────────────────────────────────────────────
export function lonToTileX(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}
export function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 -
      Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
}

/** Build an USGS-style tile URL. */
export function usgsTopoTileUrl(z: number, x: number, y: number): string {
  return `https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/${z}/${y}/${x}`;
}

/** Computes the bounding box for a polyline (array of [lon, lat] coords). */
export function bboxFromPolyline(coords: number[][]): Bbox | null {
  if (!coords || coords.length === 0) return null;
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lon = c[0];
    const lat = c[1];
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  if (!Number.isFinite(minLat)) return null;
  return { swLat: minLat, swLon: minLon, neLat: maxLat, neLon: maxLon };
}

/** Expand a bbox by a percentage of its size on every side. 0.1 = 10% padding. */
export function padBbox(bbox: Bbox, ratio = 0.08): Bbox {
  const dLat = (bbox.neLat - bbox.swLat) * ratio;
  const dLon = (bbox.neLon - bbox.swLon) * ratio;
  return {
    swLat: bbox.swLat - dLat,
    swLon: bbox.swLon - dLon,
    neLat: bbox.neLat + dLat,
    neLon: bbox.neLon + dLon,
  };
}

export type TilePlan = {
  /** Total number of tiles. */
  count: number;
  /** Per-zoom-level breakdown of (xMin, xMax, yMin, yMax). */
  perZoom: Record<
    number,
    { xMin: number; xMax: number; yMin: number; yMax: number; count: number }
  >;
  /** Estimated size in MEGABYTES at ~25 KB per USGS Topo PNG. */
  estimatedMB: number;
  /** Full flat list of every tile to fetch. */
  tiles: TileKey[];
};

/** Compute every tile needed to cover the bbox at the given zoom range. */
export function planTiles(
  bbox: Bbox,
  zoomMin: number,
  zoomMax: number
): TilePlan {
  const tiles: TileKey[] = [];
  const perZoom: TilePlan["perZoom"] = {};
  for (let z = zoomMin; z <= zoomMax; z++) {
    const xMin = lonToTileX(bbox.swLon, z);
    const xMax = lonToTileX(bbox.neLon, z);
    // NB: tile-Y axis is inverted (y=0 is the NORTH pole). For a north-east
    // bbox corner the Y index is SMALLER than the south-west corner.
    const yMin = latToTileY(bbox.neLat, z);
    const yMax = latToTileY(bbox.swLat, z);
    let zCount = 0;
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y });
        zCount++;
      }
    }
    perZoom[z] = { xMin, xMax, yMin, yMax, count: zCount };
  }
  return {
    count: tiles.length,
    perZoom,
    estimatedMB: (tiles.length * 25) / 1024,
    tiles,
  };
}

/** Width of a single 256×256 tile at the given latitude/zoom, in meters.
 *  Used to convert a buffer-in-meters into a buffer-in-tiles. NB: the
 *  Web-Mercator constant 156543.03 is meters-per-PIXEL at z=0 — so we
 *  multiply by 256 here to get the per-tile width. */
export function tileWidthMeters(lat: number, zoom: number): number {
  return (
    ((156543.03 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom)) * 256
  );
}

const METERS_PER_MILE = 1609.344;

/** Returns all tile keys (as "z/x/y" strings) at `zoom` that are within
 *  `bufferMeters` of any vertex on the polyline. Implementation: for each
 *  vertex, compute its containing tile + a square radius derived from the
 *  buffer-in-meters / tile-width-in-meters, and union the result. The
 *  polyline is densely sampled on our curated runs (~1000+ vertices for
 *  Desolation), so this approximation produces a tight thick polyline buffer
 *  with no per-segment math needed. */
export function tilesAroundPolyline(
  coords: number[][],
  zoom: number,
  bufferMeters: number
): Set<string> {
  const out = new Set<string>();
  if (!coords || coords.length === 0) return out;
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lon = c[0];
    const lat = c[1];
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const tx = lonToTileX(lon, zoom);
    const ty = latToTileY(lat, zoom);
    const tw = tileWidthMeters(lat, zoom);
    // Round up so even a zero-buffer call still includes the tile the
    // vertex is in; clamp to a sensible upper bound to avoid blowing up
    // memory if someone passes a huge buffer at a low zoom.
    const r = Math.max(1, Math.min(64, Math.ceil(bufferMeters / tw)));
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const x = tx + dx;
        const y = ty + dy;
        if (x < 0 || y < 0) continue;
        out.add(`${zoom}/${x}/${y}`);
      }
    }
  }
  return out;
}

/** One tier of the tiered offline plan: either a "wide" full-bbox zoom range
 *  (used for context/overview zooms 10–13) or a focused per-zoom polyline
 *  buffer (used at higher zooms 14–16). */
export type ZoomTier =
  | { kind: "bbox"; zoomMin: number; zoomMax: number }
  | { kind: "buffer"; zoom: number; bufferMi: number };

/** The default tiered plan used by "Download offline map":
 *    z=10–13 → entire bbox (overview / context)
 *    z=14    → 5 mi each side of polyline
 *    z=15    → 2 mi each side of polyline
 *    z=16    → 0.5 mi each side of polyline (just the immediate river)
 *  Picked so the on-river view at full zoom covers the entire phone screen
 *  even on the widest devices, while keeping the download to ~70 MB. */
export const DEFAULT_OFFLINE_TIERS: ZoomTier[] = [
  { kind: "bbox", zoomMin: 10, zoomMax: 13 },
  { kind: "buffer", zoom: 14, bufferMi: 5.0 },
  { kind: "buffer", zoom: 15, bufferMi: 2.0 },
  { kind: "buffer", zoom: 16, bufferMi: 0.5 },
];

/** Builds a TilePlan from a polyline + its bbox using a tiered config. */
export function planTilesTiered(
  coords: number[][],
  bbox: Bbox,
  tiers: ZoomTier[] = DEFAULT_OFFLINE_TIERS
): TilePlan {
  const seen = new Set<string>();
  const tiles: TileKey[] = [];
  const perZoom: TilePlan["perZoom"] = {};

  const add = (z: number, x: number, y: number) => {
    const k = `${z}/${x}/${y}`;
    if (seen.has(k)) return;
    seen.add(k);
    tiles.push({ z, x, y });
    let pz = perZoom[z];
    if (!pz) {
      pz = { xMin: x, xMax: x, yMin: y, yMax: y, count: 0 };
      perZoom[z] = pz;
    }
    if (x < pz.xMin) pz.xMin = x;
    if (x > pz.xMax) pz.xMax = x;
    if (y < pz.yMin) pz.yMin = y;
    if (y > pz.yMax) pz.yMax = y;
    pz.count += 1;
  };

  for (const t of tiers) {
    if (t.kind === "bbox") {
      for (let z = t.zoomMin; z <= t.zoomMax; z++) {
        const xMin = lonToTileX(bbox.swLon, z);
        const xMax = lonToTileX(bbox.neLon, z);
        const yMin = latToTileY(bbox.neLat, z);
        const yMax = latToTileY(bbox.swLat, z);
        for (let x = xMin; x <= xMax; x++) {
          for (let y = yMin; y <= yMax; y++) {
            add(z, x, y);
          }
        }
      }
    } else {
      const set = tilesAroundPolyline(
        coords,
        t.zoom,
        t.bufferMi * METERS_PER_MILE
      );
      for (const k of set) {
        const [zs, xs, ys] = k.split("/");
        add(+zs, +xs, +ys);
      }
    }
  }

  return {
    count: tiles.length,
    perZoom,
    estimatedMB: (tiles.length * 25) / 1024,
    tiles,
  };
}

/** Default zoom range used by the app's "Download offline map" button.
 *  z=10 = wide overview (river fits comfortably on screen)
 *  z=16 = close enough to read individual eddies & rapid features */
export const DEFAULT_OFFLINE_ZOOM_MIN = 10;
export const DEFAULT_OFFLINE_ZOOM_MAX = 16;

/** Tile-key string used everywhere as the canonical identifier. */
export function tileKeyString(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}
