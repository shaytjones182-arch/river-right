// "Download offline map" card shown on the river detail page.
//
// Loads the curated polyline → computes a tile plan → lets the user kick
// off / cancel / delete a download of USGS Topo tiles for offline use.
// Behind the $5-per-river paywall: tapping the button when the river is
// NOT yet unlocked opens PaywallSheet; on a successful purchase we
// automatically begin the download (one tap, no double-prompt).

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
import PaywallSheet from "../iap/PaywallSheet";
import { useUnlocks } from "../iap/useUnlocks";
import { productForRiver } from "../iap/products";

type Props = {
  riverId: string;
  riverName?: string;
};

function fmtMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function OfflineMapCard({ riverId, riverName }: Props) {
  const [plan, setPlan] = useState<TilePlan | null>(null);
  const [manifest, setManifest] = useState<TileManifest | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  // Paywall state — only relevant for the very first download attempt on
  // an un-purchased river. Once unlocked we skip this entirely.
  const { isUnlocked, ready: unlocksReady } = useUnlocks();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const product = productForRiver(riverId);
  const purchased = unlocksReady && isUnlocked(riverId);

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
      if (!cancelled) setManifest(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [riverId]);

  // Internal: actually kicks off the download (skips the paywall check).
  const beginDownload = () => {
    if (!plan) return;
    // Kick off the data-bundle save IN PARALLEL with the tile download.
    saveRiverOfflineBundle(riverId).catch(() => {
      /* best-effort; tiles are the main payload */
    });
    const { cancel } = startTileDownload(
      riverId,
      plan,
      DEFAULT_OFFLINE_ZOOM_MIN,
      DEFAULT_OFFLINE_ZOOM_MAX,
      async (p) => {
        setProgress(p);
        if (!p.inProgress && !p.cancelled) {
          // Reload manifest once we're done.
          const m = await getTileManifest(riverId);
          setManifest(m);
        }
      }
    );
    cancelRef.current = cancel;
  };

  // Public tap handler: paywall first (if not unlocked), then download.
  const handleStart = () => {
    if (!plan) return;
    if (!purchased) {
      setPaywallOpen(true);
      return;
    }
    beginDownload();
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

  // Build the rendered body based on current state.
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
    // ── Nothing yet — blue "Download offline map for $X" button. Tapping
    // it opens the paywall first if the user hasn't unlocked this run yet.
    const ctaLabel = purchased
      ? "Download offline map"
      : `Download offline map for ${product.displayPrice}`;
    body = (
      <TouchableOpacity
        testID="offline-tiles-download"
        style={[styles.bareBtn, styles.btnPrimary, !plan && styles.btnDisabled]}
        onPress={handleStart}
        disabled={!plan}
        activeOpacity={0.85}
      >
        <Ionicons name={purchased ? "cloud-download" : "lock-closed"} size={14} color="#fff" />
        <Text style={styles.btnPrimaryText}>{ctaLabel}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <>
      {body}
      <PaywallSheet
        visible={paywallOpen}
        riverId={riverId}
        riverName={riverName ?? null}
        onClose={() => setPaywallOpen(false)}
        onUnlocked={() => {
          setPaywallOpen(false);
          // Tiny defer so the sheet finishes its close animation before
          // we kick off the download — looks more polished than overlap.
          setTimeout(() => beginDownload(), 250);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    // Mirror the bareBtn rhythm — keeps the gap to the "View on Map"
    // button above and the "About this run" heading below identical
    // whether the card is in its compact (button-only) or expanded state.
    marginTop: 8,
    marginBottom: 8,
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
    // Tight top gap so the Download button reads as a sibling of the
    // "View on Map" button directly above (without touching it).
    marginTop: 8,
    // Bottom gap matches the visual rhythm of the rest of the river-detail
    // card — pairs with the h3.marginTop (8) of the following "About this
    // run" heading for a uniform ~16 px section break.
    marginBottom: 8,
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
});
