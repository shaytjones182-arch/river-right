import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  Modal,
  FlatList,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { WebView } from "react-native-webview";
import MapView from "../src/MapView";
import { COLORS, API } from "../src/theme";
import ProfileMenu from "../src/ProfileMenu";
import {
  rollupTrip,
  saveTrip,
  TripDay,
  TripPoint,
  MOVING_MPH_THRESHOLD,
} from "../src/storage";

type Pt = { lat: number; lon: number; t: number };

type RiverShort = {
  id: string;
  name: string;
  state: string;
  class_rating: string;
  type: string;
  put_in: { name: string; lat: number; lon: number };
  take_out: { name: string; lat: number; lon: number };
};

type OsmPoi = {
  name: string;
  category: string;
  kind: string;
  lat: number;
  lon: number;
  grade?: string | null;
};

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

const SVG_TRACK = {
  play: '<svg viewBox="0 0 24 24" fill="white"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
  flag:
    '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4"/><path d="M4 4h14l-2 4 2 4H4"/></svg>',
  wave:
    '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>',
  steps:
    '<svg viewBox="0 0 24 24" fill="white"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="14" r="3"/><circle cx="9" cy="18" r="2"/></svg>',
  tent:
    '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M12 4L3 20"/><path d="M12 4l9 16"/><path d="M12 11l-3 9"/><path d="M12 11l3 9"/></svg>',
};

const buildHtml = (lat: number, lon: number) => `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
html,body,#m{margin:0;padding:0;height:100%;width:100%;background:#E0E1DD;}
.me{background:#0077B6;border:3px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 0 0 6px rgba(0,119,182,0.25);}
.pin{
  width:28px;height:28px;border-radius:50%;
  border:2px solid #fff; background:#0077B6;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 2px 6px rgba(0,0,0,0.35);
}
.pin svg{width:14px;height:14px;}
.pin.start{background:#2A9D8F;}
.pin.finish{background:#0A1128;}
.pin.rapid-mild{background:#457B9D;}
.pin.rapid-mod{background:#F4A261;}
.pin.rapid-hard{background:#D62828;}
.pin.portage{background:#F4A261;}
.pin.play{background:#2A9D8F;}
.pin.camp{background:#8B5E34;}
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
</style></head>
<body>
<div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
  var SVG = ${JSON.stringify(SVG_TRACK)};
  var map = L.map('m', { zoomControl:false, attributionControl:false, maxZoom:16 }).setView([${lat}, ${lon}], 14);
  var usgsTopo = L.tileLayer(
    'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 16 }
  );
  var osmFallback = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 16 });
  usgsTopo.on('tileerror', function(){
    if (!map.hasLayer(osmFallback)) osmFallback.addTo(map);
  });
  usgsTopo.addTo(map);
  L.control.zoom({ position:'topright' }).addTo(map);

  var path = L.polyline([], { color:'#0077B6', weight:5, opacity:0.95 }).addTo(map);
  var meIcon = L.divIcon({ className:'me', iconSize:[18,18] });
  var meMarker = L.marker([${lat}, ${lon}], { icon: meIcon, zIndexOffset: 2000 }).addTo(map);
  var poiLayer = L.layerGroup().addTo(map);

  function pin(cls, svg){
    return L.divIcon({
      className:'',
      html:'<div class="pin '+cls+'">'+svg+'</div>',
      iconSize:[28,28], iconAnchor:[14,14], popupAnchor:[0,-14]
    });
  }
  function tri(){
    return L.divIcon({
      className:'',
      html:'<div class="pin-tri"></div>',
      iconSize:[28,28], iconAnchor:[14,22], popupAnchor:[0,-20]
    });
  }
  function popupHtml(title, meta){
    return '<div class="pop-title">'+title+'</div>' + (meta ? '<div class="pop-meta">'+meta+'</div>' : '');
  }
  function intensityFromClass(cls){
    var c = (cls||'').toUpperCase();
    if (/V/.test(c) || /IV/.test(c)) return 'hard';
    if (/III/.test(c)) return 'mod';
    return 'mild';
  }

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
  window.setRunPois = function(payload){
    poiLayer.clearLayers();
    if (!payload) return;
    var river = payload.river;
    var pois = payload.pois || [];
    var rapidIntensity = intensityFromClass(river && river.class_rating);
    var rapidClass = 'rapid-' + rapidIntensity;
    var pts = [];

    if (river){
      L.marker([river.put_in_lat, river.put_in_lon], { icon: pin('start', SVG.play), zIndexOffset: 1000 })
        .addTo(poiLayer)
        .bindPopup(popupHtml('Put-in: ' + river.put_in_name, 'Start of run'));
      L.marker([river.take_out_lat, river.take_out_lon], { icon: pin('finish', SVG.flag), zIndexOffset: 1000 })
        .addTo(poiLayer)
        .bindPopup(popupHtml('Take-out: ' + river.take_out_name, 'End of run'));
      pts.push([river.put_in_lat, river.put_in_lon]);
      pts.push([river.take_out_lat, river.take_out_lon]);
    }

    pois.forEach(function(p){
      pts.push([p.lat, p.lon]);
      var marker;
      if (p.kind === 'waterfall'){
        marker = L.marker([p.lat, p.lon], { icon: tri() })
          .bindPopup(popupHtml(p.name, 'Waterfall' + (p.grade ? ' · Class ' + p.grade : '')));
      } else if (p.kind === 'hazard'){
        marker = L.marker([p.lat, p.lon], { icon: tri() })
          .bindPopup(popupHtml(p.name, p.cat));
      } else if (p.kind === 'portage'){
        marker = L.marker([p.lat, p.lon], { icon: pin('portage', SVG.steps) })
          .bindPopup(popupHtml(p.name, 'Portage'));
      } else if (p.kind === 'play'){
        marker = L.marker([p.lat, p.lon], { icon: pin('play', SVG.wave) })
          .bindPopup(popupHtml(p.name, 'Play spot'));
      } else if (p.kind === 'camp'){
        marker = L.marker([p.lat, p.lon], { icon: pin('camp', SVG.tent) })
          .bindPopup(popupHtml(p.name || 'Campground', 'Campground'));
      } else if (p.kind === 'putin' || p.kind === 'takeout'){
        return;
      } else {
        var grade = (p.grade || '').toUpperCase();
        var cls = rapidClass;
        if (/V/.test(grade) || /IV/.test(grade)) cls = 'rapid-hard';
        else if (/III/.test(grade)) cls = 'rapid-mod';
        else if (grade) cls = 'rapid-mild';
        var name = p.name;
        if (!name || /^rapids?$/i.test(name)) name = 'Unnamed rapid';
        var classLabel = (p.grade || (river && river.class_rating) || '');
        marker = L.marker([p.lat, p.lon], { icon: pin(cls, SVG.wave) })
          .bindPopup(popupHtml(name, classLabel ? 'Class ' + classLabel : ''));
      }
      if (marker) marker.addTo(poiLayer);
    });

    if (pts.length){
      var b = L.latLngBounds(pts).pad(0.2);
      map.flyToBounds(b, { duration: 1.2, easeLinearity: 0.3 });
    }
  };
  window.clearRunPois = function(){
    poiLayer.clearLayers();
  };
})();
</script>
</body></html>`;

export default function Track() {
  const webRef = useRef<WebView>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [permGranted, setPermGranted] = useState<boolean | null>(null);
  const [coord, setCoord] = useState<Pt | null>(null);

  // ─── Trip state machine ──────────────────────────────────────────────────
  //  idle      → no trip in progress
  //  tracking  → recording GPS
  //  paused    → trip in progress but recording stopped; can resume, log a day, or end
  type TripState = "idle" | "tracking" | "paused";
  const [tripState, setTripState] = useState<TripState>("idle");
  // Days the user has already logged in this trip (via "Log Day N")
  const [loggedDays, setLoggedDays] = useState<TripDay[]>([]);
  // Trip's first-day start timestamp (used as the trip id seed)
  const tripStartedAtRef = useRef<number | null>(null);
  const tripRiverRef = useRef<{ id: string | null; name: string | null }>({ id: null, name: null });

  // ─── Live (current-day) accumulators ─────────────────────────────────────
  const [distMiles, setDistMiles] = useState(0);
  const [speedMph, setSpeedMph] = useState(0);
  const [maxMph, setMaxMph] = useState(0);
  const [totalSec, setTotalSec] = useState(0); // elapsed seconds for current day (excludes paused time)
  const [movingSec, setMovingSec] = useState(0); // seconds with speed >= MOVING_MPH_THRESHOLD
  const [points, setPoints] = useState<TripPoint[]>([]);
  // Refs used inside callbacks/intervals so we always read the latest values
  const speedRef = useRef(0);
  const dayStartedAtRef = useRef<number | null>(null);

  // Run picker / POI state
  const [rivers, setRivers] = useState<RiverShort[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [selectedRiverId, setSelectedRiverId] = useState<string | null>(null);
  const [poiCount, setPoiCount] = useState(0);

  const subRef = useRef<Location.LocationSubscription | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Bootstrap location & rivers list
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const ok = status === "granted";
      setPermGranted(ok);
      if (ok) {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setCoord({ lat: loc.coords.latitude, lon: loc.coords.longitude, t: Date.now() });
        } catch {
          setCoord({ lat: 36.865, lon: -111.5883, t: Date.now() });
        }
      } else {
        setCoord({ lat: 36.865, lon: -111.5883, t: Date.now() });
      }
    })();
    (async () => {
      try {
        const r = await fetch(`${API}/rivers/featured`);
        const j = await r.json();
        setRivers(j.rivers || []);
      } catch (e) {
        console.warn("track rivers", e);
      }
    })();
    return () => {
      if (subRef.current) {
        try { subRef.current.remove(); } catch {}
      }
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const selectedRiver = useMemo(
    () => rivers.find((r) => r.id === selectedRiverId) || null,
    [rivers, selectedRiverId]
  );

  // Helper to inject JS into the map (works on both native WebView and web iframe)
  const sendJs = useCallback((js: string) => {
    if (Platform.OS === "web") {
      if (iframeRef.current?.contentWindow) {
        // We avoid postMessage here — track HTML uses direct window funcs
        try {
          // @ts-ignore - cross-frame eval is OK in same-origin srcdoc
          (iframeRef.current.contentWindow as any).eval(js);
        } catch (e) {
          // ignore
        }
      }
    } else if (webRef.current) {
      webRef.current.injectJavaScript(`${js}; true;`);
    }
  }, []);

  // When a run is picked, fetch its POIs and inject into map
  useEffect(() => {
    if (!selectedRiver) {
      setPoiCount(0);
      sendJs("if (window.clearRunPois) window.clearRunPois();");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/rivers/${selectedRiver.id}/osm-poi`);
        const j = await r.json();
        if (cancelled) return;
        const pois: OsmPoi[] = j.pois || [];
        setPoiCount(pois.length);
        const payload = {
          river: {
            class_rating: selectedRiver.class_rating,
            put_in_lat: selectedRiver.put_in.lat,
            put_in_lon: selectedRiver.put_in.lon,
            put_in_name: selectedRiver.put_in.name,
            take_out_lat: selectedRiver.take_out.lat,
            take_out_lon: selectedRiver.take_out.lon,
            take_out_name: selectedRiver.take_out.name,
          },
          pois,
        };
        sendJs(`if (window.setRunPois) window.setRunPois(${JSON.stringify(payload)});`);
      } catch {
        if (!cancelled) setPoiCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRiver, sendJs]);

  const onLoc = (loc: Location.LocationObject) => {
    const speed = loc.coords.speed && loc.coords.speed > 0 ? loc.coords.speed * 2.23694 : 0;
    const p: TripPoint = {
      lat: loc.coords.latitude,
      lon: loc.coords.longitude,
      t: loc.timestamp,
      speed,
    };
    setCoord({ lat: p.lat, lon: p.lon, t: p.t });
    speedRef.current = speed;
    setSpeedMph(speed);
    setMaxMph((m) => (speed > m ? speed : m));
    setPoints((prev) => {
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        const delta = haversineMiles(last, p);
        // Drop micro-noise spikes (< ~3 meters)
        if (delta > 0.002) {
          setDistMiles((d) => d + delta);
        }
      }
      return [...prev, p];
    });
    sendJs(`window.updatePos(${p.lat}, ${p.lon}, true)`);
  };

  // Reset all per-day counters to start a fresh day
  const resetDayCounters = () => {
    setPoints([]);
    setDistMiles(0);
    setSpeedMph(0);
    setMaxMph(0);
    setTotalSec(0);
    setMovingSec(0);
    speedRef.current = 0;
    sendJs(`window.setPath([])`);
  };

  // Begin (or resume) recording GPS + 1-second tick.
  const beginRecording = async () => {
    if (!permGranted) {
      Alert.alert("Location required", "Please enable location to track your trip.");
      return false;
    }
    // 1-second tick: advances elapsed time + moving time (when speed >= threshold)
    if (!tickRef.current) {
      tickRef.current = setInterval(() => {
        setTotalSec((s) => s + 1);
        if (speedRef.current >= MOVING_MPH_THRESHOLD) {
          setMovingSec((s) => s + 1);
        }
      }, 1000);
    }
    if (!subRef.current) {
      subRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 2000 },
        onLoc
      );
    }
    return true;
  };

  // Stop recording (does not finalize the day)
  const stopRecording = () => {
    const sub = subRef.current;
    subRef.current = null; // clear ref first so any in-flight callbacks bail
    if (sub) {
      // On web, expo-location's subscription.remove() throws (its event emitter
      // shim is incomplete). Guard with both try/catch AND a platform check.
      if (Platform.OS !== "web") {
        try {
          sub.remove();
        } catch (e) {
          console.warn("location subscription remove failed", e);
        }
      }
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setSpeedMph(0);
    speedRef.current = 0;
  };

  // Build a TripDay snapshot from current accumulators
  const snapshotCurrentDay = (): TripDay => {
    const dayNumber = loggedDays.length + 1;
    const startedAt = dayStartedAtRef.current || Date.now();
    const avg = movingSec > 0 ? distMiles / (movingSec / 3600) : 0;
    return {
      dayNumber,
      startedAt,
      endedAt: Date.now(),
      points,
      distMiles,
      movingSec,
      totalSec,
      maxMph,
      avgMph: avg,
    };
  };

  // ─── Button handlers ─────────────────────────────────────────────────────

  const handleStartTrip = async () => {
    // Fresh trip OR starting next day after a prior "Log day" pause
    const ok = await beginRecording();
    if (!ok) return;
    if (loggedDays.length === 0) {
      tripStartedAtRef.current = Date.now();
      tripRiverRef.current = {
        id: selectedRiver?.id || null,
        name: selectedRiver?.name || null,
      };
    }
    resetDayCounters();
    dayStartedAtRef.current = Date.now();
    setTripState("tracking");
  };

  const handlePause = () => {
    stopRecording();
    setTripState("paused");
    sendJs(`window.fitPath && window.fitPath()`);
  };

  const handleResume = async () => {
    const ok = await beginRecording();
    if (!ok) return;
    setTripState("tracking");
  };

  const handleLogDay = () => {
    const day = snapshotCurrentDay();
    setLoggedDays((prev) => [...prev, day]);
    // Stay in 'idle' so the START TRIP button is shown again for the next day
    setTripState("idle");
    resetDayCounters();
    dayStartedAtRef.current = null;
  };

  const handleEndTrip = async () => {
    // Decide whether the current day has any progress worth saving
    const hasActiveDay = dayStartedAtRef.current !== null && (points.length > 1 || totalSec > 5);
    const allDays = [...loggedDays];
    if (hasActiveDay) {
      allDays.push(snapshotCurrentDay());
    }
    if (allDays.length === 0) {
      // Nothing to save → just reset back to idle
      setTripState("idle");
      return;
    }
    const trip = rollupTrip(
      allDays,
      tripRiverRef.current.id,
      tripRiverRef.current.name,
      `trip_${tripStartedAtRef.current || Date.now()}`,
      tripStartedAtRef.current || Date.now()
    );
    try {
      await saveTrip(trip);
    } catch (e) {
      console.warn("save trip failed", e);
    }
    // Hard reset all trip state
    setLoggedDays([]);
    tripStartedAtRef.current = null;
    dayStartedAtRef.current = null;
    tripRiverRef.current = { id: null, name: null };
    setTripState("idle");
    resetDayCounters();
    Alert.alert(
      "Trip saved",
      `${allDays.length} day${allDays.length === 1 ? "" : "s"} · ${trip.totalDistMiles.toFixed(2)} mi total. View it from the profile menu.`
    );
  };

  // Live avg speed (over moving time only — AllTrails-style)
  const liveAvgMph = useMemo(
    () => (movingSec > 0 ? distMiles / (movingSec / 3600) : 0),
    [distMiles, movingSec]
  );

  const html = useMemo(() => (coord ? buildHtml(coord.lat, coord.lon) : null), [coord]);

  const visiblePickerRivers = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return rivers;
    return rivers.filter((r) => r.name.toLowerCase().includes(q));
  }, [rivers, pickerQuery]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="track-screen">
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Trip Tracker</Text>
        <ProfileMenu testID="track-profile-btn" />
      </View>

      <View style={styles.runRow}>
        <TouchableOpacity
          testID="track-pick-run-btn"
          style={styles.runPicker}
          onPress={() => setPickerOpen(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.runPickerText} numberOfLines={1}>
            {selectedRiver
              ? `${selectedRiver.name}`
              : "Select run for icons"}
          </Text>
          <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
        {selectedRiver && (
          <TouchableOpacity
            testID="track-clear-run-btn"
            style={styles.runClear}
            onPress={() => setSelectedRiverId(null)}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {selectedRiver && poiCount > 0 && (
        <Text style={styles.runHint}>
          {poiCount} POI{poiCount === 1 ? "" : "s"} loaded · tap any icon for details
        </Text>
      )}

      <View style={styles.mapWrap} testID="track-map">
        {html ? (
          <MapView webViewRef={webRef} iframeRef={iframeRef} html={html} style={styles.map} />
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
          <Metric testID="track-metric-avg" label="AVG" value={liveAvgMph.toFixed(1)} unit="MPH" small />
          <Metric testID="track-metric-max" label="MAX" value={maxMph.toFixed(1)} unit="MPH" small />
        </View>
        <View style={styles.metricsRow}>
          <Metric testID="track-metric-moving" label="MOVING" value={fmtTime(movingSec)} unit="" small />
          <Metric testID="track-metric-time" label="TIME" value={fmtTime(totalSec)} unit="" small />
        </View>

        {tripState === "idle" && (
          <TouchableOpacity
            testID="track-start-btn"
            style={[styles.bigBtn, { backgroundColor: COLORS.primary }]}
            onPress={handleStartTrip}
            activeOpacity={0.85}
          >
            <Ionicons name="play" size={22} color="#fff" />
            <Text style={styles.bigBtnText}>
              {loggedDays.length > 0 ? `START DAY ${loggedDays.length + 1}` : "START TRIP"}
            </Text>
          </TouchableOpacity>
        )}

        {tripState === "tracking" && (
          <TouchableOpacity
            testID="track-pause-btn"
            style={[styles.bigBtn, { backgroundColor: COLORS.warning }]}
            onPress={handlePause}
            activeOpacity={0.85}
          >
            <Ionicons name="pause" size={22} color="#fff" />
            <Text style={styles.bigBtnText}>PAUSE TRIP</Text>
          </TouchableOpacity>
        )}

        {tripState === "paused" && (
          <View style={styles.threeBtnRow}>
            <TouchableOpacity
              testID="track-resume-btn"
              style={[styles.thirdBtn, { backgroundColor: COLORS.primary }]}
              onPress={handleResume}
              activeOpacity={0.85}
            >
              <Ionicons name="play" size={18} color="#fff" />
              <Text style={styles.thirdBtnText}>RESUME</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="track-log-day-btn"
              style={[styles.thirdBtn, { backgroundColor: COLORS.safe }]}
              onPress={handleLogDay}
              activeOpacity={0.85}
            >
              <Ionicons name="bookmark" size={18} color="#fff" />
              <Text style={styles.thirdBtnText}>LOG DAY {loggedDays.length + 1}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="track-end-btn"
              style={[styles.thirdBtn, { backgroundColor: COLORS.danger }]}
              onPress={handleEndTrip}
              activeOpacity={0.85}
            >
              <Ionicons name="stop" size={18} color="#fff" />
              <Text style={styles.thirdBtnText}>END TRIP</Text>
            </TouchableOpacity>
          </View>
        )}

        {loggedDays.length > 0 && tripState === "idle" && (
          <Text style={styles.loggedDaysHint}>
            {loggedDays.length} day{loggedDays.length === 1 ? "" : "s"} logged on this trip
          </Text>
        )}

        {permGranted === false && (
          <Text style={styles.permWarn} testID="track-permission-warning">
            Location permission denied. Showing demo location only.
          </Text>
        )}
      </View>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
        transparent={false}
      >
        <PickerModalBody
          query={pickerQuery}
          setQuery={setPickerQuery}
          rivers={visiblePickerRivers}
          selectedId={selectedRiverId}
          onPick={(id) => {
            setSelectedRiverId(id);
            setPickerOpen(false);
            setPickerQuery("");
          }}
          onClose={() => setPickerOpen(false)}
        />
      </Modal>
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

// Picker modal body — extracted so we can apply explicit safe-area top padding
// (some iOS dynamic-island devices clip the modal header otherwise).
function PickerModalBody({
  query,
  setQuery,
  rivers,
  selectedId,
  onPick,
  onClose,
}: {
  query: string;
  setQuery: (q: string) => void;
  rivers: RiverShort[];
  selectedId: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Pick a run</Text>
          <TouchableOpacity
            onPress={onClose}
            testID="track-picker-close"
            hitSlop={10}
            style={styles.modalClose}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={24} color={COLORS.textMain} />
          </TouchableOpacity>
        </View>
        <View style={styles.modalSearchWrap}>
          <Ionicons
            name="search"
            size={18}
            color={COLORS.textMuted}
            style={{ marginRight: 8 }}
          />
          <TextInput
            testID="track-picker-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Search rivers…"
            placeholderTextColor={COLORS.textMuted}
            style={styles.modalSearchInput}
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={10} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <FlatList
          data={rivers}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const active = item.id === selectedId;
            const dotColor =
              item.type === "whitewater"
                ? COLORS.danger
                : item.type === "calm"
                ? COLORS.safe
                : COLORS.warning;
            return (
              <TouchableOpacity
                testID={`track-picker-row-${item.id}`}
                style={[styles.row, active && styles.rowActive]}
                onPress={() => onPick(item.id)}
                activeOpacity={0.85}
              >
                <View style={[styles.rowDot, { backgroundColor: dotColor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {item.state} · Class {item.class_rating}
                  </Text>
                </View>
                {active && (
                  <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 36 }}>
              <Text style={{ color: COLORS.textMuted }}>No rivers match.</Text>
            </View>
          }
        />
      </KeyboardAvoidingView>
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

  threeBtnRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  thirdBtn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    gap: 4,
  },
  thirdBtnText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    textAlign: "center",
  },
  loggedDaysHint: {
    marginTop: 12,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    textAlign: "center",
  },

  runRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  runPicker: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 42,
  },
  runPickerText: { flex: 1, color: COLORS.textMain, fontWeight: "700", fontSize: 14 },
  runClear: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.textMain,
    alignItems: "center",
    justifyContent: "center",
  },
  runHint: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  mapWrap: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.border,
  },
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
  metricLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  metricValue: { fontSize: 34, fontWeight: "900", color: COLORS.textMain, letterSpacing: -1 },
  metricUnit: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.textMuted,
    paddingBottom: 6,
    letterSpacing: 1,
  },
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

  // Picker modal
  modalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 22, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
  modalClose: { padding: 4 },
  modalSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    marginHorizontal: 16,
    marginVertical: 12,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textMain,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        // @ts-ignore
        outlineWidth: 0,
      },
    }),
  },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowActive: { backgroundColor: COLORS.background },
  rowDot: { width: 10, height: 10, borderRadius: 5 },
  rowName: { fontSize: 15, fontWeight: "800", color: COLORS.textMain },
  rowMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  sep: { height: 1, backgroundColor: COLORS.border, marginLeft: 42 },
});
