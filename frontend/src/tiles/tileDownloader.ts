// Offline tile downloader.
//
// Saves USGS Topo tiles to local FileSystem so the Leaflet WebView can load
// them via `file://` URLs when the user is off the grid.
//
// File layout:
//   ${documentDirectory}offlineTiles/${riverId}/${z}/${x}/${y}.jpg
//
// USGS Topo's basemap tile cache serves JPEG bytes (NOT PNG), so we save
// with a .jpg extension on disk. Storing JPEG bytes under a .png filename
// — which an earlier version of this file did — caused iOS WKWebView to
// render the tiles unreliably (MIME-sniff sometimes worked, sometimes
// rendered the file's average color as a flat fill), which is the root
// cause of the "uniformly colored tiles in offline mode" bug.
//
// Manifest (in AsyncStorage) records WHICH tiles a given river has on disk
// plus the local base path used to construct file:// URLs. The Leaflet HTML
// reads the manifest at mount time and decides per-tile whether to serve
// from disk or from the USGS HTTPS endpoint.
//
// Web-preview note: `expo-file-system` on web uses an IndexedDB-backed
// virtual FS. The download flow runs to completion, but the WebView there
// is an iframe and cannot load `file://` URLs — so the offline-tile path
// will NOT be exercised on the web preview. It works on native iOS/Android.

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
// NB: we deliberately import from `expo-file-system/legacy`. In Expo SDK 54
// the top-level `expo-file-system` module flipped `downloadAsync` /
// `getInfoAsync` / etc. from "deprecated warning" to "throws an error" so
// they no longer work at all. The migration target is a new File/Directory
// class API, but the legacy entry point keeps the existing function calls
// working unchanged — perfect for our use here.
import * as FileSystem from "expo-file-system/legacy";
import {
  TileKey,
  TilePlan,
  tileKeyString,
  usgsTopoTileUrl,
} from "./tileMath";

const MANIFEST_PREFIX = "@riverright:offline_tiles:";

export type TileManifest = {
  riverId: string;
  zoomMin: number;
  zoomMax: number;
  /** Sorted list of "z/x/y" strings present on disk. */
  tileKeys: string[];
  /** Absolute file:// base path for tiles. e.g. `file:///.../offlineTiles/<id>/` */
  basePath: string;
  /** Total bytes on disk (rough estimate from response sizes). */
  totalBytes: number;
  /** Unix ms timestamp of last successful download. */
  downloadedAt: number;
};

export type DownloadProgress = {
  riverId: string;
  total: number;
  completed: number;
  failed: number;
  bytes: number;
  inProgress: boolean;
  cancelled: boolean;
  /** Details of the first failed tile (HTTP status or exception). */
  failDetail?: string;
};

type ProgressListener = (p: DownloadProgress) => void;

const inFlight = new Map<
  string,
  {
    cancel: () => void;
    listeners: Set<ProgressListener>;
    progress: DownloadProgress;
  }
>();

function isWeb() {
  return Platform.OS === "web";
}

/** Subdir within `FileSystem.documentDirectory` (no leading slash, with
 *  trailing slash) where a river's offline tiles live.
 *
 *  We store ONLY this relative path in the manifest. `documentDirectory`
 *  is intentionally NOT baked in, because in Expo Go (and after iOS
 *  container-UUID rotations / Expo Go upgrades / Metro rebuilds) the
 *  absolute path of `documentDirectory` can change between sessions
 *  even though the actual on-disk files are still there. If we cached
 *  the absolute path, the manifest's file:// URLs would point to a
 *  stale directory and every tile would silently 404 inside the
 *  WebView — which is exactly what was breaking offline rendering. */
function baseDirRelativeForRiver(riverId: string): string {
  const safeId = riverId.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `offlineTiles/${safeId}/`;
}

/** Absolute file:// path for a river's tile dir, built against the
 *  CURRENT documentDirectory. Use this for filesystem writes/reads. */
function baseDirForRiver(riverId: string): string {
  return `${FileSystem.documentDirectory}${baseDirRelativeForRiver(riverId)}`;
}

/** Local file:// URL for a single tile. USGS Topo serves JPEG bytes,
 *  so we store with a .jpg extension to match the actual content type. */
function tileFilePath(riverId: string, z: number, x: number, y: number): string {
  return `${baseDirForRiver(riverId)}${z}/${x}/${y}.jpg`;
}

/**
 * Verify that the file at `path` is actually a valid image (JPEG or PNG)
 * and not an HTML/JSON error body, an ArcGIS "tile unavailable"
 * placeholder, or a truncated download.
 *
 * Magic-byte prefixes (in base64):
 *   PNG  →  bytes 89 50 4E 47 …  →  base64 "iVBORw0KGgo"
 *   JPEG →  bytes FF D8 FF …     →  base64 "/9j/"
 *
 * USGS Topo currently serves JPEG, so the JPEG branch is the hot path.
 * We still accept PNG defensively in case the service ever flips formats
 * (some ArcGIS caches do this for partially-transparent edge tiles).
 *
 * We read the WHOLE file rather than using
 * `readAsStringAsync({ position, length })`, because in
 * expo-file-system 19.x's legacy entry point those partial-read options
 * are honored inconsistently — on some builds they silently throw, which
 * would make EVERY tile look invalid and freeze the download at 0%
 * (which is exactly what happened in a previous iteration of this code).
 * Reading the full ~25 KB tile costs <20 ms and is not worth the fragility.
 */
let _validateLoggedFirst = false;
async function isValidImage(path: string): Promise<boolean> {
  try {
    const data = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (data.startsWith("/9j/")) return true;           // JPEG
    if (data.startsWith("iVBORw0KGgo")) return true;    // PNG
    if (!_validateLoggedFirst) {
      _validateLoggedFirst = true;
      console.warn(
        "[tile-validate] not a JPEG/PNG — head=" +
          data.substring(0, 60) +
          " path=" +
          path
      );
    }
    return false;
  } catch (e: any) {
    if (!_validateLoggedFirst) {
      _validateLoggedFirst = true;
      console.warn(
        "[tile-validate] read threw: " + (e?.message ?? String(e))
      );
    }
    return false;
  }
}

// ─── Manifest management ───────────────────────────────────────────────────
async function readManifest(riverId: string): Promise<TileManifest | null> {
  try {
    const raw = await AsyncStorage.getItem(MANIFEST_PREFIX + riverId);
    if (!raw) return null;
    return JSON.parse(raw) as TileManifest;
  } catch {
    return null;
  }
}
async function writeManifest(m: TileManifest): Promise<void> {
  try {
    await AsyncStorage.setItem(MANIFEST_PREFIX + m.riverId, JSON.stringify(m));
  } catch {
    // best-effort
  }
}

export async function getTileManifest(
  riverId: string
): Promise<TileManifest | null> {
  return readManifest(riverId);
}

// ─── Download orchestration ────────────────────────────────────────────────

/** Ensure a directory exists. Idempotent. */
async function ensureDir(uri: string) {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
    }
  } catch {
    // Some platforms throw on already-exists; safe to ignore.
  }
}

/** Start a download. Calls listener on every tile finished. Returns
 *  immediately with a cancel handle; the actual work runs in the background. */
export function startTileDownload(
  riverId: string,
  plan: TilePlan,
  zoomMin: number,
  zoomMax: number,
  listener: ProgressListener
): { cancel: () => void } {
  // If a download for this river is already running, just attach the
  // caller's listener to the existing job — we never run two in parallel.
  const existing = inFlight.get(riverId);
  if (existing) {
    existing.listeners.add(listener);
    listener(existing.progress);
    return { cancel: existing.cancel };
  }

  let cancelled = false;
  const listeners = new Set<ProgressListener>();
  listeners.add(listener);
  const progress: DownloadProgress = {
    riverId,
    total: plan.count,
    completed: 0,
    failed: 0,
    bytes: 0,
    inProgress: true,
    cancelled: false,
  };
  const emit = () => {
    for (const l of listeners) l({ ...progress });
  };
  const cancel = () => {
    cancelled = true;
    progress.cancelled = true;
    progress.inProgress = false;
    emit();
  };

  inFlight.set(riverId, { cancel, listeners, progress });

  // Kick off the async worker.
  (async () => {
    try {
      await ensureDir(baseDirForRiver(riverId));
      // Pre-create per-zoom and per-x subdirs to avoid contention.
      for (let z = zoomMin; z <= zoomMax; z++) {
        await ensureDir(`${baseDirForRiver(riverId)}${z}/`);
      }

      const downloaded: string[] = [];
      const CONCURRENCY = 6;
      let cursor = 0;
      // Capture the FIRST tile failure so we can surface a precise
      // HTTP-status / exception message in the progress payload. Without
      // this, all the UI would see is "N failed".
      let firstFailReported = false;
      let lastFailDetail = "";

      const worker = async () => {
        while (!cancelled) {
          const idx = cursor++;
          if (idx >= plan.tiles.length) return;
          const t = plan.tiles[idx];
          const filePath = tileFilePath(riverId, t.z, t.x, t.y);
          // Skip if already on disk from a prior run — but ONLY if the
          // existing file is a real PNG. If a previous run accidentally
          // saved an HTML/JSON error body or a truncated tile under
          // this name, we want to nuke it and re-download instead of
          // silently rendering a colored placeholder on the user's map.
          try {
            const info = await FileSystem.getInfoAsync(filePath, {
              size: true,
            });
            if (info.exists && (info.size ?? 0) > 0) {
              if (await isValidImage(filePath)) {
                progress.completed += 1;
                progress.bytes += info.size ?? 0;
                downloaded.push(tileKeyString(t.z, t.x, t.y));
                emit();
                continue;
              }
              // Bad bytes on disk — delete and fall through to redownload.
              try {
                await FileSystem.deleteAsync(filePath, { idempotent: true });
              } catch {
                /* ignore */
              }
            }
          } catch {
            // fall through and re-download
          }

          // Ensure the X subdir exists. (Cheap — most calls are no-ops.)
          await ensureDir(`${baseDirForRiver(riverId)}${t.z}/${t.x}/`);

          try {
            const tileUrl = usgsTopoTileUrl(t.z, t.x, t.y);
            const res = await FileSystem.downloadAsync(tileUrl, filePath);
            if (res.status >= 200 && res.status < 300) {
              // HTTP 2xx is not enough — USGS / ArcGIS will occasionally
              // hand back a 200 with an HTML error body, a JSON error
              // payload, or a placeholder "tile unavailable" image. We
              // confirm the bytes on disk really are a PNG before
              // counting the tile as good.
              if (!(await isValidImage(filePath))) {
                progress.failed += 1;
                if (!firstFailReported) {
                  firstFailReported = true;
                  console.warn(
                    "[tile-fail] HTTP 2xx but not a JPEG/PNG url=" +
                      tileUrl +
                      " path=" +
                      filePath
                  );
                  lastFailDetail = `HTTP ${res.status} but non-image body for z=${t.z} x=${t.x} y=${t.y}`;
                  progress.failDetail = lastFailDetail;
                }
                // Delete the bogus file so a future re-run picks it up.
                try {
                  await FileSystem.deleteAsync(filePath, { idempotent: true });
                } catch {
                  /* ignore */
                }
              } else {
                progress.completed += 1;
                // size header isn't always returned; getInfoAsync is reliable
                try {
                  const info = await FileSystem.getInfoAsync(filePath, {
                    size: true,
                  });
                  progress.bytes += info.size ?? 0;
                } catch {
                  /* ignore */
                }
                downloaded.push(tileKeyString(t.z, t.x, t.y));
              }
            } else {
              progress.failed += 1;
              // Report the first non-2xx response so we can surface why
              // tiles are failing (e.g. 403, 429, 404, etc.).
              if (!firstFailReported) {
                firstFailReported = true;
                console.warn(
                  "[tile-fail] HTTP " +
                    res.status +
                    " url=" +
                    tileUrl +
                    " path=" +
                    filePath
                );
                lastFailDetail = `HTTP ${res.status} for z=${t.z} x=${t.x} y=${t.y}`;
                progress.failDetail = lastFailDetail;
              }
              // Some platforms write the error body to disk anyway —
              // delete it so we don't ship a corrupt tile.
              try {
                await FileSystem.deleteAsync(filePath, { idempotent: true });
              } catch {
                /* ignore */
              }
            }
          } catch (e: any) {
            progress.failed += 1;
            if (!firstFailReported) {
              firstFailReported = true;
              const msg = e?.message ?? String(e);
              console.warn(
                "[tile-fail] threw url=" +
                  usgsTopoTileUrl(t.z, t.x, t.y) +
                  " err=" +
                  msg
              );
              lastFailDetail = `THREW: ${msg.substring(0, 200)}`;
              progress.failDetail = lastFailDetail;
            }
          }
          emit();
        }
      };

      const workers = Array.from({ length: CONCURRENCY }, () => worker());
      await Promise.all(workers);

      if (cancelled) {
        progress.inProgress = false;
        emit();
        return;
      }

      // Persist manifest. We DO NOT overwrite an existing manifest with an
      // empty one — that would clobber a previously-successful download if
      // a re-run happened to fail every tile (e.g. all tiles 429'd by the
      // tile server). Only write when we actually downloaded something.
      if (downloaded.length > 0) {
        const manifest: TileManifest = {
          riverId,
          zoomMin,
          zoomMax,
          tileKeys: downloaded,
          // Store the RELATIVE path inside documentDirectory, NOT the
          // absolute file:// path. Expo Go's documentDirectory can
          // change between sessions (after Expo Go upgrades, iOS app
          // container UUID rotations, Metro rebuilds, etc.), so an
          // absolute path baked in here would become a stale 404 on
          // the next launch even though the actual files are still
          // on disk under the new documentDirectory.
          basePath: baseDirRelativeForRiver(riverId),
          totalBytes: progress.bytes,
          downloadedAt: Date.now(),
        };
        await writeManifest(manifest);
      }

      progress.inProgress = false;
      emit();
    } catch {
      progress.inProgress = false;
      emit();
    } finally {
      inFlight.delete(riverId);
    }
  })();

  return { cancel };
}

/** Delete all downloaded tiles for a river + remove its manifest. */
export async function deleteOfflineTiles(riverId: string): Promise<void> {
  try {
    const dir = baseDirForRiver(riverId);
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    }
  } catch {
    /* ignore */
  }
  try {
    await AsyncStorage.removeItem(MANIFEST_PREFIX + riverId);
  } catch {
    /* ignore */
  }
}

/** Returns true if at least one tile is on disk for this river. */
export async function hasAnyOfflineTiles(riverId: string): Promise<boolean> {
  const m = await readManifest(riverId);
  return !!m && m.tileKeys.length > 0;
}

/** Returns the union of all downloaded tile manifests across every river,
 *  formatted as { keys: ["z/x/y" → file://URL], … } so a single Leaflet
 *  layer can serve them. Used by the Track tab where there's no notion of
 *  a "currently selected" river.
 *
 *  Manifest basePath handling: manifests written by the CURRENT downloader
 *  store a RELATIVE path (e.g. `offlineTiles/<id>/`). We prepend the
 *  current `FileSystem.documentDirectory` at read time so the file://
 *  URLs are always valid even if the documentDirectory has rotated since
 *  the download. Older manifests may still contain absolute paths from
 *  before this fix — those are detected (they start with `file://`) and
 *  used as-is for backward compatibility.
 */
export async function getMergedOfflineManifest(): Promise<{
  /** Map of "z/x/y" key → absolute file:// URL */
  tileToUrl: Record<string, string>;
} | null> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const manifestKeys = keys.filter((k) => k.startsWith(MANIFEST_PREFIX));
    if (manifestKeys.length === 0) return null;
    const pairs = await AsyncStorage.multiGet(manifestKeys);
    const tileToUrl: Record<string, string> = {};
    const docDir = FileSystem.documentDirectory ?? "";
    for (const [, raw] of pairs) {
      if (!raw) continue;
      try {
        const m: TileManifest = JSON.parse(raw);
        // Resolve the manifest's basePath against the CURRENT
        // documentDirectory. If the stored value already begins with
        // `file://` it's a legacy absolute path — honor it as-is.
        const isAbsolute =
          typeof m.basePath === "string" && m.basePath.startsWith("file://");
        const resolvedBase = isAbsolute ? m.basePath : `${docDir}${m.basePath}`;
        for (const k of m.tileKeys) {
          if (!(k in tileToUrl)) {
            tileToUrl[k] = `${resolvedBase}${k}.jpg`;
          }
        }
      } catch {
        /* skip bad manifests */
      }
    }
    return Object.keys(tileToUrl).length > 0 ? { tileToUrl } : null;
  } catch {
    return null;
  }
}

// On web preview, expo-file-system uses an IndexedDB-backed virtual FS;
// the file:// URLs it produces won't be loadable by a normal iframe.
export const OFFLINE_TILES_SUPPORTED = !isWeb();
