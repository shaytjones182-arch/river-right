// "Download offline map" card shown on the river detail page.
//
// Loads the curated polyline → computes a tile plan → lets the user kick
// off / cancel / delete a download of USGS Topo tiles for offline use.

import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../theme";
import { fetchPolylineWithCache } from "../offlineCache";
import {
  bboxFromPolyline,
  padBbox,
  planTiles,
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
      const p = planTiles(
        padded,
        DEFAULT_OFFLINE_ZOOM_MIN,
        DEFAULT_OFFLINE_ZOOM_MAX
      );
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

  const handleStart = () => {
    if (!plan) return;
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
            setManifest(null);
            setProgress(null);
          },
        },
      ]
    );
  };

  if (!OFFLINE_TILES_SUPPORTED) {
    return (
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
  }

  // ── Active download in progress ──
  if (progress?.inProgress) {
    const pct = progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;
    return (
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
  }

  // ── Already downloaded ──
  if (manifest && manifest.tileKeys.length > 0) {
    const ageDays = Math.floor(
      (Date.now() - manifest.downloadedAt) / (1000 * 60 * 60 * 24)
    );
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="checkmark-circle" size={18} color={COLORS.safe} />
          <Text style={styles.title}>Offline map ready</Text>
        </View>
        <Text style={styles.subtitle}>
          {manifest.tileKeys.length.toLocaleString()} USGS Topo tiles ·{" "}
          {fmtMB(manifest.totalBytes)} on device
          {ageDays >= 1 ? ` · downloaded ${ageDays} day${ageDays === 1 ? "" : "s"} ago` : " · downloaded today"}
        </Text>
        <View style={styles.btnRow}>
          <TouchableOpacity
            testID="offline-tiles-redownload"
            style={[styles.btn, styles.btnSecondary]}
            onPress={handleStart}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={14} color={COLORS.primary} />
            <Text style={styles.btnSecondaryText}>Re-download</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="offline-tiles-delete"
            style={[styles.btn, styles.btnDanger]}
            onPress={handleDelete}
            activeOpacity={0.85}
          >
            <Ionicons name="trash" size={14} color={COLORS.danger} />
            <Text style={styles.btnDangerText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Nothing yet — show the download CTA ──
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons name="cloud-download-outline" size={18} color={COLORS.primary} />
        <Text style={styles.title}>Download for offline use</Text>
      </View>
      <Text style={styles.subtitle}>
        Save USGS Topo map tiles to your phone so the river map works without
        cell service.
        {plan
          ? `\n\n~${plan.count.toLocaleString()} tiles · ~${plan.estimatedMB.toFixed(0)} MB`
          : "\n\nCalculating size…"}
      </Text>
      <TouchableOpacity
        testID="offline-tiles-download"
        style={[styles.btn, styles.btnPrimary, !plan && styles.btnDisabled]}
        onPress={handleStart}
        disabled={!plan}
        activeOpacity={0.85}
      >
        <Ionicons name="cloud-download" size={14} color="#fff" />
        <Text style={styles.btnPrimaryText}>Download offline map</Text>
      </TouchableOpacity>
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
  btnPrimary: { backgroundColor: COLORS.primary },
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
