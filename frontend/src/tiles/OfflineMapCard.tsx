// "Download offline map" card shown on the river detail page.
//
// Loads the curated polyline → computes a tile plan → lets the user kick
// off / cancel / delete a download of USGS Topo tiles for offline use.

import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../theme";
import { fetchPolylineWithCache, saveRiverOfflineBundle, deleteRiverOfflineBundle } from "../offlineCache";
import {
  bboxFromPolyline,
  padBbox,
  planTilesTiered,
  DEFAULT_OFFLINE_ZOOM_MIN,
  DEFAULT_OFFLINE_ZOOM_MAX,
  TilePlan,
} from "./tileMath";
import {
  startTileDownload,
  deleteOfflineTiles,
  getTileManifest,
  DownloadProgress,
  TileManifest,
  OFFLINE_TILES_SUPPORTED,
} from "./tileDownloader";

type Props = {
  riverId: string;
};

function fmtMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function OfflineMapCard({ riverId }: Props) {
  const [plan, setPlan] = useState<TilePlan | null>(null);
  const [manifest, setManifest] = useState<TileManifest | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  // DEBUG: tracks whether we've shown the "first emit" alert yet so we can
  // confirm the download progress callback is actually firing.
  const firstEmitSeenRef = useRef(false);

  // Build the tile plan from the polyline bbox.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const polyJson = await fetchPolylineWithCache(riverId);
      if (cancelled || !polyJson) return;
      // Flatten LineString / MultiLineString coords.
      const feat = polyJson.features?.[0];
      const geom = feat?.geometry;
      let coords: number[][] = [];
      if (geom?.type === "LineString") coords = geom.coordinates as number[][];
      else if (geom?.type === "MultiLineString")
        coords = (geom.coordinates as number[][][]).flat();
      const bb = bboxFromPolyline(coords);
      if (!bb) return;
      const padded = padBbox(bb, 0.06);
      // Tiered plan: full bbox at z=10–13, then 5 mi / 2 mi / 0.5 mi
      // polyline-buffered tiles at z=14 / 15 / 16. See DEFAULT_OFFLINE_TIERS
      // in ./tileMath for the exact buffer config.
      const p = planTilesTiered(coords, padded);
      if (!cancelled) setPlan(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [riverId]);

  // Load existing manifest (if any).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = await getTileManifest(riverId);
      // TEMP DEBUG (remove once issue is diagnosed): pops the raw manifest
      // value on-device so we can see exactly what AsyncStorage returned
      // without needing the Metro terminal.
      Alert.alert(
        "readManifest result",
        JSON.stringify(
          m
            ? {
                hasManifest: true,
                tileKeys: m.tileKeys.length,
                downloadedAt: m.downloadedAt,
                basePath: m.basePath,
                totalBytes: m.totalBytes,
              }
            : { hasManifest: false }
        )
      );
      if (!cancelled) setManifest(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [riverId]);

  const handleStart = () => {
    // Reset the first-emit alert flag so re-downloads also surface the alert.
    firstEmitSeenRef.current = false;
    // DEBUG: unmistakable confirmation that the button-tap is reaching this
    // function. If you see this alert, the click is wired correctly and the
    // failure is downstream in the actual download. If you DON'T see this
    // alert, the click never made it to handleStart — point me at that and
    // I'll trace why.
    Alert.alert(
      "handleStart fired",
      `plan=${plan ? plan.count : "null"}` +
        ` · riverId=${riverId}` +
        ` · progress=${progress ? "set" : "null"}`
    );
    if (!plan) return;
    // Kick off the data-bundle save IN PARALLEL with the tile download. This
    // is the ONLY place that writes the river meta + polyline + POIs to the
    // offline cache, so the whole feature stays behind the $5 paywall (this
    // card is rendered only on the river-detail page, which itself is gated
    // by the unlock flow).
    saveRiverOfflineBundle(riverId).catch(() => {
      /* best-effort; tiles are the main payload */
    });
    const { cancel } = startTileDownload(
      riverId,
      plan,
      DEFAULT_OFFLINE_ZOOM_MIN,
      DEFAULT_OFFLINE_ZOOM_MAX,
      async (p) => {
        // DEBUG: alert exactly once on the FIRST progress event so we know
        // the download actually started emitting (and isn't silently
        // returning early). Subsequent emits just update state normally.
        if (!firstEmitSeenRef.current) {
          firstEmitSeenRef.current = true;
          Alert.alert(
            "first emit",
            `inProgress=${p.inProgress} completed=${p.completed} failed=${p.failed} total=${p.total}`
          );
        }
        setProgress(p);
        if (!p.inProgress && !p.cancelled) {
          // Reload manifest once we're done.
          const m = await getTileManifest(riverId);
          setManifest(m);
        }
      }
    );
    cancelRef.current = cancel;
    // DEBUG: confirm startTileDownload returned synchronously.
    Alert.alert("startTileDownload returned", `cancel fn = ${typeof cancel}`);
  };

  const handleCancel = () => {
    cancelRef.current?.();
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete offline map?",
      manifest
        ? `This will remove ${manifest.tileKeys.length} tiles (${fmtMB(
            manifest.totalBytes
          )}) from your device. You can download again later.`
        : "Remove offline tiles for this river?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteOfflineTiles(riverId);
            // Also drop the data bundle (meta/poly/POIs) so a "delete"
            // truly returns the user to the pre-download state.
            await deleteRiverOfflineBundle(riverId);
            setManifest(null);
            setProgress(null);
          },
        },
      ]
    );
  };

  // Build the rendered body in a local var so we can prepend the same
  // always-visible debug strip regardless of which branch wins.
  let body: React.ReactNode;

  if (!OFFLINE_TILES_SUPPORTED) {
    body = (
      <View style={[styles.card, styles.cardMuted]}>
        <View style={styles.row}>
          <Ionicons name="information-circle" size={18} color={COLORS.textMuted} />
          <Text style={styles.mutedText}>
            Offline map tiles are available on iOS &amp; Android — open the app
            on your phone to download.
          </Text>
        </View>
      </View>
    );
  } else if (progress?.inProgress) {
    const pct = progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;
    body = (
      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="cloud-download" size={18} color={COLORS.primary} />
          <Text style={styles.title}>Downloading offline map…</Text>
        </View>
        <Text style={styles.subtitle}>
          {progress.completed.toLocaleString()} of{" "}
          {progress.total.toLocaleString()} tiles · {fmtMB(progress.bytes)}{" "}
          downloaded
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
        <View style={styles.progressFootRow}>
          <Text style={styles.progressPct}>{pct}%</Text>
          <TouchableOpacity
            testID="offline-tiles-cancel"
            onPress={handleCancel}
            hitSlop={8}
          >
            <Text style={styles.cancelLink}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  } else if (manifest && manifest.tileKeys.length > 0) {
    // ── Already downloaded — single green "Downloaded" button. Tapping it
    // opens an action sheet with Re-download / Delete actions.
    const handleManage = () => {
      Alert.alert(
        "Offline map",
        `${manifest.tileKeys.length.toLocaleString()} USGS Topo tiles · ${fmtMB(
          manifest.totalBytes
        )} on device.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Re-download", onPress: handleStart },
          { text: "Delete", style: "destructive", onPress: handleDelete },
        ]
      );
    };
    body = (
      <TouchableOpacity
        testID="offline-tiles-downloaded"
        style={[styles.bareBtn, styles.btnDownloaded]}
        onPress={handleManage}
        activeOpacity={0.85}
      >
        <Ionicons name="checkmark-circle" size={16} color="#fff" />
        <Text style={styles.btnPrimaryText}>Downloaded</Text>
      </TouchableOpacity>
    );
  } else {
    // ── Nothing yet — bare blue "Download offline map" button.
    body = (
      <TouchableOpacity
        testID="offline-tiles-download"
        style={[styles.bareBtn, styles.btnPrimary, !plan && styles.btnDisabled]}
        onPress={handleStart}
        disabled={!plan}
        activeOpacity={0.85}
      >
        <Ionicons name="cloud-download" size={14} color="#fff" />
        <Text style={styles.btnPrimaryText}>Download offline map</Text>
      </TouchableOpacity>
    );
  }

  // TEMP DEBUG STRIP — always rendered above whatever branch wins so we can
  // see why the "Downloaded" button isn't showing without needing alerts or
  // Metro logs. Remove this block once the bug is diagnosed.
  const debugText =
    `v3 manifest=${manifest ? "y" : "n"}` +
    ` keys=${manifest ? manifest.tileKeys.length : "-"}` +
    ` prog=${
      progress
        ? `${progress.inProgress ? "run" : "done"} ` +
          `c=${progress.completed} f=${progress.failed} t=${progress.total}`
        : "none"
    }` +
    ` sup=${OFFLINE_TILES_SUPPORTED ? "y" : "n"}` +
    ` plan=${plan ? plan.count : "-"}`;
  return (
    <View>
      <View style={styles.dbgStrip}>
        <Text style={styles.dbgText}>{debugText}</Text>
        <TouchableOpacity
          onPress={async () => {
            await deleteRiverOfflineBundle(riverId);
            await deleteOfflineTiles(riverId);
            setManifest(null);
            setProgress(null);
            Alert.alert("Reset", "Manifest + tiles cleared. Try Download now.");
          }}
          style={styles.dbgBtn}
        >
          <Text style={styles.dbgBtnText}>RESET</Text>
        </TouchableOpacity>
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardMuted: { backgroundColor: COLORS.background, opacity: 0.85 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  title: { fontSize: 14, fontWeight: "900", color: COLORS.textMain },
  subtitle: {
    fontSize: 12.5,
    color: COLORS.textMuted,
    lineHeight: 17,
    marginBottom: 12,
  },
  mutedText: { flex: 1, fontSize: 12.5, color: COLORS.textMuted, lineHeight: 17 },
  progressTrack: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 4,
  },
  progressFill: { height: "100%", backgroundColor: COLORS.primary },
  progressFootRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  progressPct: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.primary,
  },
  cancelLink: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.danger,
  },
  btnRow: { flexDirection: "row", gap: 8 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: 10,
    gap: 6,
    flex: 1,
  },
  // Same shape as `btn` but standalone (no flex:1) and with a top margin so
  // it sits cleanly under the surrounding content when rendered without a
  // wrapping card.
  bareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 10,
    gap: 6,
    marginTop: 12,
  },
  btnPrimary: { backgroundColor: COLORS.primary },
  // Solid green "Downloaded" state — used after a successful tile download.
  // Mirrors the shape of btnPrimary so the layout doesn't shift.
  btnDownloaded: { backgroundColor: COLORS.safe },
  btnPrimaryText: {
    color: "#fff",
    fontSize: 13.5,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  btnSecondary: {
    backgroundColor: COLORS.primary + "12",
    borderWidth: 1,
    borderColor: COLORS.primary + "40",
  },
  btnSecondaryText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  btnDanger: {
    backgroundColor: COLORS.danger + "12",
    borderWidth: 1,
    borderColor: COLORS.danger + "40",
  },
  btnDangerText: { color: COLORS.danger, fontSize: 13, fontWeight: "800" },
  btnDisabled: { opacity: 0.6 },
  // TEMP debug strip — bright yellow so it can't be missed on screen.
  dbgStrip: {
    backgroundColor: "#FFE066",
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C49B00",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dbgText: { fontSize: 11, color: "#5B4500", fontWeight: "800", flex: 1 },
  dbgBtn: {
    backgroundColor: "#5B4500",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  dbgBtnText: { color: "#FFE066", fontSize: 10, fontWeight: "900" },
});
