import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { useRouter } from "expo-router";
import MapView from "../src/MapView";
import { COLORS, API } from "../src/theme";

type River = {
  id: string;
  name: string;
  state: string;
  class_rating: string;
  type: string;
  description: string;
  put_in: { name: string; lat: number; lon: number };
  take_out: { name: string; lat: number; lon: number };
};

const buildHtml = (rivers: River[]) => {
  // Pass river data as JSON; bind handlers programmatically (no inline onclick)
  const dataJson = JSON.stringify(
    rivers.map((r) => ({
      id: r.id,
      name: r.name,
      state: r.state,
      cls: r.class_rating,
      type: r.type,
      plat: r.put_in.lat,
      plon: r.put_in.lon,
      tlat: r.take_out.lat,
      tlon: r.take_out.lon,
    }))
  );

  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="initial-scale=1.0,maximum-scale=1.0,user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html,body,#m{margin:0;padding:0;height:100%;width:100%;background:#dfeef7;}
  .pulse{
    width:14px;height:14px;border-radius:50%;
    border:2px solid #fff;
    box-shadow:0 0 0 4px rgba(255,255,255,0.55), 0 1px 4px rgba(0,0,0,0.4);
  }
  .leaflet-popup-content-wrapper{border-radius:12px;}
  .leaflet-popup-content{margin:10px 12px;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;}
  .pop-title{font-weight:800;font-size:14px;color:#0A1128;margin-bottom:2px;}
  .pop-meta{font-size:11px;color:#5C6B73;letter-spacing:1px;font-weight:700;text-transform:uppercase;margin-bottom:8px;}
  .pop-cta{display:inline-block;background:#0077B6;color:#fff;padding:8px 14px;border-radius:999px;font-size:12px;font-weight:800;text-decoration:none;letter-spacing:0.5px;cursor:pointer;border:none;}
  .pop-cta:active{opacity:0.85;}
</style>
</head><body>
<div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
  var rivers = ${dataJson};

  function navigate(id){
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(id);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'river', id: id }, '*');
    }
  }

  var map = L.map('m', { zoomControl:false, attributionControl:false, minZoom:3, maxZoom:13 })
    .setView([39.5, -98.35], 4);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
    { subdomains:'abcd', maxZoom:19 }).addTo(map);

  L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroCached/MapServer/tile/{z}/{y}/{x}',
    { maxZoom:16, opacity:0.85 }).addTo(map);

  L.control.zoom({ position:'topright' }).addTo(map);

  function colorFor(t){
    if (t === 'whitewater') return '#D62828';
    if (t === 'calm') return '#2A9D8F';
    return '#F4A261';
  }

  rivers.forEach(function(r){
    var color = colorFor(r.type);

    var icon = L.divIcon({
      className: '',
      html: '<div class="pulse" style="background:' + color + '"></div>',
      iconSize: [14,14],
      iconAnchor: [7,7]
    });

    var popupEl = document.createElement('div');
    var title = document.createElement('div');
    title.className = 'pop-title';
    title.textContent = r.name;
    var meta = document.createElement('div');
    meta.className = 'pop-meta';
    meta.textContent = r.state + ' \\u00B7 CLASS ' + r.cls;
    var btn = document.createElement('button');
    btn.className = 'pop-cta';
    btn.textContent = 'View run \\u2192';
    btn.addEventListener('click', function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      navigate(r.id);
    });
    popupEl.appendChild(title);
    popupEl.appendChild(meta);
    popupEl.appendChild(btn);

    L.marker([r.plat, r.plon], { icon: icon })
      .addTo(map)
      .bindPopup(popupEl, { closeButton: false, offset: [0, -4] });
  });
})();
</script>
</body></html>`;
};

export default function MapScreen() {
  const router = useRouter();
  const webRef = useRef<WebView>(null);
  const [rivers, setRivers] = useState<River[]>([]);
  const [loading, setLoading] = useState(true);
  const [legendOpen, setLegendOpen] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/rivers/featured`);
      const j = await r.json();
      setRivers(j.rivers || []);
    } catch (e) {
      console.warn("map rivers", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Web: listen for postMessage from iframe
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handler = (e: MessageEvent) => {
      const data: any = e.data;
      if (data && data.type === "river" && data.id) {
        router.push(`/river/${data.id}`);
      }
    };
    // @ts-ignore
    window.addEventListener("message", handler);
    return () => {
      // @ts-ignore
      window.removeEventListener("message", handler);
    };
  }, [router]);

  const html = rivers.length > 0 ? buildHtml(rivers) : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="map-screen">
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.h1}>Map</Text>
          <Text style={styles.sub}>USA rivers · USGS hydrography</Text>
        </View>
        <TouchableOpacity
          testID="map-legend-toggle"
          onPress={() => setLegendOpen((v) => !v)}
          style={styles.iconBtn}
          activeOpacity={0.7}
        >
          <Ionicons
            name={legendOpen ? "information-circle" : "information-circle-outline"}
            size={22}
            color={COLORS.textMain}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.mapWrap} testID="map-container">
        {loading || !html ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading rivers…</Text>
          </View>
        ) : (
          <MapView
            webViewRef={webRef}
            html={html}
            onMessage={(id: string) => {
              if (id) router.push(`/river/${id}`);
            }}
          />
        )}

        {legendOpen && (
          <View style={styles.legend} testID="map-legend">
            <Text style={styles.legendTitle}>RIVER TYPE</Text>
            <View style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: COLORS.danger }]} />
              <Text style={styles.legendText}>Whitewater</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: COLORS.warning }]} />
              <Text style={styles.legendText}>Mixed</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: COLORS.safe }]} />
              <Text style={styles.legendText}>Calm</Text>
            </View>
            <Text style={styles.legendHint}>Tap a marker → view run</Text>
          </View>
        )}
      </View>

      <View style={styles.statsBar} testID="map-stats">
        <Stat label="RIVERS" value={`${rivers.length}`} />
        <View style={styles.statDivider} />
        <Stat
          label="WHITEWATER"
          value={`${rivers.filter((r) => r.type === "whitewater").length}`}
        />
        <View style={styles.statDivider} />
        <Stat
          label="MIXED"
          value={`${rivers.filter((r) => r.type === "mixed").length}`}
        />
        <View style={styles.statDivider} />
        <Stat
          label="CALM"
          value={`${rivers.filter((r) => r.type === "calm").length}`}
        />
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  h1: { fontSize: 26, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
  sub: { color: COLORS.textMuted, marginTop: 2, fontSize: 13 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mapWrap: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.border,
    position: "relative",
  },
  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { color: COLORS.textMuted, fontSize: 13, fontWeight: "600" },
  legend: {
    position: "absolute",
    left: 12,
    bottom: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 158,
  },
  legendTitle: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 13, fontWeight: "700", color: COLORS.textMain },
  legendHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 6,
    fontStyle: "italic",
  },
  statsBar: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "space-between",
  },
  stat: { alignItems: "center", flex: 1 },
  statValue: { fontSize: 20, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
  statLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statDivider: { width: 1, height: 30, backgroundColor: COLORS.border },
});
