// Read-only mini-map for a single trip day in the Past Trips log.
//
// Renders the user's recorded GPS path inside a locked Leaflet WebView:
//   • Pan / pinch-zoom / wheel-zoom / double-tap-zoom all disabled
//   • Tiles served from the offline-tile manifest first; falls back to
//     live USGS Topo when network is available
//   • If both fail, the path is still visible against a neutral grey
//     background so the user always sees their route shape
//   • fitBounds to the polyline's bounding box with sane padding
//   • Drop start (green) + finish (red) pins
//
// Layout: caller controls dimensions via `style`. Internally the
// component fills 100% of its container.

import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { LEAFLET_JS_B64, LEAFLET_CSS_B64 } from "./leafletInline";
import MapView from "./MapView";
import { getMergedOfflineManifest } from "./tiles/tileDownloader";

type LatLon = { lat: number; lon: number };

type Props = {
  points: LatLon[];
  style?: any;
  /**
   * When true, the map's wrapper View ignores all touch events so the
   * parent ScrollView can receive pan/scroll gestures even when the
   * user's finger first lands on the map. The internal Leaflet
   * instance is already locked (no pan/zoom), so disabling pointer
   * events at the React Native layer has no downside — it just makes
   * the past-trips list scroll smoothly. Defaults to true.
   */
  passThroughTouches?: boolean;
};

function buildHtml(points: LatLon[], tileToUrl: Record<string, string>): string {
  // Filter out any nonsensical coords (should never happen, defensive).
  const pts = (points || []).filter(
    (p) =>
      typeof p?.lat === "number" &&
      typeof p?.lon === "number" &&
      Math.abs(p.lat) <= 90 &&
      Math.abs(p.lon) <= 180
  );
  // Pick a center for the initial L.map call (Leaflet needs SOMETHING
  // before fitBounds runs). Use the middle point if we have any.
  const center = pts.length
    ? { lat: pts[Math.floor(pts.length / 2)].lat, lon: pts[Math.floor(pts.length / 2)].lon }
    : { lat: 39.5, lon: -110 };
  const ptsJson = JSON.stringify(pts.map((p) => [p.lat, p.lon]));
  const tileJson = JSON.stringify(tileToUrl || {});
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="initial-scale=1.0,maximum-scale=1.0,user-scalable=no" />
<style>${atob(LEAFLET_CSS_B64).replace(/<\//g, "<\\/")}</style>
<style>
  html,body,#m{margin:0;padding:0;height:100%;width:100%;background:#d3d8df;}
  .leaflet-container{background:#d3d8df;}
  .leaflet-tile{filter:none;}
  .me-pin{
    width:18px;height:18px;border-radius:9px;border:3px solid #fff;
    box-shadow:0 1px 4px rgba(0,0,0,0.5);
  }
  .me-pin.start{background:#2A9D8F;}
  .me-pin.end{background:#D62828;}
</style>
</head>
<body>
<div id="m"></div>
<script>${atob(LEAFLET_JS_B64).replace(/<\//g, "<\\/")}</script>
<script>
(function(){
  var pts = ${ptsJson};
  var tileToUrl = ${tileJson};
  var OFFLINE_TILES_COUNT = Object.keys(tileToUrl).length;
  var BLANK_TILE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==";

  var map = L.map('m', {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    tap: false,
  }).setView([${center.lat}, ${center.lon}], 12);

  // Custom offline-first tile layer.
  var OfflineFirst = L.TileLayer.extend({
    createTile: function(coords, done) {
      var img = document.createElement('img');
      var key = coords.z + '/' + coords.x + '/' + coords.y;
      var cached = tileToUrl[key];
      if (cached) {
        img.src = cached;
      } else {
        img.src = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/'
          + coords.z + '/' + coords.y + '/' + coords.x;
      }
      img.onload = function(){ done(null, img); };
      img.onerror = function(){
        img.src = BLANK_TILE;
        done(null, img);
      };
      return img;
    }
  });
  new OfflineFirst({ maxZoom: 16, errorTileUrl: BLANK_TILE }).addTo(map);

  // Trail polyline — same white-with-dark-halo style as the live Trip Tracker.
  if (pts.length >= 2) {
    var canvasR = L.canvas({ padding: 0.5 });
    L.polyline(pts, { color:'#0A1128', weight:6, opacity:0.55, lineCap:'round', lineJoin:'round', renderer: canvasR }).addTo(map);
    L.polyline(pts, { color:'#ffffff', weight:3, opacity:1.0, lineCap:'round', lineJoin:'round', renderer: canvasR }).addTo(map);
    // Start + end pins
    L.marker(pts[0], {
      icon: L.divIcon({ className:'', html:'<div class="me-pin start"></div>', iconSize:[18,18], iconAnchor:[9,9] })
    }).addTo(map);
    L.marker(pts[pts.length-1], {
      icon: L.divIcon({ className:'', html:'<div class="me-pin end"></div>', iconSize:[18,18], iconAnchor:[9,9] })
    }).addTo(map);
    // Fit camera to bounds with comfortable padding.
    var bounds = L.latLngBounds(pts).pad(0.2);
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 15 });
  } else if (pts.length === 1) {
    L.marker(pts[0], {
      icon: L.divIcon({ className:'', html:'<div class="me-pin start"></div>', iconSize:[18,18], iconAnchor:[9,9] })
    }).addTo(map);
    map.setView(pts[0], 13);
  }
})();
</script>
</body></html>`;
}

export default function TripMapView({ points, style, passThroughTouches = true }: Props) {
  const [tileToUrl, setTileToUrl] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = await getMergedOfflineManifest();
      if (!cancelled) setTileToUrl(m?.tileToUrl ?? {});
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const html = useMemo(
    () => (tileToUrl == null ? null : buildHtml(points, tileToUrl)),
    [points, tileToUrl]
  );
  // `pointerEvents: 'none'` on the outer frame makes the entire map area
  // transparent to touches, so the user's finger lands on the parent
  // ScrollView (or whatever ancestor scroller) right away. Without this,
  // the WebView intercepts the initial pan and prevents the list from
  // scrolling unless the user starts the gesture outside the map.
  const interactionStyle = passThroughTouches
    ? { pointerEvents: "none" as const }
    : undefined;
  if (!html) {
    return <View style={[styles.frame, style, styles.loading, interactionStyle]} />;
  }
  return (
    <View
      style={[styles.frame, style, interactionStyle]}
      testID="trip-mini-map"
    >
      <MapView html={html} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#d3d8df",
  },
  loading: {
    // Same neutral grey shows while we're loading the manifest.
  },
});
