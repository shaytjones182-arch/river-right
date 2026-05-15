import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView from "../../../src/MapView";
import { COLORS, STATUS_COLORS, API } from "../../../src/theme";

type SiteData = {
  site_id: string;
  name: string;
  lat: number;
  lon: number;
  cfs: number | null;
  gauge_height_ft: number | null;
  status: string;
  label: string;
  updated_at?: string;
};

const buildHtml = (lat: number, lon: number, name: string) => `<!DOCTYPE html>
<html><head><meta name="viewport" content="initial-scale=1.0,maximum-scale=1.0">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html,body,#m{margin:0;padding:0;height:100%;width:100%;background:#E0E1DD;}
  .tile-banner{position:absolute;top:8px;left:50%;transform:translate(-50%,-150%);z-index:1000;pointer-events:none;background:#0A1128;color:#fff;padding:6px 12px;border-radius:999px;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:11px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,0.35);display:flex;align-items:center;gap:6px;max-width:88%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:transform 220ms ease-out,opacity 220ms ease-out;}
  .tile-banner.show{transform:translate(-50%,0);opacity:1;}
  .tile-banner svg{width:12px;height:12px;flex-shrink:0;}
</style>
</head><body><div id="m"></div>
<div id="tile-banner" class="tile-banner" role="status" aria-live="polite">
  <svg viewBox="0 0 24 24" fill="none" stroke="#F4A261" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5"/><path d="M12 18v.01"/></svg>
  <span>Map tiles unavailable</span>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var m = L.map('m', { zoomControl:false, attributionControl:false, maxZoom:16 }).setView([${lat}, ${lon}], 11);
// USGS Topo basemap only — OSM tile servers disallow app use.
var _t = L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', { maxZoom:16 });
_t.addTo(m);
var __tileErrCount = 0, __tileBanner = document.getElementById('tile-banner');
_t.on('tileerror', function(){ __tileErrCount++; if(__tileErrCount>=3 && __tileBanner) __tileBanner.classList.add('show'); });
_t.on('tileload', function(){ if(__tileErrCount>0){__tileErrCount=0; if(__tileBanner) __tileBanner.classList.remove('show');} });
L.marker([${lat}, ${lon}]).addTo(m).bindPopup(${JSON.stringify(name)});
</script></body></html>`;

export default function GaugeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [site, setSite] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/usgs/site/${id}`);
        if (!r.ok) {
          setErr("Could not load gauge data.");
          return;
        }
        const j = await r.json();
        setSite(j);
      } catch {
        setErr("Could not load gauge data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (err || !site) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnSimple}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textMain} />
        </TouchableOpacity>
        <Text style={styles.errText}>{err || "Gauge not found"}</Text>
      </SafeAreaView>
    );
  }

  const statusColor = STATUS_COLORS[site.status] || COLORS.textMuted;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="gauge-detail-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtnSimple}>
            <Ionicons name="arrow-back" size={22} color={COLORS.textMain} />
          </TouchableOpacity>
          <Text style={styles.headerLabel}>USGS GAUGE</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.body}>
          <Text style={styles.name}>{site.name}</Text>
          <Text style={styles.subtle}>Site #{site.site_id}</Text>

          <View style={styles.statCard} testID="gauge-detail-flow-card">
            <View style={styles.flowRow}>
              <View>
                <Text style={styles.bigCfs}>
                  {site.cfs !== null && site.cfs !== undefined ? Math.round(site.cfs).toLocaleString() : "—"}
                </Text>
                <Text style={styles.cfsUnit}>CFS — Discharge</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
                <Text style={styles.statusText}>{site.label?.toUpperCase()}</Text>
              </View>
            </View>
            {site.gauge_height_ft !== null && site.gauge_height_ft !== undefined && (
              <View style={styles.secondary}>
                <Text style={styles.secondaryLabel}>GAUGE HEIGHT</Text>
                <Text style={styles.secondaryValue}>{site.gauge_height_ft.toFixed(2)} ft</Text>
              </View>
            )}
            {site.updated_at && (
              <Text style={styles.subtle}>Updated {new Date(site.updated_at).toLocaleString()}</Text>
            )}
          </View>

          <Text style={styles.h3}>Location</Text>
          <View style={styles.mapWrap} testID="gauge-detail-map">
            <MapView html={buildHtml(site.lat, site.lon, site.name || "Gauge")} />
          </View>
          <Text style={styles.subtle}>
            {site.lat.toFixed(4)}, {site.lon.toFixed(4)}
          </Text>

          <View style={styles.legend}>
            <Text style={styles.overline}>Flow legend</Text>
            <View style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: COLORS.low }]} />
              <Text style={styles.legendText}>Low &lt; 100 cfs</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: COLORS.safe }]} />
              <Text style={styles.legendText}>Runnable 100–1,500</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: COLORS.warning }]} />
              <Text style={styles.legendText}>High 1,500–8,000</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: COLORS.danger }]} />
              <Text style={styles.legendText}>Flood &gt; 8,000</Text>
            </View>
            <Text style={[styles.subtle, { marginTop: 8 }]}>
              Heuristic only — always check river-specific runnable ranges before launching.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backBtnSimple: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerLabel: { fontWeight: "900", color: COLORS.textMuted, letterSpacing: 2, fontSize: 12 },
  body: { padding: 20 },
  name: { fontSize: 24, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.6 },
  subtle: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  statCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: 18,
    marginTop: 18,
    marginBottom: 16,
  },
  flowRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bigCfs: { fontSize: 44, fontWeight: "900", color: COLORS.textMain, letterSpacing: -2 },
  cfsUnit: { fontSize: 11, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 2 },
  statusPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  statusText: { color: "#fff", fontWeight: "900", letterSpacing: 1, fontSize: 13 },
  secondary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  secondaryLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 2, color: COLORS.textMuted },
  secondaryValue: { fontSize: 18, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
  h3: { fontSize: 18, fontWeight: "900", color: COLORS.textMain, marginBottom: 8, marginTop: 8 },
  mapWrap: {
    height: 220,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.border,
    marginBottom: 8,
  },
  legend: { marginTop: 22, padding: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16 },
  overline: { fontSize: 11, fontWeight: "800", letterSpacing: 2, color: COLORS.textMuted, marginBottom: 10 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { color: COLORS.textMain, fontWeight: "600", fontSize: 14 },
  errText: { textAlign: "center", marginTop: 40, color: COLORS.danger },
});
