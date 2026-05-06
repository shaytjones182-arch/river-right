import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { WebView } from "react-native-webview";
import MapView from "../src/MapView";
import { COLORS } from "../src/theme";

type Pt = { lat: number; lon: number; t: number };

const haversineMiles = (a: Pt, b: Pt) => {
  const R = 3958.8;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180;
  const dl = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
};

const buildHtml = (lat: number, lon: number) => `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
html,body,#m{margin:0;padding:0;height:100%;width:100%;background:#E0E1DD;}
.me{background:#0077B6;border:3px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 0 0 6px rgba(0,119,182,0.25);}
</style></head>
<body>
<div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map = L.map('m', { zoomControl:false, attributionControl:false }).setView([${lat}, ${lon}], 14);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19 }).addTo(map);
L.control.zoom({ position:'topright' }).addTo(map);
var path = L.polyline([], { color:'#0077B6', weight:5, opacity:0.95 }).addTo(map);
var meIcon = L.divIcon({ className:'me', iconSize:[18,18] });
var meMarker = L.marker([${lat}, ${lon}], { icon: meIcon }).addTo(map);
window.updatePos = function(lat, lon, follow) {
  meMarker.setLatLng([lat, lon]);
  var ll = path.getLatLngs(); ll.push([lat, lon]); path.setLatLngs(ll);
  if (follow) map.panTo([lat, lon], { animate:true });
};
window.setPath = function(arr) {
  path.setLatLngs(arr);
  if (arr.length) { meMarker.setLatLng(arr[arr.length-1]); }
};
window.fitPath = function() {
  var ll = path.getLatLngs();
  if (ll.length > 1) map.fitBounds(path.getBounds().pad(0.2));
};
</script>
</body></html>`;

export default function Track() {
  const webRef = useRef<WebView>(null);
  const [permGranted, setPermGranted] = useState<boolean | null>(null);
  const [coord, setCoord] = useState<Pt | null>(null);
  const [tracking, setTracking] = useState(false);
  const [points, setPoints] = useState<Pt[]>([]);
  const [distMiles, setDistMiles] = useState(0);
  const [speedMph, setSpeedMph] = useState(0);
  const [maxMph, setMaxMph] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const ok = status === "granted";
      setPermGranted(ok);
      if (ok) {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setCoord({ lat: loc.coords.latitude, lon: loc.coords.longitude, t: Date.now() });
        } catch {
          // fallback to a default US river location (Lees Ferry)
          setCoord({ lat: 36.865, lon: -111.5883, t: Date.now() });
        }
      } else {
        setCoord({ lat: 36.865, lon: -111.5883, t: Date.now() });
      }
    })();
    return () => {
      if (subRef.current) subRef.current.remove();
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const sendJs = (js: string) => {
    if (webRef.current) {
      webRef.current.injectJavaScript(`${js}; true;`);
    }
  };

  const onLoc = (loc: Location.LocationObject) => {
    const p: Pt = { lat: loc.coords.latitude, lon: loc.coords.longitude, t: loc.timestamp };
    setCoord(p);
    setPoints((prev) => {
      let nextDist = distMiles;
      if (prev.length > 0) {
        nextDist = distMiles + haversineMiles(prev[prev.length - 1], p);
        setDistMiles(nextDist);
      }
      return [...prev, p];
    });
    // m/s -> mph
    const sps = loc.coords.speed && loc.coords.speed > 0 ? loc.coords.speed : 0;
    const mph = sps * 2.23694;
    setSpeedMph(mph);
    setMaxMph((m) => (mph > m ? mph : m));
    sendJs(`window.updatePos(${p.lat}, ${p.lon}, true)`);
  };

  const startTracking = async () => {
    if (!permGranted) {
      Alert.alert("Location required", "Please enable location to track your trip.");
      return;
    }
    setPoints([]);
    setDistMiles(0);
    setSpeedMph(0);
    setMaxMph(0);
    setElapsed(0);
    sendJs(`window.setPath([])`);
    const start = Date.now();
    setStartedAt(start);
    setTracking(true);
    tickRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    subRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 2000 },
      onLoc
    );
  };

  const stopTracking = () => {
    setTracking(false);
    if (subRef.current) {
      subRef.current.remove();
      subRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    sendJs(`window.fitPath()`);
  };

  const html = coord ? buildHtml(coord.lat, coord.lon) : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="track-screen">
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Trip Tracker</Text>
        <View
          testID="track-status-badge"
          style={[
            styles.statusDot,
            { backgroundColor: tracking ? COLORS.danger : COLORS.textMuted },
          ]}
        />
      </View>

      <View style={styles.mapWrap} testID="track-map">
        {html ? (
          <MapView webViewRef={webRef} html={html} style={styles.map} />
        ) : (
          <View style={[styles.map, { alignItems: "center", justifyContent: "center" }]}>
            <Text style={{ color: COLORS.textMuted }}>Locating…</Text>
          </View>
        )}
      </View>

      <View style={styles.panel}>
        <View style={styles.metricsRow}>
          <Metric testID="track-metric-speed" label="SPEED" value={speedMph.toFixed(1)} unit="MPH" />
          <Metric testID="track-metric-distance" label="DIST" value={distMiles.toFixed(2)} unit="MI" />
        </View>
        <View style={styles.metricsRow}>
          <Metric testID="track-metric-time" label="TIME" value={fmtTime(elapsed)} unit="" small />
          <Metric testID="track-metric-max" label="MAX" value={maxMph.toFixed(1)} unit="MPH" small />
        </View>

        {!tracking ? (
          <TouchableOpacity
            testID="track-start-btn"
            style={[styles.bigBtn, { backgroundColor: COLORS.primary }]}
            onPress={startTracking}
            activeOpacity={0.85}
          >
            <Ionicons name="play" size={22} color="#fff" />
            <Text style={styles.bigBtnText}>START TRIP</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            testID="track-stop-btn"
            style={[styles.bigBtn, { backgroundColor: COLORS.danger }]}
            onPress={stopTracking}
            activeOpacity={0.85}
          >
            <Ionicons name="stop" size={22} color="#fff" />
            <Text style={styles.bigBtnText}>STOP TRIP</Text>
          </TouchableOpacity>
        )}

        {permGranted === false && (
          <Text style={styles.permWarn} testID="track-permission-warning">
            Location permission denied. Showing demo location only.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

function Metric({
  label,
  value,
  unit,
  small,
  testID,
}: {
  label: string;
  value: string;
  unit: string;
  small?: boolean;
  testID?: string;
}) {
  return (
    <View style={styles.metric} testID={testID}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
        <Text style={[styles.metricValue, small && { fontSize: 26 }]}>{value}</Text>
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>
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
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  mapWrap: { flex: 1, marginHorizontal: 16, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.border },
  map: { flex: 1, ...(Platform.OS === "web" ? { minHeight: 240 } : {}) },
  panel: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 12,
    padding: 16,
    paddingTop: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricsRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  metric: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 2, color: COLORS.textMuted, marginBottom: 4 },
  metricValue: { fontSize: 34, fontWeight: "900", color: COLORS.textMain, letterSpacing: -1 },
  metricUnit: { fontSize: 12, fontWeight: "800", color: COLORS.textMuted, paddingBottom: 6, letterSpacing: 1 },
  bigBtn: {
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  bigBtnText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 2 },
  permWarn: {
    marginTop: 10,
    color: COLORS.warning,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
});
