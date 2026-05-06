# RiverRunner — Product Requirements (MVP)

## Vision
A river-focused GPS app for both whitewater and calmer river trips, surfacing live USGS flow data and curated river guide info for the United States.

## Audience
Kayakers, rafters, canoeists, and casual paddlers in the U.S.

## MVP Scope (built)
- **Live GPS tracking**: OSM map (Leaflet via WebView/iframe) with route trail, current speed (mph), distance (mi), elapsed time, max speed. Uses `expo-location` foreground permission.
- **USGS flow data**:
  - Nearby gauges by current location + radius (default 50 mi)
  - Browse by U.S. state (19 paddler-relevant states)
  - Filter/search by river name or site ID
  - Per-site detail with CFS, gauge height (ft), status badge (Low / Runnable / High / Flood) and mini map
- **River guidebook**: 8 curated rivers (whitewater + mixed + calm) with class rating, hazards, put-in / take-out coordinates, and live flow data joined from USGS.
- **Bottom-tab navigation**: Home, Track, Gauges, Rivers, plus pushable detail screens (`/river/[id]`, `/gauge/[id]`).

## Tech
- **Frontend**: Expo SDK 54, expo-router, react-native-webview, expo-location, Leaflet + OpenStreetMap.
- **Backend**: FastAPI proxy to `waterservices.usgs.gov/nwis/iv/` (no API key needed).
- **Storage**: None for MVP (no auth, no trip history).

## Out of scope (future)
- Trip logging / history persistence
- Offline maps and offline gauge cache
- International (non-USGS) flow sources
- Authentication
- Per-river runnable CFS ranges (current status uses heuristic global buckets)

## Smart enhancement opportunity
Add a "Trip Sharing" feature — generate a shareable link/QR of a completed GPS track + the day's river flow snapshot. Drives organic growth via paddling communities (Facebook groups, AW boater forums) and creates a content loop back into the app.
