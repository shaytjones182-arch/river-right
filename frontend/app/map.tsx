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
import { useRouter, useLocalSearchParams } from "expo-router";
import MapView from "../src/MapView";
import ProfileMenu from "../src/ProfileMenu";
import Svg, { Path, Polygon, Circle, Polyline as SvgPolyline } from "react-native-svg";
import { COLORS, API } from "../src/theme";
import {
  fetchPolylineWithCache,
  fetchPoisWithCache,
  fetchFeaturedWithCache,
} from "../src/offlineCache";
import {
  getMergedOfflineManifest,
} from "../src/tiles/tileDownloader";
import {
  getMapView,
  setMapView,
  getMapSelectedRiverId,
  setMapSelectedRiverId,
} from "../src/tabState";

type RiverType = "whitewater" | "mixed" | "calm";

type River = {
  id: string;
  name: string;
  state: string;
  class_rating: string;
  type: RiverType | string;
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
  description?: string | null;
  source?: string;
};

type Polyline = {
  coordinates: number[][][]; // MultiLineString [seg][pt][lon,lat]
  length_mi?: number;
};

type FilterKey = "all" | "whitewater" | "mixed" | "calm";

// ---------------- HTML (single, persistent) ----------------

const SVG_ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="white"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
  flag:
    '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4"/><path d="M4 4h14l-2 4 2 4H4"/></svg>',
  wave:
    '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>',
  steps:
    '<svg viewBox="0 0 24 24" fill="white"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="14" r="3"/><circle cx="9" cy="18" r="2"/></svg>',
  tent:
    '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M12 4L3 20"/><path d="M12 4l9 16"/><path d="M12 11l-3 9"/><path d="M12 11l3 9"/></svg>',
  boat:
    '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/><path d="M5 13l1-4h12l1 4"/><path d="M12 9V4"/></svg>',
  info:
    '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v.01"/><path d="M11 12h1v4h1"/></svg>',
  parking:
    '<svg viewBox="0 0 24 24"><text x="12" y="18" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Arial,sans-serif" font-size="18" font-weight="900" fill="white">P</text></svg>',
};

const buildMapHtml = (
  initialView?: { lat: number; lng: number; zoom: number } | null,
  offlineTiles?: { tileToUrl: Record<string, string> } | null
) => `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="initial-scale=1.0,maximum-scale=1.0,user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html,body,#m{margin:0;padding:0;height:100%;width:100%;background:#dfeef7;}
  .pulse{
    width:14px;height:14px;border-radius:50%;
    border:2px solid #fff;
    box-shadow:0 0 0 4px rgba(255,255,255,0.55), 0 1px 4px rgba(0,0,0,0.4);
    cursor:pointer;
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
  .pin.rapid-mild{background:#F4A261;}
  .pin.rapid-mod{background:#F4A261;}
  .pin.rapid-hard{background:#F4A261;}
  .pin.hazard{background:#D62828;}
  .pin.portage{background:#F4A261;}
  .pin.play{background:#2A9D8F;}
  .pin.camp{background:#8B5E34;}
  .pin.boat{background:#1D4E89;}
  .pin.access{background:#1D4E89;}
  .pin.parking{background:#4F5D75;}
  .pin.note{background:#6C757D;}
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
  /* Tile-unavailable banner — appears when USGS Topo tiles repeatedly fail. */
  .tile-banner{
    position:absolute;top:10px;left:50%;transform:translate(-50%,-150%);
    z-index:1000;pointer-events:none;
    background:#0A1128;color:#fff;
    padding:8px 14px;border-radius:999px;
    font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
    font-size:12px;font-weight:700;letter-spacing:0.2px;
    box-shadow:0 4px 14px rgba(0,0,0,0.35);
    display:flex;align-items:center;gap:8px;
    max-width:88%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    opacity:0;
    transition:transform 220ms ease-out, opacity 220ms ease-out;
  }
  .tile-banner.show{transform:translate(-50%,0);opacity:1;}
  .tile-banner svg{width:14px;height:14px;flex-shrink:0;}
</style>
</head><body>
<div id="m"></div>
<div id="tile-banner" class="tile-banner" role="status" aria-live="polite">
  <svg viewBox="0 0 24 24" fill="none" stroke="#F4A261" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5"/><path d="M12 18v.01"/></svg>
  <span>Map tiles unavailable — check your connection.</span>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
  var SVG = ${JSON.stringify(SVG_ICONS)};

  function send(id){
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(id);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'msg', id: id }, '*');
    }
  }

  // Lower 48 bounds — fits the map regardless of screen aspect
  var LOWER_48_BOUNDS = L.latLngBounds([24.5, -125], [49.5, -66]);

  var map = L.map('m', { zoomControl:false, attributionControl:false, minZoom:3, maxZoom:16 });
  var INITIAL_VIEW = ${initialView ? JSON.stringify(initialView) : "null"};
  if (INITIAL_VIEW) {
    map.setView([INITIAL_VIEW.lat, INITIAL_VIEW.lng], INITIAL_VIEW.zoom);
  } else {
    map.fitBounds(LOWER_48_BOUNDS, { animate: false, padding: [10, 10] });
  }

  // Emit view changes so RN can persist them across tab switches.
  // Debounced via Leaflet's own moveend (fires once at end of pan/zoom).
  function sendView(){
    var c = map.getCenter();
    var z = map.getZoom();
    send("view:" + c.lat.toFixed(6) + "," + c.lng.toFixed(6) + "," + z);
  }
  map.on('moveend', sendView);
  map.on('zoomend', sendView);

  // USGS Topo basemap — free, U.S. public-domain, hydrography baked in.
  // No fallback tile provider: OSM's tile servers explicitly disallow app use,
  // and we don't want a paid dependency. If USGS Topo ever fails, the user
  // sees grey tiles; map data (polyline + POIs) still renders on top.
  var usgsTopo = L.tileLayer(
    'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 16 }
  );
  // 1x1 transparent PNG used when the user pans/zooms outside the
  // downloaded offline coverage while offline. Loads as a clean tile (no
  // tileerror fired) so we can surface a debounced "outside coverage"
  // banner instead of Leaflet's default broken-image placeholder.
  var BLANK_TILE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

  // ── Offline-tile support (variable-depth pyramid aware) ──
  // The offline pack is intentionally LOPSIDED: full coverage at the
  // coarse z=10 level, narrowing down to just the river corridor at
  // z=16 (see tileMath.ts for the buffer math). That means at almost
  // every zoom level there will be edge tiles in the viewport that the
  // user never downloaded. The two-tier strategy below handles those
  // gaps without ever painting a broken-image square or tripping the
  // global "check your connection" banner.
  var OFFLINE_TILES = ${offlineTiles ? JSON.stringify(offlineTiles.tileToUrl) : "null"};
  var HAVE_OFFLINE = OFFLINE_TILES && Object.keys(OFFLINE_TILES).length > 0;
  if (HAVE_OFFLINE) {
    var OfflineFirstLayer = L.TileLayer.extend({
      getTileUrl: function(coords) {
        var key = coords.z + "/" + coords.x + "/" + coords.y;
        // 1. Cached tile? Serve straight from disk.
        if (OFFLINE_TILES[key]) return OFFLINE_TILES[key];
        // 2. Cache miss → ALWAYS attempt the live USGS tile. We don't
        //    consult navigator.onLine because iOS WKWebView reports it
        //    unreliably (returns false for file:// origins regardless
        //    of actual connectivity, and returns true in airplane mode
        //    with html-only sources). If we're genuinely offline the
        //    HTTPS request will fail and the errorTileUrl: BLANK_TILE
        //    setting will paint a transparent square — the same visual
        //    we'd get from returning BLANK_TILE directly, but with the
        //    bonus that online users actually see live tiles.
        return 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/'
          + coords.z + "/" + coords.y + "/" + coords.x;
      }
    });
    usgsTopo = new OfflineFirstLayer('', {
      maxZoom: 16,
      // Paint a transparent 1x1 placeholder for any tile load that
      // fails (HTTPS 4xx/5xx, DNS error, etc.) instead of the broken
      // image glyph and instead of escalating through tileerror to
      // our global banner. Combined with the variable-depth offline
      // pyramid, the user sees clean empty space at edges rather
      // than a noisy alert.
      errorTileUrl: BLANK_TILE,
      // Don't aggressively keep tiles outside the current zoom level
      // — frees memory and avoids prefetching tiles we know are
      // outside the corridor at deep zooms.
      updateWhenIdle: true,
      keepBuffer: 1,
    });
  } else {
    usgsTopo = L.tileLayer(
      'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 16, errorTileUrl: BLANK_TILE }
    );
  }
  usgsTopo.addTo(map);

  // Banner suppression: when the user has any offline coverage, we
  // never show the "check your connection" or "left the corridor"
  // banners — the user explicitly downloaded tiles for a reason and
  // any cache-miss tiles already paint a clean transparent square
  // via errorTileUrl. The banner only ever trips for users with NO
  // offline cache who have lost their network connection.
  var __tileErrCount = 0;
  var __tileBanner = document.getElementById('tile-banner');
  usgsTopo.on('tileerror', function(){
    if (HAVE_OFFLINE) return;
    __tileErrCount++;
    if (__tileErrCount < 12 || !__tileBanner) return;
    var span = __tileBanner.querySelector('span');
    if (!span) return;
    span.textContent = 'Map tiles unavailable — check your connection.';
    __tileBanner.classList.add('show');
  });
  usgsTopo.on('tileload', function(){
    if (__tileErrCount > 0) __tileErrCount = Math.max(0, __tileErrCount - 1);
  });
  usgsTopo.on('tileload', function(){
    if (__tileErrCount > 0) {
      __tileErrCount = 0;
      if (__tileBanner) __tileBanner.classList.remove('show');
    }
  });
  L.control.zoom({ position:'topright' }).addTo(map);

  var overviewLayer = L.layerGroup().addTo(map);
  var focusedLayer = L.layerGroup().addTo(map);
  var polylineLayer = L.layerGroup().addTo(map);
  var currentMode = null;

  function colorFor(t){
    if (t === 'whitewater') return '#D62828';
    if (t === 'calm') return '#2A9D8F';
    return '#F4A261';
  }

  function pin(cls, svg){
    return L.divIcon({
      className: '',
      html: '<div class="pin ' + cls + '">' + svg + '</div>',
      iconSize: [28,28], iconAnchor: [14,14], popupAnchor: [0,-14]
    });
  }
  function tri(){
    return L.divIcon({
      className: '',
      html: '<div class="pin-tri"></div>',
      iconSize: [28,28], iconAnchor: [14,22], popupAnchor: [0,-20]
    });
  }
  function popupHtml(title, meta){
    return '<div class="pop-title">' + title + '</div>' +
           (meta ? '<div class="pop-meta">' + meta + '</div>' : '');
  }

  function renderOverview(rivers){
    overviewLayer.clearLayers();
    focusedLayer.clearLayers();
    polylineLayer.clearLayers();
    rivers.forEach(function(r){
      var color = colorFor(r.type);
      var icon = L.divIcon({
        className: '',
        html: '<div class="pulse" style="background:' + color + '"></div>',
        iconSize: [14,14], iconAnchor: [7,7]
      });
      var m = L.marker([r.plat, r.plon], { icon: icon }).addTo(overviewLayer);
      m.on('click', function(){ send('select:' + r.id); });
    });
  }

  function flyToOverview(animate){
    if (animate){
      map.flyToBounds(LOWER_48_BOUNDS, { duration: 1.0, easeLinearity: 0.25, padding: [10, 10] });
    } else {
      map.fitBounds(LOWER_48_BOUNDS, { animate: false, padding: [10, 10] });
    }
  }

  function renderFocused(river, pois, polyline){
    overviewLayer.clearLayers();
    focusedLayer.clearLayers();
    polylineLayer.clearLayers();

    // Draw the river polyline (curated GeoJSON MultiLineString) — under markers
    if (polyline && polyline.coordinates && polyline.coordinates.length){
      polyline.coordinates.forEach(function(seg){
        var latlngs = seg.map(function(pt){ return [pt[1], pt[0]]; });
        // Outline (halo) for legibility on busy basemap
        L.polyline(latlngs, {
          color: '#FFFFFF', weight: 7, opacity: 0.9, lineCap: 'round', lineJoin: 'round'
        }).addTo(polylineLayer);
        // Main blue river line
        L.polyline(latlngs, {
          color: '#1D6FB8', weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round'
        }).addTo(polylineLayer);
      });
    }

    // NOTE: Put-in / take-out markers intentionally NOT drawn. The corresponding
    // boat ramps from the curated POI layer serve as the effective access points.

    function classLabel(grade){
      // Purely data-driven: only show "Class X" if the data file provides a
      // grade for this specific POI. No fallback to the run-level rating.
      var g = (grade || '').toString();
      return g ? 'Class ' + g : '';
    }
    function esc(s){
      return (s == null ? '' : String(s))
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    pois.forEach(function(p){
      var marker;
      if (p.kind === 'waterfall'){
        marker = L.marker([p.lat, p.lon], { icon: tri() })
          .bindPopup(popupHtml(esc(p.name), 'Waterfall' + (p.grade ? ' · Class ' + esc(p.grade) : '')));
      } else if (p.kind === 'hazard'){
        marker = L.marker([p.lat, p.lon], { icon: tri() })
          .bindPopup(popupHtml(esc(p.name), esc(p.cat || 'Hazard')));
      } else if (p.kind === 'portage'){
        marker = L.marker([p.lat, p.lon], { icon: pin('portage', SVG.steps) })
          .bindPopup(popupHtml(esc(p.name), 'Portage'));
      } else if (p.kind === 'play'){
        marker = L.marker([p.lat, p.lon], { icon: pin('play', SVG.wave) })
          .bindPopup(popupHtml(esc(p.name), 'Play spot' + (p.grade ? ' · Class ' + esc(p.grade) : '')));
      } else if (p.kind === 'camp'){
        marker = L.marker([p.lat, p.lon], { icon: pin('camp', SVG.tent) })
          .bindPopup(popupHtml(esc(p.name || 'Campground'), 'Campground'));
      } else if (p.kind === 'boat_ramp'){
        marker = L.marker([p.lat, p.lon], { icon: pin('boat', SVG.boat) })
          .bindPopup(popupHtml(esc(p.name || 'Boat Ramp'), 'Boat Ramp'));
      } else if (p.kind === 'access'){
        marker = L.marker([p.lat, p.lon], { icon: pin('access', SVG.boat) })
          .bindPopup(popupHtml(esc(p.name || 'Access Point'), 'Access Point'));
      } else if (p.kind === 'parking'){
        marker = L.marker([p.lat, p.lon], { icon: pin('parking', SVG.parking) })
          .bindPopup(popupHtml(esc(p.name || 'Parking'), 'Parking'));
      } else if (p.kind === 'note'){
        marker = L.marker([p.lat, p.lon], { icon: pin('note', SVG.info) })
          .bindPopup(popupHtml(esc(p.name || 'Note'), esc(p.description || '')));
      } else if (p.kind === 'putin' || p.kind === 'takeout'){
        // Legacy kinds — render as boat-ramp pins so they show up like any
        // other data-file POI instead of being silently dropped.
        marker = L.marker([p.lat, p.lon], { icon: pin('boat', SVG.boat) })
          .bindPopup(popupHtml(esc(p.name || (p.kind === 'putin' ? 'Put-in' : 'Take-out')), 'Boat Ramp'));
      } else {
        var grade = (p.grade || '').toUpperCase();
        // Default to a plain (mild-styled) rapid pin when the data file
        // doesn't supply a grade. No fallback to the run-level rating.
        var cls = 'rapid-mild';
        if (/V/.test(grade) || /IV/.test(grade)) cls = 'rapid-hard';
        else if (/III/.test(grade)) cls = 'rapid-mod';
        else if (grade) cls = 'rapid-mild';
        var name = p.name;
        if (!name || /^rapids?$/i.test(name)) name = 'Unnamed rapid';
        marker = L.marker([p.lat, p.lon], { icon: pin(cls, SVG.wave) })
          .bindPopup(popupHtml(esc(name), classLabel(p.grade)));
      }
      if (marker) marker.addTo(focusedLayer);
    });
  }

  function flyToFocused(river, pois, polyline, animate){
    var pts = [
      [river.put_in_lat, river.put_in_lon],
      [river.take_out_lat, river.take_out_lon]
    ];
    // Prefer polyline coords (sample every Nth point — bounds-only is fine)
    if (polyline && polyline.coordinates && polyline.coordinates.length){
      polyline.coordinates.forEach(function(seg){
        // Sample sparsely; we only need bounds
        var step = Math.max(1, Math.floor(seg.length / 60));
        for (var i = 0; i < seg.length; i += step){
          pts.push([seg[i][1], seg[i][0]]);
        }
      });
    } else {
      pois.forEach(function(p){
        if (p.kind !== 'putin' && p.kind !== 'takeout') pts.push([p.lat, p.lon]);
      });
    }
    var b = L.latLngBounds(pts).pad(0.15);
    if (animate){
      map.flyToBounds(b, { duration: 1.4, easeLinearity: 0.3 });
    } else {
      map.fitBounds(b, { animate: false });
    }
  }

  window.applyState = function(state){
    if (!state) return;
    if (state.cmd === 'overview'){
      renderOverview(state.rivers || []);
      // Only move the camera if the caller asks (mode change, not filter update)
      if (state.move !== 'none'){
        var animate = currentMode === 'focused';
        flyToOverview(animate);
      }
      currentMode = 'overview';
    } else if (state.cmd === 'focus'){
      renderFocused(state.river, state.pois || [], state.polyline || null);
      if (state.move !== 'none'){
        var animate2 = currentMode === 'overview' || currentMode === null;
        flyToFocused(state.river, state.pois || [], state.polyline || null, animate2);
      }
      currentMode = 'focused';
    }
  };

  // Listen for parent (web) postMessage as well
  window.addEventListener('message', function(e){
    var d = e.data;
    if (typeof d === 'string'){ try { d = JSON.parse(d); } catch(_) { return; } }
    if (d && d.cmd) window.applyState(d);
  });

  // Tell host we're ready to receive state
  send('ready');
})();
</script>
</body></html>`;

// ---------------- React component ----------------

const FILTERS: { key: FilterKey; label: string; color: string }[] = [
  { key: "all", label: "All Rivers", color: COLORS.primary },
  { key: "whitewater", label: "Whitewater", color: COLORS.danger },
  { key: "mixed", label: "Mixed", color: COLORS.warning },
  { key: "calm", label: "Calm", color: COLORS.safe },
];

export default function MapScreen() {
  const router = useRouter();
  const webRef = useRef<WebView>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [rivers, setRivers] = useState<River[]>([]);
  const [loading, setLoading] = useState(true);
  const [legendOpen, setLegendOpen] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [mapReady, setMapReady] = useState(false);

  const [selectedRiverId, setSelectedRiverIdState] = useState<string | null>(
    () => getMapSelectedRiverId()
  );
  // Wrapper that persists selection so it survives a tab switch.
  const setSelectedRiverId = useCallback((id: string | null) => {
    setMapSelectedRiverId(id);
    setSelectedRiverIdState(id);
  }, []);
  const [focusedPois, setFocusedPois] = useState<OsmPoi[] | null>(null);
  const [focusedPolyline, setFocusedPolyline] = useState<Polyline | null>(null);
  const [poiSource, setPoiSource] = useState<string | null>(null);
  const [focusLoading, setFocusLoading] = useState(false);

  const selectedRiver = useMemo(
    () => rivers.find((r) => r.id === selectedRiverId) || null,
    [rivers, selectedRiverId]
  );

  const filteredRivers = useMemo(() => {
    if (filter === "all") return rivers;
    return rivers.filter((r) => r.type === filter);
  }, [rivers, filter]);

  // Initial featured-river fetch (cache-aware — works offline)
  const load = useCallback(async () => {
    try {
      const j = await fetchFeaturedWithCache();
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

  // Deep-link: if the route includes ?river=<id>, auto-select once rivers load.
  // If the route also carries a `reset=<nonce>` param, force the map to drop
  // any persisted viewport and refit to the river's default bounding view
  // (used by the "View on Map" button on the river detail screen).
  const params = useLocalSearchParams<{ river?: string; reset?: string }>();
  const lastResetRef = useRef<string | null>(null);
  useEffect(() => {
    if (params.river && rivers.length > 0) {
      const exists = rivers.some((r) => r.id === params.river);
      if (exists) setSelectedRiverId(params.river as string);
    }
  }, [params.river, rivers]);

  // Force-refit handler: every time the river-detail card sends us a new
  // `reset` nonce, wipe the saved viewport and prime `prevModeRef` so the
  // next state push to the map triggers `move: "fit"` even if we were
  // already focused on the same river.
  useEffect(() => {
    if (!params.reset) return;
    if (lastResetRef.current === params.reset) return;
    lastResetRef.current = params.reset;
    setMapView(null);
    prevModeRef.current = null;
  }, [params.reset]);

  // When a river is selected, fetch its POIs + (optional) curated polyline
  useEffect(() => {
    if (!selectedRiverId) {
      setFocusedPois(null);
      setFocusedPolyline(null);
      setPoiSource(null);
      return;
    }
    let cancelled = false;
    setFocusLoading(true);
    setFocusedPois(null);
    setFocusedPolyline(null);
    setPoiSource(null);
    (async () => {
      try {
        const [poiJson, polyJson] = await Promise.all([
          fetchPoisWithCache(selectedRiverId),
          fetchPolylineWithCache(selectedRiverId).catch(() => null),
        ]);
        if (!cancelled) {
          setFocusedPois(poiJson.pois || []);
          setPoiSource(poiJson.source || "osm");
        }
        if (polyJson) {
          const feat = polyJson?.features?.[0];
          const geom = feat?.geometry;
          if (geom) {
            let coords: number[][][];
            if (geom.type === "LineString") {
              coords = [geom.coordinates];
            } else if (geom.type === "MultiLineString") {
              coords = geom.coordinates;
            } else {
              coords = [];
            }
            if (!cancelled && coords.length) {
              setFocusedPolyline({
                coordinates: coords,
                length_mi: feat?.properties?.length_mi,
              });
            }
          }
        }
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

  // Send a command into the map (works on both web iframe and native WebView)
  const postCommand = useCallback((payload: any) => {
    if (Platform.OS === "web") {
      iframeRef.current?.contentWindow?.postMessage(payload, "*");
    } else {
      const js = `if (window.applyState) window.applyState(${JSON.stringify(payload)}); true;`;
      webRef.current?.injectJavaScript(js);
    }
  }, []);

  // Compose payload for either overview or focused view
  const buildPayload = useCallback(() => {
    if (selectedRiver) {
      const cls = (selectedRiver.class_rating || "").toUpperCase();
      const intensity = /V/.test(cls) || /IV/.test(cls)
        ? "hard"
        : /III/.test(cls)
        ? "mod"
        : "mild";
      return {
        cmd: "focus",
        river: {
          id: selectedRiver.id,
          class_rating: selectedRiver.class_rating,
          intensity,
          put_in_lat: selectedRiver.put_in.lat,
          put_in_lon: selectedRiver.put_in.lon,
          put_in_name: selectedRiver.put_in.name,
          take_out_lat: selectedRiver.take_out.lat,
          take_out_lon: selectedRiver.take_out.lon,
          take_out_name: selectedRiver.take_out.name,
        },
        pois: focusedPois || [],
        polyline: focusedPolyline,
      };
    }
    return {
      cmd: "overview",
      rivers: filteredRivers.map((r) => ({
        id: r.id,
        type: r.type,
        plat: r.put_in.lat,
        plon: r.put_in.lon,
      })),
    };
  }, [selectedRiver, focusedPois, focusedPolyline, filteredRivers]);

  // Seed `prevModeRef` so we DON'T trigger a fitBounds on first mount when
  // we've restored a saved view (otherwise the saved view would be clobbered
  // by an unnecessary "fit" animation back to LOWER_48 / river bounds).
  const prevModeRef = useRef<"overview" | "focused" | null>(
    getMapView()
      ? getMapSelectedRiverId()
        ? "focused"
        : "overview"
      : null
  );

  // Push state to map whenever map is ready or relevant state changes.
  // `params.reset` is in the deps so the explicit refit triggered by the
  // river card's "View on Map" button re-runs this effect even when the
  // selected river hasn't changed (e.g. user is already viewing that run).
  useEffect(() => {
    if (!mapReady) return;
    // Only push focused state once POIs are loaded so the bounds include them
    if (selectedRiver && focusedPois === null) return;
    const newMode: "overview" | "focused" = selectedRiver ? "focused" : "overview";
    // Only animate the camera on a real mode change. Filter changes within
    // the same mode (overview→overview) should leave the camera alone.
    const move = newMode !== prevModeRef.current ? "fit" : "none";
    postCommand({ ...buildPayload(), move });
    prevModeRef.current = newMode;
  }, [mapReady, selectedRiver, focusedPois, filteredRivers, buildPayload, postCommand, params.reset]);

  // Handle messages from the map
  const handleMessage = useCallback((msg: string) => {
    if (msg === "ready") {
      setMapReady(true);
    } else if (msg.startsWith("select:")) {
      setSelectedRiverId(msg.slice("select:".length));
    } else if (msg.startsWith("view:")) {
      // "view:lat,lng,zoom" — persist so we can restore on next mount
      const parts = msg.slice("view:".length).split(",");
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      const zoom = parseFloat(parts[2]);
      if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
        setMapView({ lat, lng, zoom });
      }
    }
  }, [setSelectedRiverId]);

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
  }, [handleMessage]);

  // Synchronously load the merged offline-tile manifest so the WebView's
  // very first paint can route file:// for any tile we have on disk. This
  // is the boundary-check fuel: without it, OFFLINE_TILES is empty and the
  // layer falls back to plain HTTPS-only, causing every offline tile
  // fetch to fail straight into the "check your connection" path.
  //
  // We use the MERGED manifest (union of every river's downloads) rather
  // than only the selected river's, because the USA overview map has no
  // notion of an "active" run — a paddler with downloads for any river
  // should still see them here.
  const [offlineTiles, setOfflineTiles] = useState<{
    tileToUrl: Record<string, string>;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const merged = await getMergedOfflineManifest();
      if (!cancelled && merged) setOfflineTiles(merged);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // HTML is generated ONCE per mount. On first mount we seed the map with
  // any previously-saved view so the user lands where they left off.
  const html = useMemo(
    () => buildMapHtml(getMapView(), offlineTiles),
    // We intentionally rebuild only when offlineTiles transitions from
    // null → loaded so the WebView picks up file:// URLs on its first paint
    // after the manifest is read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [offlineTiles]
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
        <ProfileMenu testID="map-profile-btn" />
      </View>

      <View style={styles.mapWrap} testID="map-container">
        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading rivers…</Text>
          </View>
        ) : (
          <MapView
            webViewRef={webRef}
            iframeRef={iframeRef}
            html={html}
            onMessage={handleMessage}
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
            <Text style={styles.backBtnText}>BACK</Text>
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
          </View>
        )}

        {legendOpen && selectedRiver && (() => {
          // Build a set of kinds actually present on this run so we can
          // hide categories that contribute zero POIs to the current map.
          const kinds = new Set<string>();
          for (const p of focusedPois || []) {
            if (p && typeof p.kind === "string") kinds.add(p.kind);
          }
          const hasRapid = kinds.has("rapid") || kinds.has("play");
          const hasHazard = kinds.has("hazard") || kinds.has("waterfall");
          const hasPortage = kinds.has("portage");
          const hasCamp = kinds.has("camp");
          const hasBoat =
            kinds.has("boat_ramp") ||
            kinds.has("access") ||
            kinds.has("putin") ||
            kinds.has("takeout");
          const hasParking = kinds.has("parking");
          const hasNote = kinds.has("note");
          const anyVisible =
            hasRapid || hasHazard || hasPortage || hasCamp || hasBoat || hasParking || hasNote;
          if (!anyVisible) return null;
          return (
            <View style={styles.legend} testID="map-legend-focused">
              <Text style={styles.legendTitle}>ON THIS RUN</Text>
              {hasRapid && (
                <LegendIcon kind="rapid" rapidColor={COLORS.warning} label="Rapid" />
              )}
              {hasHazard && <LegendIcon kind="hazard" label="Hazard / falls" />}
              {hasPortage && <LegendIcon kind="portage" label="Portage" />}
              {hasCamp && <LegendIcon kind="camp" label="Campground" />}
              {hasBoat && <LegendIcon kind="boat" label="Boat ramp" />}
              {hasParking && <LegendIcon kind="parking" label="Parking" />}
              {hasNote && <LegendIcon kind="note" label="Note" />}
            </View>
          );
        })()}
      </View>

      {selectedRiver ? (
        <View style={styles.detailBar} testID="map-detail-bar">
          <View style={{ flex: 1 }}>
            <Text style={styles.detailLabel}>
              {focusedPois?.length || 0} feature{(focusedPois?.length || 0) === 1 ? "" : "s"}
              {poiSource === "curated" ? " · Curated" : " from OpenStreetMap"}
              {focusedPolyline?.length_mi
                ? ` · ${focusedPolyline.length_mi.toFixed(1)} mi`
                : ""}
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
        <View style={styles.filterBar} testID="map-filter-bar">
          {FILTERS.map((f, idx) => {
            const active = filter === f.key;
            return (
              <React.Fragment key={f.key}>
                <TouchableOpacity
                  testID={`map-filter-${f.key}`}
                  style={[styles.filterBtn, active && styles.filterBtnActive]}
                  onPress={() => setFilter(f.key)}
                  activeOpacity={0.85}
                >
                  {f.key === "all" ? (
                    <View style={styles.allDots}>
                      <View style={[styles.miniDot, { backgroundColor: COLORS.danger }]} />
                      <View style={[styles.miniDot, { backgroundColor: COLORS.warning }]} />
                      <View style={[styles.miniDot, { backgroundColor: COLORS.safe }]} />
                    </View>
                  ) : (
                    <View style={[styles.filterDot, { backgroundColor: f.color }]} />
                  )}
                  <Text
                    style={[styles.filterLabel, active && styles.filterLabelActive]}
                    numberOfLines={1}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
                {idx < FILTERS.length - 1 && <View style={styles.filterDivider} />}
              </React.Fragment>
            );
          })}
        </View>
      )}
    </SafeAreaView>
  );
}

function LegendIcon({
  kind,
  rapidColor,
  label,
}: {
  kind: "rapid" | "hazard" | "portage" | "camp" | "boat" | "parking" | "note";
  rapidColor?: string;
  label: string;
}) {
  // Mini icon symbols mirroring the exact SVGs on the map markers
  if (kind === "hazard") {
    // Red triangle with "!" — same as map waterfall/hazard markers
    return (
      <View style={styles.legendRow}>
        <View style={styles.legendTri}>
          <Text style={styles.legendTriText}>!</Text>
        </View>
        <Text style={styles.legendText}>{label}</Text>
      </View>
    );
  }
  if (kind === "parking") {
    // Charcoal circle with white "P" — matches in-map parking pin
    return (
      <View style={styles.legendRow}>
        <View style={[styles.legendPin, { backgroundColor: "#4F5D75" }]}>
          <Text style={styles.legendPinLetter}>P</Text>
        </View>
        <Text style={styles.legendText}>{label}</Text>
      </View>
    );
  }
  const bg =
    kind === "rapid"
      ? rapidColor || COLORS.primary
      : kind === "portage"
      ? COLORS.warning
      : kind === "boat"
      ? "#1D4E89"
      : kind === "note"
      ? "#6C757D"
      : "#8B5E34";

  // Render the SAME SVG paths as the map's pin icons
  const renderSvg = () => {
    const stroke = "#fff";
    const sw = 2.5;
    if (kind === "rapid") {
      // Wave (two horizontal wavy lines) — matches SVG_ICONS.wave on map
      return (
        <Svg viewBox="0 0 24 24" width={14} height={14}>
          <Path
            d="M2 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    }
    if (kind === "portage") {
      // Three circles (steps) — matches SVG_ICONS.steps
      return (
        <Svg viewBox="0 0 24 24" width={14} height={14}>
          <Circle cx="8" cy="8" r="3" fill="#fff" />
          <Circle cx="16" cy="14" r="3" fill="#fff" />
          <Circle cx="9" cy="18" r="2" fill="#fff" />
        </Svg>
      );
    }
    if (kind === "camp") {
      // Tent outline — matches SVG_ICONS.tent
      return (
        <Svg viewBox="0 0 24 24" width={14} height={14}>
          <Path
            d="M3 20h18"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M12 4L3 20"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M12 4l9 16"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M12 11l-3 9"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M12 11l3 9"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
      );
    }
    if (kind === "boat") {
      // Boat — matches SVG_ICONS.boat
      return (
        <Svg viewBox="0 0 24 24" width={14} height={14}>
          <Path
            d="M3 16c2 2 4 2 6 0s4-2 6 0 4 2 6 0"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M5 13l1-4h12l1 4"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M12 9V4"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
      );
    }
    if (kind === "note") {
      // Info "i" — matches SVG_ICONS.info
      return (
        <Svg viewBox="0 0 24 24" width={14} height={14}>
          <Circle cx="12" cy="12" r="9" stroke={stroke} strokeWidth={sw} fill="none" />
          <Path
            d="M12 8v.01"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinecap="round"
          />
          <Path
            d="M11 12h1v4h1"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    }
    return null;
  };

  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendPin, { backgroundColor: bg }]}>{renderSvg()}</View>
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
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  mapWrap: {
    flex: 1, marginHorizontal: 16, marginBottom: 12,
    borderRadius: 20, overflow: "hidden",
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.border,
    position: "relative",
  },
  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { color: COLORS.textMuted, fontSize: 13, fontWeight: "600" },
  backBtn: {
    position: "absolute", top: 12, left: 12,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(10,17,40,0.92)",
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    minHeight: 36,
  },
  backBtnText: { color: "#fff", fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  focusLoading: {
    position: "absolute", top: 12, right: 12,
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(10,17,40,0.85)",
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
  },
  focusLoadingText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  legend: {
    position: "absolute", left: 12, bottom: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: COLORS.border, minWidth: 158,
  },
  legendTitle: {
    fontSize: 10, fontWeight: "900", letterSpacing: 1.5,
    color: COLORS.textMuted, marginBottom: 8,
  },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendPin: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "#fff",
  },
  legendTri: {
    width: 0, height: 0,
    borderLeftWidth: 9, borderRightWidth: 9, borderBottomWidth: 16,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderBottomColor: COLORS.danger,
    alignItems: "center", justifyContent: "center",
    marginLeft: -1,
  },
  legendTriText: {
    color: "#fff", fontSize: 9, fontWeight: "900",
    position: "absolute", top: 4, left: -3, width: 6, textAlign: "center",
  },
  legendText: { fontSize: 13, fontWeight: "700", color: COLORS.textMain },
  legendPinLetter: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 14,
    textAlign: "center",
  },
  legendHint: { fontSize: 11, color: COLORS.textMuted, marginTop: 6, fontStyle: "italic" },

  // Filter bar (replaces old stats bar)
  filterBar: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingHorizontal: 8, paddingVertical: 8,
    alignItems: "stretch",
  },
  filterBtn: {
    flex: 1,
    alignItems: "center", justifyContent: "center",
    paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: 14,
    minHeight: 56,
    gap: 6,
  },
  filterBtnActive: {
    backgroundColor: COLORS.textMain,
  },
  filterDot: {
    width: 12, height: 12, borderRadius: 6,
  },
  allDots: {
    flexDirection: "row", gap: 3, alignItems: "center",
  },
  miniDot: {
    width: 7, height: 7, borderRadius: 4,
  },
  filterLabel: {
    fontSize: 11, fontWeight: "800",
    letterSpacing: 0.4, color: COLORS.textMain,
    textAlign: "center",
  },
  filterLabelActive: { color: "#fff" },
  filterDivider: { width: 1, marginVertical: 8, backgroundColor: COLORS.border },

  // Detail bar (when zoomed in)
  detailBar: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  detailLabel: { fontSize: 13, fontWeight: "800", color: COLORS.textMain, letterSpacing: -0.2 },
  detailSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  viewRunBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: 999, minHeight: 44,
  },
  viewRunBtnText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
});
