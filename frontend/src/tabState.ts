// In-memory tab state store.
//
// Preserves scroll position and map view state across tab switches so the
// user comes back to exactly what they were looking at — even on the web
// preview where the Tabs navigator re-mounts screens on URL change.
//
// On native iOS / Android this module is largely redundant (React Navigation
// keeps tabs mounted by default and ScrollView / WebView retain their own
// state), but it's harmless there and makes the web preview behave the same.

// ─── Home tab — scroll position ────────────────────────────────────────────
let homeScrollY = 0;
export function getHomeScrollY(): number {
  return homeScrollY;
}
export function setHomeScrollY(y: number): void {
  homeScrollY = y;
}

// ─── Map tab — last view (center + zoom) ───────────────────────────────────
export type MapView = { lat: number; lng: number; zoom: number };
let mapView: MapView | null = null;
export function getMapView(): MapView | null {
  return mapView;
}
export function setMapView(v: MapView): void {
  mapView = v;
}

// ─── Map tab — last selected river (deep state) ────────────────────────────
let mapSelectedRiverId: string | null = null;
export function getMapSelectedRiverId(): string | null {
  return mapSelectedRiverId;
}
export function setMapSelectedRiverId(id: string | null): void {
  mapSelectedRiverId = id;
}
