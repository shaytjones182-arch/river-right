import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
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

type OsmPoi = {
  name: string;
  category: string;
  kind: string;
  lat: number;
  lon: number;
  distance_from_putin_mi: number;
  grade?: string | null;
};

// ---------------- HTML builders ----------------

const COMMON_HEAD = `
<meta name="viewport" content="initial-scale=1.0,maximum-scale=1.0,user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html,body,#m{margin:0;padding:0;height:100%;width:100%;background:#dfeef7;}
  .pulse{
    width:14px;height:14px;border-radius:50%;
    border:2px solid #fff;
    box-shadow:0 0 0 4px rgba(255,255,255,0.55), 0 1px 4px rgba(0,0,0,0.4);
  }
  .pin{
    width:28px;height:28px;border-radius:50%;
    border:2px solid #fff; background:#0077B6;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 2px 6px rgba(0,0,0,0.35);
    color:#fff;font-weight:900;
  }
  .pin svg{width:14px;height:14px;}
  .pin.start{background:#2A9D8F;}
  .pin.finish{background:#0A1128;}
  .pin.rapid-mild{background:#457B9D;}
  .pin.rapid-mod{background:#F4A261;}
  .pin.rapid-hard{background:#D62828;}
  .pin.hazard{background:#D62828;}
  .pin.portage{background:#F4A261;}
  .pin.play{background:#2A9D8F;}
  .pin-tri{
    width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;
    border-bottom:24px solid #D62828;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.4));
    position:relative;
  }
  .pin-tri::before{
    content:'!';position:absolute;left:-4px;top:8px;width:8px;text-align:center;
    color:#fff;font-weight:900;font-size:13px;
  }
  .leaflet-popup-content-wrapper{border-radius:12px;}
  .leaflet-popup-content{margin:8px 12px;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;}
  .pop-title{font-weight:800;font-size:13px;color:#0A1128;}
  .pop-meta{font-size:11px;color:#5C6B73;margin-top:2px;}
</style>
`;

const COMMON_TILES_JS = `
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
    { subdomains:'abcd', maxZoom:19 }).addTo(map);
  L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroCached/MapServer/tile/{z}/{y}/{x}',
    { maxZoom:16, opacity:0.85 }).addTo(map);
  L.control.zoom({ position:'topright' }).addTo(map);
`;

const NAV_JS = `
  function navigate(id){
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(id);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'msg', id: id }, '*');
    }
  }
`;

const buildOverviewHtml = (rivers: River[]) => {
  const dataJson = JSON.stringify(
    rivers.map((r) => ({
      id: r.id,
      name: r.name,
      state: r.state,
      cls: r.class_rating,
      type: r.type,
      plat: r.put_in.lat,
      plon: r.put_in.lon,
    }))
  );

  return `<!DOCTYPE html>
<html><head>${COMMON_HEAD}</head><body>
<div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
  ${NAV_JS}
  var rivers = ${dataJson};
  var map = L.map('m', { zoomControl:false, attributionControl:false, minZoom:3, maxZoom:13 })
    .setView([39.5, -98.35], 4);
  ${COMMON_TILES_JS}

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
    var m = L.marker([r.plat, r.plon], { icon: icon }).addTo(map);
    m.on('click', function(){ navigate('select:' + r.id); });
  });
})();
</script>
</body></html>`;
};

// SVG icon snippets — small, bundled inline for Leaflet divIcons
const SVG = {
  play: '<svg viewBox="0 0 24 24" fill="white"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
  flag:
    '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4"/><path d="M4 4h14l-2 4 2 4H4"/></svg>',
  wave:
    '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>',
  warning:
    '<svg viewBox="0 0 24 24" fill="white"><path d="M12 2L1 22h22L12 2zm0 6c.6 0 1 .4 1 1v6c0 .6-.4 1-1 1s-1-.4-1-1V9c0-.6.4-1 1-1zm0 11a1.2 1.2 0 110-2.4A1.2 1.2 0 0112 19z" fill="#D62828"/></svg>',
  steps:
    '<svg viewBox="0 0 24 24" fill="white"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="14" r="3"/><circle cx="9" cy="18" r="2"/></svg>',
};

const buildFocusedHtml = (river: River, pois: OsmPoi[]) => {
  // Heuristic: derive rapid intensity tier from the river's class_rating
  const cls = (river.class_rating || "").toUpperCase();
  const intensity = /V/.test(cls)
    ? "hard"
    : /IV/.test(cls)
    ? "hard"
    : /III/.test(cls)
    ? "mod"
    : "mild";

  const startLat = river.put_in.lat;
  const startLon = river.put_in.lon;
  const endLat = river.take_out.lat;
  const endLon = river.take_out.lon;

  const dataJson = JSON.stringify({
    putIn: { lat: startLat, lon: startLon, name: river.put_in.name },
    takeOut: { lat: endLat, lon: endLon, name: river.take_out.name },
    riverClass: river.class_rating || "",
    pois: pois.map((p) => ({
      name: p.name,
      kind: p.kind,
      cat: p.category,
      lat: p.lat,
      lon: p.lon,
      grade: p.grade || null,
    })),
    intensity,
  });

  // Inject SVGs as JS strings
  const svgJs = `var SVG = ${JSON.stringify(SVG)};`;

  return `<!DOCTYPE html>
<html><head>${COMMON_HEAD}</head><body>
<div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
  ${NAV_JS}
  ${svgJs}
  var data = ${dataJson};

  var map = L.map('m', { zoomControl:false, attributionControl:false, minZoom:5, maxZoom:15 });
  ${COMMON_TILES_JS}

  function pin(cls, svg){
    return L.divIcon({
      className: '',
      html: '<div class="pin ' + cls + '">' + svg + '</div>',
      iconSize: [28,28],
      iconAnchor: [14,14],
      popupAnchor: [0,-14]
    });
  }
  function tri(){
    return L.divIcon({
      className: '',
      html: '<div class="pin-tri"></div>',
      iconSize: [28,28],
      iconAnchor: [14,22],
      popupAnchor: [0,-20]
    });
  }
  function popup(title, meta){
    return '<div class="pop-title">' + title + '</div>' +
           (meta ? '<div class="pop-meta">' + meta + '</div>' : '');
  }
  function classLabel(grade){
    var g = (grade || data.riverClass || '').toString();
    return g ? 'Class ' + g : '';
  }

  // Put-in (start) — green play
  L.marker([data.putIn.lat, data.putIn.lon], { icon: pin('start', SVG.play), zIndexOffset: 1000 })
    .addTo(map)
    .bindPopup(popup('Put-in: ' + data.putIn.name, 'Start of run'));

  // Take-out (finish) — dark flag
  L.marker([data.takeOut.lat, data.takeOut.lon], { icon: pin('finish', SVG.flag), zIndexOffset: 1000 })
    .addTo(map)
    .bindPopup(popup('Take-out: ' + data.takeOut.name, 'End of run'));

  // POI markers
  var rapidClass = 'rapid-' + data.intensity; // mild | mod | hard
  data.pois.forEach(function(p){
    var marker;
    if (p.kind === 'waterfall'){
      marker = L.marker([p.lat, p.lon], { icon: tri() })
        .bindPopup(popup(p.name, 'Waterfall' + (p.grade ? ' · Class ' + p.grade : '')));
    } else if (p.kind === 'hazard'){
      marker = L.marker([p.lat, p.lon], { icon: tri() })
        .bindPopup(popup(p.name, p.cat));
    } else if (p.kind === 'portage'){
      marker = L.marker([p.lat, p.lon], { icon: pin('portage', SVG.steps) })
        .bindPopup(popup(p.name, 'Portage'));
    } else if (p.kind === 'play'){
      marker = L.marker([p.lat, p.lon], { icon: pin('play', SVG.wave) })
        .bindPopup(popup(p.name, 'Play spot' + (p.grade ? ' · Class ' + p.grade : '')));
    } else if (p.kind === 'putin' || p.kind === 'takeout'){
      // Skip OSM-tagged put-ins/take-outs (we already have curated ones)
      return;
    } else {
      // Default: rapid (color-coded by river's overall class)
      var grade = (p.grade || '').toUpperCase();
      var cls = rapidClass;
      if (/V/.test(grade) || /IV/.test(grade)) cls = 'rapid-hard';
      else if (/III/.test(grade)) cls = 'rapid-mod';
      else if (grade) cls = 'rapid-mild';
      // Title: prefer the OSM name; if it's just the generic "Rapids" (no real name),
      // show the river's class-based label instead
      var displayName = p.name;
      if (!displayName || /^rapids?$/i.test(displayName)){
        displayName = 'Unnamed rapid';
      }
      marker = L.marker([p.lat, p.lon], { icon: pin(cls, SVG.wave) })
        .bindPopup(popup(displayName, classLabel(p.grade)));
    }
    if (marker) marker.addTo(map);
  });

  // Fit bounds tightly around put-in, take-out, and all POIs
  var pts = [[data.putIn.lat, data.putIn.lon], [data.takeOut.lat, data.takeOut.lon]];
  data.pois.forEach(function(p){ pts.push([p.lat, p.lon]); });
  var b = L.latLngBounds(pts);
  map.fitBounds(b.pad(0.18), { animate: false });
})();
</script>
</body></html>`;
};

// ---------------- React component ----------------

export default function MapScreen() {
  const router = useRouter();
  const webRef = useRef<WebView>(null);
  const [rivers, setRivers] = useState<River[]>([]);
  const [loading, setLoading] = useState(true);
  const [legendOpen, setLegendOpen] = useState(true);

  // Focused-river state
  const [selectedRiverId, setSelectedRiverId] = useState<string | null>(null);
  const [focusedPois, setFocusedPois] = useState<OsmPoi[] | null>(null);
  const [focusLoading, setFocusLoading] = useState(false);

  const selectedRiver = useMemo(
    () => rivers.find((r) => r.id === selectedRiverId) || null,
    [rivers, selectedRiverId]
  );

  // Initial featured-river fetch
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

  // When a river is selected, fetch its OSM POIs
  useEffect(() => {
    if (!selectedRiverId) {
      setFocusedPois(null);
      return;
    }
    let cancelled = false;
    setFocusLoading(true);
    setFocusedPois(null);
    (async () => {
      try {
        const r = await fetch(`${API}/rivers/${selectedRiverId}/osm-poi`);
        const j = await r.json();
        if (!cancelled) setFocusedPois(j.pois || []);
      } catch {
        if (!cancelled) setFocusedPois([]);
      } finally {
        if (!cancelled) setFocusLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRiverId]);

  // Web: listen for postMessage from iframe
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handler = (e: MessageEvent) => {
      const data: any = e.data;
      if (data && data.type === "msg" && typeof data.id === "string") {
        handleMessage(data.id);
      }
    };
    // @ts-ignore
    window.addEventListener("message", handler);
    return () => {
      // @ts-ignore
      window.removeEventListener("message", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMessage = useCallback((msg: string) => {
    if (msg.startsWith("select:")) {
      setSelectedRiverId(msg.slice("select:".length));
    }
  }, []);

  const html = useMemo(() => {
    if (loading) return null;
    if (selectedRiver && focusedPois !== null) {
      return buildFocusedHtml(selectedRiver, focusedPois);
    }
    if (selectedRiver) {
      // Loading POIs — show focused map without POIs yet (just put-in/take-out + map zoom)
      return buildFocusedHtml(selectedRiver, []);
    }
    return rivers.length > 0 ? buildOverviewHtml(rivers) : null;
  }, [loading, rivers, selectedRiver, focusedPois]);

  const onMessageNative = useCallback(
    (data: string) => {
      handleMessage(data);
    },
    [handleMessage]
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="map-screen">
      <View style={styles.headerBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1} numberOfLines={1}>
            {selectedRiver ? selectedRiver.name : "Map"}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {selectedRiver
              ? `${selectedRiver.state} · Class ${selectedRiver.class_rating}`
              : "USA rivers · USGS hydrography"}
          </Text>
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
            onMessage={onMessageNative}
          />
        )}

        {selectedRiver && (
          <TouchableOpacity
            testID="map-back-btn"
            style={styles.backBtn}
            onPress={() => setSelectedRiverId(null)}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back" size={18} color="#fff" />
            <Text style={styles.backBtnText}>USA</Text>
          </TouchableOpacity>
        )}

        {selectedRiver && focusLoading && (
          <View style={styles.focusLoading}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.focusLoadingText}>Loading rapids…</Text>
          </View>
        )}

        {legendOpen && !selectedRiver && (
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
            <Text style={styles.legendHint}>Tap a marker → zoom in</Text>
          </View>
        )}

        {legendOpen && selectedRiver && (
          <View style={styles.legend} testID="map-legend-focused">
            <Text style={styles.legendTitle}>ON THIS RUN</Text>
            <LegendDot color={COLORS.safe} label="Put-in" />
            <LegendDot color={COLORS.textMain} label="Take-out" />
            <LegendDot
              color={
                /V|IV/.test(selectedRiver.class_rating.toUpperCase())
                  ? COLORS.danger
                  : /III/.test(selectedRiver.class_rating.toUpperCase())
                  ? COLORS.warning
                  : COLORS.info
              }
              label="Rapid"
            />
            <LegendDot color={COLORS.danger} label="Hazard / falls" />
            <LegendDot color={COLORS.warning} label="Portage" />
          </View>
        )}
      </View>

      {selectedRiver ? (
        <View style={styles.detailBar} testID="map-detail-bar">
          <View style={{ flex: 1 }}>
            <Text style={styles.detailLabel}>
              {focusedPois?.length || 0} feature{(focusedPois?.length || 0) === 1 ? "" : "s"} from
              OpenStreetMap
            </Text>
            <Text style={styles.detailSub} numberOfLines={1}>
              {selectedRiver.put_in.name} → {selectedRiver.take_out.name}
            </Text>
          </View>
          <TouchableOpacity
            testID="map-view-run-btn"
            style={styles.viewRunBtn}
            onPress={() => router.push(`/river/${selectedRiver.id}`)}
            activeOpacity={0.85}
          >
            <Text style={styles.viewRunBtnText}>VIEW RUN</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
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
      )}
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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
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
    gap: 10,
  },
  h1: { fontSize: 24, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
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
  backBtn: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(10,17,40,0.92)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    minHeight: 36,
  },
  backBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 1,
  },
  focusLoading: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(10,17,40,0.85)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  focusLoadingText: { color: "#fff", fontSize: 12, fontWeight: "700" },
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
  detailBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.textMain,
    letterSpacing: -0.2,
  },
  detailSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  viewRunBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    minHeight: 44,
  },
  viewRunBtnText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
});
