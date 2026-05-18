import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { COLORS, STATUS_COLORS, API } from "../../../src/theme";
import {
  fetchRiverWithCache,
  fetchPoisWithCache,
} from "../../../src/offlineCache";
import OfflineMapCard from "../../../src/tiles/OfflineMapCard";

// One bullet in the "Helpful information" section. `text` is required
// and renders as plain copy. `url` is optional — when present the entire
// row becomes tappable and opens the URL in the system browser (or in the
// matching app, e.g. tel: links open the dialer).
type HelpfulInfoItem = {
  text: string;
  url?: string;
};

type RiverDetail = {
  river: {
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
    // Friendly station label (e.g. "Green River at Green River, Utah
    // (Station 09315000)") shown beneath the live CFS readout. Falls
    // back to the bare site id if the backend doesn't supply it.
    usgs_site_name?: string;
    image: string;
    points_of_interest?: string[];
    // Optional curated bullet list shown above the POI section. Loaded
    // from /app/data/runs/<river-id>/helpful_info.json by the backend.
    helpful_info?: HelpfulInfoItem[];
  };
  flow: {
    cfs: number | null;
    gauge_height_ft: number | null;
    status: string;
    label: string;
    updated_at?: string;
  } | null;
};

type OsmPoi = {
  name: string;
  category: string;
  kind: string;
  lat: number;
  lon: number;
  distance_from_putin_mi: number;
  grade?: string | null;
};

const KIND_ICON: Record<string, any> = {
  rapid: "water",
  play: "swap-horizontal",
  putin: "log-in",
  takeout: "log-out",
  portage: "footsteps",
  hazard: "warning",
  waterfall: "trending-down",
};

export default function RiverDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<RiverDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [osmPois, setOsmPois] = useState<OsmPoi[] | null>(null);
  const [osmLoading, setOsmLoading] = useState(true);
  const [osmError, setOsmError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const j = await fetchRiverWithCache(id as string);
        if (!cancelled) setData(j);
        // NOTE: we intentionally do NOT eagerly cache the polyline / POIs
        // here. Offline data is now gated behind the explicit "Download
        // offline map" flow on this same screen — keeping all offline
        // capability behind the $5 paywall.
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    // Fetch curated/OSM POIs — cache-aware, non-blocking, graceful fallback
    let cancelled = false;
    (async () => {
      try {
        const j = await fetchPoisWithCache(id as string);
        if (cancelled) return;
        if (j.error) {
          setOsmError(true);
        } else {
          setOsmPois(j.pois || []);
        }
      } catch {
        if (!cancelled) setOsmError(true);
      } finally {
        if (!cancelled) setOsmLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!data?.river) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={{ textAlign: "center", marginTop: 40, color: COLORS.danger }}>River not found.</Text>
      </SafeAreaView>
    );
  }

  const r = data.river;
  const flow = data.flow;
  const statusColor = flow ? STATUS_COLORS[flow.status] || COLORS.textMuted : COLORS.textMuted;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="river-detail-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.heroWrap}>
          <Image source={{ uri: r.image }} style={styles.hero} />
          <View style={styles.heroOverlay} />
          <TouchableOpacity
            testID="river-detail-back"
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.heroContent}>
            <View style={styles.row}>
              <View
                style={[
                  styles.classBadge,
                  {
                    backgroundColor:
                      r.type === "whitewater"
                        ? COLORS.danger
                        : r.type === "calm"
                        ? COLORS.safe
                        : COLORS.warning,
                  },
                ]}
              >
                <Text style={styles.classText}>CLASS {r.class_rating}</Text>
              </View>
              <Text style={styles.state}>{r.state}</Text>
            </View>
            <Text style={styles.name}>{r.name}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.flowCard} testID="river-detail-flow-card">
            <Text style={styles.overline}>Current flow</Text>
            <View style={styles.flowRow}>
              <View>
                <Text style={styles.bigCfs}>
                  {flow?.cfs !== null && flow?.cfs !== undefined ? Math.round(flow.cfs).toLocaleString() : "—"}
                </Text>
                <Text style={styles.cfsUnit}>CFS</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
                <Text style={styles.statusText}>{flow?.label?.toUpperCase() || "NO DATA"}</Text>
              </View>
            </View>
            {/* Replaces the prior "Gauge height: X.XX ft" line. Showing the
                friendly station name reinforces which gauge the CFS reading
                came from and reads naturally on the river card. We still
                emit the line when only a bare `usgs_site_id` is available
                so something useful renders even before the friendly name is
                wired up for a given river. */}
            {(r.usgs_site_name || r.usgs_site_id) && (
              <Text style={styles.subtle} numberOfLines={2}>
                {r.usgs_site_name || `Station ${r.usgs_site_id}`}
              </Text>
            )}
            {flow?.updated_at && (
              <Text style={styles.subtle}>Updated {new Date(flow.updated_at).toLocaleString()}</Text>
            )}
            {flow === null && (
              <Text style={styles.subtle}>
                Live flow unavailable — connect to network for current readings.
              </Text>
            )}
          </View>

          <TouchableOpacity
            testID="river-view-on-map"
            style={styles.viewOnMapBtn}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: "/map",
                // The `reset` nonce forces the map tab to drop any saved
                // viewport / pan-zoom and refit to this river's default
                // bounding view — every tap from this card lands on a
                // clean overview of the run, regardless of where the user
                // last left the map tab.
                params: { river: r.id, reset: String(Date.now()) },
              })
            }
          >
            <Ionicons name="map" size={18} color="#fff" />
            <Text style={styles.viewOnMapBtnText}>View on Map</Text>
          </TouchableOpacity>

          <OfflineMapCard riverId={r.id} />

          {/* ── About this run ────────────────────────────────────────────
              Intentionally hidden behind a `false` guard rather than deleted
              so the layout & data wiring is ready the moment we have new
              copy to inject. Flip the guard back to `true` (or replace with
              a real condition) to restore the section.
          ─────────────────────────────────────────────────────────────── */}
          {false && (
            <>
              <Text style={styles.h3}>About this run</Text>
              <Text style={styles.body1}>{r.description}</Text>
            </>
          )}

          {/* ── Helpful information ──────────────────────────────────────
              Curated bullet list (permits, campsite reservations, shuttle
              bookings, general notices). Renders only when the river's
              `helpful_info.json` is non-empty. Each row is a bullet plus a
              text line; if `url` is provided, the row is tappable and opens
              the link in the system browser (or the matching native app for
              tel:/mailto: schemes).
          ─────────────────────────────────────────────────────────────── */}
          {r.helpful_info && r.helpful_info.length > 0 && (
            <View testID="helpful-info-list">
              <Text style={styles.h3}>Helpful information</Text>
              {r.helpful_info.map((item, i) => {
                const hasUrl = !!item.url;
                const row = (
                  <View style={styles.helpfulRow}>
                    <Ionicons
                      name="ellipse"
                      size={6}
                      color={COLORS.textMuted}
                      style={styles.helpfulBullet}
                    />
                    <Text
                      style={[
                        styles.helpfulText,
                        hasUrl && styles.helpfulTextLink,
                      ]}
                    >
                      {item.text}
                      {hasUrl ? (
                        <Text style={styles.helpfulExternalIcon}> ↗</Text>
                      ) : null}
                    </Text>
                  </View>
                );
                if (hasUrl) {
                  return (
                    <TouchableOpacity
                      key={i}
                      activeOpacity={0.6}
                      onPress={() =>
                        Linking.openURL(item.url as string).catch(() => {})
                      }
                      testID={`helpful-info-link-${i}`}
                    >
                      {row}
                    </TouchableOpacity>
                  );
                }
                return <View key={i}>{row}</View>;
              })}
            </View>
          )}

          <View style={styles.osmHeaderRow}>
            <View>
              <Text style={styles.h3}>Points of interest</Text>
              <Text style={styles.subtle}>
                {osmPois && osmPois.length > 0
                  ? `${osmPois.length} POI${osmPois.length === 1 ? "" : "s"} from curated data`
                  : "from curated data"}
              </Text>
            </View>
            {osmLoading && <ActivityIndicator size="small" color={COLORS.textMuted} />}
          </View>

          {/* All POIs come purely from the curated data file — no hardcoded
              put-in / take-out cards. They're rendered here in distance order
              alongside rapids, hazards, camps, and access points. */}
          {!osmLoading && !osmError && osmPois && osmPois.length > 0 && (
            <View testID="osm-poi-list">
              {osmPois.map((p, i) => {
                  let name = p.name;
                  if (!name || /^rapids?$/i.test(name)) {
                    if (p.kind === "boat_ramp") name = "Boat Ramp";
                    else if (p.kind === "access") name = "Access Point";
                    else if (p.kind === "camp") name = "Campground";
                    else if (p.kind === "note") name = "Note";
                    else name = "Unnamed rapid";
                  }
                  const cat = p.category || "";
                  const nameLower = name.toLowerCase();
                  // Skip the category if it's redundant (e.g., name="Summersville Dam"
                  // already contains "Dam") or generic "Rapids/Rapid".
                  const showCat =
                    cat &&
                    !/^rapids?$/i.test(cat) &&
                    !nameLower.includes(cat.toLowerCase());
                  const parts: string[] = [];
                  if (showCat) parts.push(cat);
                  if (p.grade) parts.push(`Class ${p.grade}`);
                  if (typeof p.distance_from_putin_mi === "number" && p.distance_from_putin_mi > 0) {
                    parts.push(`${p.distance_from_putin_mi.toFixed(1)} river-mi`);
                  }
                  const bulletColor =
                    p.kind === "hazard" || p.kind === "waterfall"
                      ? COLORS.danger
                      : p.kind === "portage"
                      ? COLORS.warning
                      : p.kind === "play"
                      ? COLORS.safe
                      : p.kind === "camp"
                      ? "#8B5E34"
                      : p.kind === "boat_ramp" ||
                        p.kind === "access" ||
                        p.kind === "putin" ||
                        p.kind === "takeout"
                      ? COLORS.safe
                      : p.kind === "note"
                      ? COLORS.textMuted
                      : COLORS.warning; // rapids (and anything else) — unified yellow
                  return (
                    <View key={`${p.lat}-${p.lon}-${i}`} style={styles.hazard}>
                      <Ionicons
                        name="ellipse"
                        size={8}
                        color={bulletColor}
                        style={{ marginTop: 8 }}
                      />
                      <Text style={styles.hazardText}>
                        {name}
                        {parts.length > 0 ? (
                          <Text style={styles.poiMeta}> — {parts.join(" · ")}</Text>
                        ) : null}
                      </Text>
                    </View>
                  );
                })}
            </View>
          )}

          {!osmLoading && osmError && (
            <Text style={[styles.subtle, { marginTop: 6 }]}>
              Curated POI data temporarily unavailable.
            </Text>
          )}

          <TouchableOpacity
            testID="river-detail-track-btn"
            style={styles.cta}
            onPress={() => router.push("/track")}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate" size={22} color="#fff" />
            <Text style={styles.ctaText}>START GPS TRIP</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  heroWrap: { height: 280, position: "relative" },
  hero: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,17,40,0.5)" },
  backBtn: {
    position: "absolute",
    top: 12,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroContent: { flex: 1, justifyContent: "flex-end", padding: 20 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  classBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  classText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  state: { color: "#fff", fontWeight: "800", letterSpacing: 1 },
  name: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: -0.6 },
  body: { padding: 20 },
  flowCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
  },
  viewOnMapBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
    // Tight gap to the Download offline map button that sits directly
    // beneath. OfflineMapCard's bare button adds its own marginTop (8) so
    // the visible separator between the two buttons is ~8 px — they read
    // as a related pair without touching.
    marginBottom: 0,
    minHeight: 48,
  },
  viewOnMapBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 0.8,
  },
  overline: { fontSize: 11, fontWeight: "800", letterSpacing: 2, color: COLORS.textMuted, marginBottom: 8 },
  flowRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  bigCfs: { fontSize: 44, fontWeight: "900", color: COLORS.textMain, letterSpacing: -2 },
  cfsUnit: { fontSize: 12, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 2 },
  statusPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  statusText: { color: "#fff", fontWeight: "900", letterSpacing: 1, fontSize: 13 },
  subtle: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  h3: { fontSize: 18, fontWeight: "900", color: COLORS.textMain, marginBottom: 8, marginTop: 8, letterSpacing: -0.3 },
  body1: { color: COLORS.textMain, lineHeight: 22, marginBottom: 16, fontSize: 15 },
  hazard: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 6 },
  hazardText: { flex: 1, color: COLORS.textMain, lineHeight: 20, fontSize: 14 },

  // ── Helpful information bullets ─────────────────────────────────────
  // Slightly smaller bullet glyph than the POI list to read as a
  // secondary "info" list, but typography matches the rest of the card.
  helpfulRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 6,
  },
  helpfulBullet: {
    marginTop: 9,
  },
  helpfulText: {
    flex: 1,
    color: COLORS.textMain,
    lineHeight: 20,
    fontSize: 14,
  },
  helpfulTextLink: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  helpfulExternalIcon: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  poiLead: { fontWeight: "800", color: COLORS.textMain },
  poiMeta: { color: COLORS.textMuted, fontSize: 13 },
  osmHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  osmGrid: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 8,
    marginBottom: 16,
  },
  osmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  osmIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  osmName: { fontWeight: "800", color: COLORS.textMain, fontSize: 14 },
  osmMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  osmFooter: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: "italic",
  },
  logCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 24,
  },
  logRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
  logLabel: { fontSize: 10, letterSpacing: 2, fontWeight: "900", color: COLORS.textMuted, marginBottom: 2 },
  logName: { fontWeight: "800", color: COLORS.textMain, fontSize: 15 },
  cta: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    marginTop: 8,
  },
  ctaText: { color: "#fff", fontWeight: "900", letterSpacing: 2, fontSize: 16 },
});
