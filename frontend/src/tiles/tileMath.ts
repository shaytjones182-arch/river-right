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

/** Default zoom range used by the app's "Download offline map" button.
 *  z=10 = wide overview (river fits comfortably on screen)
 *  z=14 = close enough to read individual rapids and side canyons */
export const DEFAULT_OFFLINE_ZOOM_MIN = 10;
export const DEFAULT_OFFLINE_ZOOM_MAX = 14;

/** Tile-key string used everywhere as the canonical identifier. */
export function tileKeyString(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}
