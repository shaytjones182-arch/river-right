#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  River-focused GPS app (white-water + calmer trips) with USGS flow data, USA-only,
  using OpenStreetMap. Latest round: rebrand to "RiverRight", replace Gauges tab with
  a Map tab showing USA rivers highlighted in blue, fix squished Rivers filter buttons,
  add POIs to river descriptions, fix "Could not load gauge data" 404 on river runs.

backend:
  - task: "Fix Ocoee USGS site id (404 → 200)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Replaced inactive 03566425 with active 03559500 (OCOEE RIVER AT COPPERHILL, TN). Verified via curl: returns cfs=848 status=Runnable."

  - task: "Featured rivers POIs"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "All 8 featured rivers carry points_of_interest arrays with named rapids/eddies and run notes."

  - task: "API rebrand (RiverRight)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Root /api/ now returns RiverRight."

frontend:
  - task: "Replace Gauges tab with Map tab (USA rivers in blue)"
    implemented: true
    working: true
    file: "frontend/app/map.tsx, frontend/app/_layout.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "New Map tab uses CartoDB Voyager basemap + USGS National Map hydrography overlay. Markers for all featured rivers colored by type (whitewater/mixed/calm). Popup CTA navigates to river detail. Legend + bottom stats. Old gauges.tsx removed from /app."

  - task: "Polish Rivers filter buttons"
    implemented: true
    working: true
    file: "frontend/app/rivers.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Increased horizontal padding 18→22, vertical 11→12, minHeight 44→46, added minWidth 88. Buttons no longer squished."

  - task: "Rebrand to RiverRight"
    implemented: true
    working: true
    file: "frontend/app.json, frontend/app/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "app.json name/slug → RiverRight/riverright. Home overline RIVERRUNNER → RIVERRIGHT, headline 'Run it well' → 'Run it right'."

  - task: "POI rendering on river detail"
    implemented: true
    working: true
    file: "frontend/app/river/[id].tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "river/[id].tsx renders points_of_interest as a bulleted list above Hazards. Verified via screenshot — Colorado Grand Canyon shows Soap Creek, Hance, Crystal, Lava Falls, Diamond Peak."

metadata:
  created_by: "main_agent"
  version: "1.2"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "Fix Ocoee USGS site id (404 → 200)"
    - "Replace Gauges tab with Map tab (USA rivers in blue)"
    - "Polish Rivers filter buttons"
    - "Rebrand to RiverRight"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

  - task: "POI tracker popups: along-the-river distance from user"
    implemented: true
    working: true
    file: "frontend/app/track.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          When the user is within 100 ft (30.48 m) of the run polyline on the
          Trip Tracker map, tapping any POI now appends "X.XX mi along river"
          to the popup meta line (in addition to name + class). The distance is
          computed as |cum(user_proj_on_poly) − cum(poi_proj_on_poly)| using a
          cumulative-distance index over the polyline (local equirectangular
          projection — accurate for a single river run). Always shown in miles
          with 2 decimals; suppressed entirely when the user is farther than
          100 ft from the polyline. Verified via Playwright with a Desolation
          Canyon run: user snapped to a marker on the polyline (proj dist
          0.21 m) → popups show 67.50 / 37.91 / 17.67 / 0.00 / 15.61 mi along
          river — all geographically reasonable. User moved to Denver (419 km
          off polyline) → popups revert to plain name + class. Implementation
          lives inside the Leaflet WebView/iframe; debug surface
          `window.__rrDebug` exposed for diagnostics.
          NOTE: while implementing, fixed a pre-existing regex-escape pitfall —
          JS template literals strip unrecognized escape sequences (`\\s`,
          `\\S`, `\\/`), so any regex literals inside `buildHtml` MUST use
          doubled backslashes.


    implemented: true
    working: true
    file: "backend/ingest_geojson.py, backend/server.py, data/runs/green-river-desolation/"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Round 5: Trip tracking & profile shell.
          • Removed gray/red recording status dot from Track tab header.
          • Fixed "Pick a run" modal overlap with iOS status bar (now uses
            useSafeAreaInsets directly on the modal body, not just edges=["top"]).
          • Trip state machine: idle → tracking (PAUSE TRIP) → paused (RESUME / LOG
            DAY N / END TRIP). Verified end-to-end via Playwright with 2-day flow.
          • Stats per day: SPEED, DIST, AVG (moving-time-based, AllTrails-style
            using 0.5 mph threshold), MAX, MOVING time, TIME elapsed.
          • Per-day stats persisted via AsyncStorage at /trips/<id>. Trip-wide rollup
            (distance, max, avg over total moving time, total elapsed) computed on save.
          • New screens: /trips (past trips list with empty state + pull-to-refresh)
            and /trips/[id] (trip totals + by-day breakdown). Both hidden from tab bar
            (href: null in _layout.tsx).
          • ProfileMenu component added to top-right of Home, Map, and Track headers.
            Menu items: Past trips → /trips, Plus account (placeholder alert), About.
          • Plus tier (subscriptions, offline, auth) deliberately deferred — see PRD.
          • Web compatibility: Location.watchPositionAsync().remove() throws on the
            expo-location web shim; guarded with Platform.OS check + try/catch.
          • Installed @react-native-async-storage/async-storage@2.2.0 and
            react-native-svg@15.12.1 (Expo SDK aligned versions).
      - working: true
        agent: "testing"
        comment: |
          Backend test suite executed via /app/backend_test.py against the public
          REACT_APP_BACKEND_URL (https://whitewater-guide.preview.emergentagent.com/api).
          All 8 test cases PASS — no regressions, no failures:
          1. GET /api/rivers/featured → 65 rivers, exactly ['green-river-desolation']
             has has_curated_data=true, the other 64 false. All required fields
             (id, name, state, class_rating, type) preserved.
          2. GET /api/rivers/green-river-desolation/polyline → 200; FeatureCollection
             with 1 feature, geometry.type='MultiLineString', 1 segment with 1079
             points, properties.length_mi=83.04, properties.name='Green River —
             Desolation Canyon'. All sampled coordinates in valid WGS84 range
             (lon≈-110, lat≈39).
          3. GET /api/rivers/gauley-river/polyline and /api/rivers/ocoee-river/polyline
             → 404 with detail='No curated polyline for this run'.
          4. GET /api/rivers/invalid-id/polyline → 404 with detail='River not found'.
          5. GET /api/rivers/green-river-desolation/osm-poi → 200 in ~143ms, source='curated',
             count=38; kinds present: {rapid:33, boat_ramp, camp, note, access};
             'note' POI has populated description; POIs sorted ascending by
             distance_from_putin_mi.
          6. GET /api/rivers/gauley-river/osm-poi → 200, served from cache,
             source is NOT 'curated' (None), pois array present (15 items).
          7. GET /api/rivers/green-river-desolation → 200, returns {river, flow}
             with full river details + live USGS flow data — no regression.
          Curated path is correctly served from disk (no Overpass call made for
          Desolation), and the fallback path remains intact for non-curated rivers.

agent_communication:
  - agent: "main"
    message: |
      Round 4: Curated GeoJSON data pipeline.
      • User supplied 2 clean GeoJSON files for Desolation Canyon (Green River, UT) — a
        polyline (EPSG:6350) and a POI layer with 38 named features. Both ingested via
        new ingest_geojson.py script and stored under /app/data/runs/green-river-desolation/.
      • Backend now serves curated data instead of hitting Overpass for that run. Map and
        bottom bar show "Curated · 83.0 mi" when curated source is active.
      • Frontend renders the curated polyline as a blue river path with white halo, plus
        new POI kinds (boat_ramp/access/note) with distinct icons. Legend updated
        conditionally when source is curated. Non-curated rivers unchanged.
      • Next data uploads can drop into /app/data/runs/<id>/ — same script handles them.
  - agent: "testing"
    message: |
      Round 4 backend retest complete. Ran /app/backend_test.py against the public
      backend URL; all 8 curated-pipeline assertions PASS:
        • /api/rivers/featured returns has_curated_data with exactly green-river-desolation=true (1 of 65)
        • /api/rivers/green-river-desolation/polyline → MultiLineString, 1079 pts, length_mi=83.04, valid WGS84 (lon≈-110, lat≈39)
        • /api/rivers/gauley-river/polyline + /api/rivers/ocoee-river/polyline → 404 "No curated polyline for this run"
        • /api/rivers/invalid-id/polyline → 404 "River not found"
        • /api/rivers/green-river-desolation/osm-poi → 200 in ~143ms (no Overpass call); source="curated"; count=38; kinds={rapid:33, boat_ramp, camp, note(with description), access}; sorted asc by distance_from_putin_mi
        • /api/rivers/gauley-river/osm-poi → 200, source != "curated" (live Overpass fallback intact, 15 POIs served from cache)
        • /api/rivers/green-river-desolation → 200 with river details + live USGS flow data (no regression)
      No critical issues. No mocked endpoints encountered. The curated GeoJSON pipeline is fully working and backwards-compatible.
