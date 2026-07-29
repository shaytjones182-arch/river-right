from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from typing import List, Optional, Any, Dict
import asyncio
import httpx
import math
import time
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Curated per-river data (clean GeoJSON polylines + POI layers ingested from user uploads).
# See backend/ingest_geojson.py for the ingestion pipeline.
CURATED_RUNS_DIR = ROOT_DIR.parent / "data" / "runs"
_curated_cache: Dict[str, Dict[str, Any]] = {}  # river_id -> {polyline, pois, meta}


def _load_curated(river_id: str) -> Optional[Dict[str, Any]]:
    """Load curated polyline + POIs for a river from disk. Cached in memory."""
    if river_id in _curated_cache:
        return _curated_cache[river_id]
    run_dir = CURATED_RUNS_DIR / river_id
    poly_file = run_dir / "polyline.geojson"
    poi_file = run_dir / "poi.geojson"
    meta_file = run_dir / "meta.json"
    helpful_file = run_dir / "helpful_info.json"
    thresholds_file = run_dir / "cfs_thresholds.json"
    if not poly_file.exists() and not poi_file.exists():
        return None
    bundle: Dict[str, Any] = {}
    try:
        if poly_file.exists():
            with poly_file.open() as f:
                bundle["polyline"] = json.load(f)
        if poi_file.exists():
            with poi_file.open() as f:
                bundle["pois"] = json.load(f)
        if meta_file.exists():
            with meta_file.open() as f:
                bundle["meta"] = json.load(f)
        if helpful_file.exists():
            # Schema: {"items": [{"text": str, "url"?: str}, ...]}
            # Anything that isn't a non-empty `text` string is dropped so a
            # malformed entry can't break the river-detail screen.
            try:
                with helpful_file.open() as f:
                    raw = json.load(f) or {}
                items = raw.get("items") if isinstance(raw, dict) else None
                clean: List[Dict[str, Any]] = []
                if isinstance(items, list):
                    for it in items:
                        if not isinstance(it, dict):
                            continue
                        text = it.get("text")
                        if not isinstance(text, str) or not text.strip():
                            continue
                        entry: Dict[str, Any] = {"text": text.strip()}
                        url = it.get("url")
                        if isinstance(url, str) and url.strip():
                            entry["url"] = url.strip()
                        clean.append(entry)
                bundle["helpful_info"] = clean
            except Exception as e:
                logging.warning(
                    f"Failed to parse helpful_info.json for {river_id}: {e}"
                )
        if thresholds_file.exists():
            # Schema:
            # {
            #   "low_threshold":     int,   # below this CFS = "Low"
            #   "normal_threshold":  int,   # informational; typical seasonal
            #                               # flow, shown in the popup
            #   "high_threshold":    int,   # at/above this CFS = "High"
            #   "datasource_attribution": str  # shown in the popup
            # }
            try:
                with thresholds_file.open() as f:
                    raw = json.load(f) or {}
                if isinstance(raw, dict):
                    cfs_th: Dict[str, Any] = {}
                    for k in ("low_threshold", "normal_threshold", "high_threshold"):
                        v = raw.get(k)
                        if isinstance(v, (int, float)):
                            cfs_th[k] = float(v)
                    attr = raw.get("datasource_attribution")
                    if isinstance(attr, str) and attr.strip():
                        cfs_th["datasource_attribution"] = attr.strip()
                    if cfs_th:
                        bundle["cfs_thresholds"] = cfs_th
            except Exception as e:
                logging.warning(
                    f"Failed to parse cfs_thresholds.json for {river_id}: {e}"
                )
    except Exception as e:
        logging.warning(f"Failed to load curated data for {river_id}: {e}")
        return None
    _curated_cache[river_id] = bundle
    return bundle


app = FastAPI()
api_router = APIRouter(prefix="/api")

USGS_IV_URL = "https://waterservices.usgs.gov/nwis/iv/"
USGS_SITE_URL = "https://waterservices.usgs.gov/nwis/site/"
OVERPASS_URLS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
]

# Discharge (cfs) parameter code = 00060, Gauge height (ft) = 00065

# In-memory TTL cache for OSM POI lookups. river_id -> (expires_ts, payload)
_osm_poi_cache: Dict[str, Any] = {}
_OSM_TTL_SECONDS = 24 * 60 * 60  # 24h

# ---------------- Featured Rivers (curated USA whitewater + calm) ----------------
FEATURED_RIVERS: List[Dict[str, Any]] = [
    # Only released runs are active here. Historically an `_UNRELEASED_RIVERS`
    # list of placeholder runs lived below this one; it has been removed
    # because the frontend now bundles curated data directly (see
    # /app/frontend/src/curatedData.ts) and never reads this list at runtime.
    {
        "id": "green-river-desolation",
        "name": "Green River — Desolation Canyon",
        "state": "UT",
        "class_rating": "II–III",
        "type": "mixed",
        "osm_names": ["Green River"],
        "description": "84-mile permitted multi-day through one of the deepest canyons in Utah. Class II–III with side-canyon hikes and stunning desert camping.",
        "hazards": ["Permit required", "Long shuttle from Sand Wash to Swasey's Beach"],
        "points_of_interest": [
            "Jack Creek Rapid (II+): first named drop",
            "Three Fords (III): biggest rapid in Desolation",
            "Coal Creek (II+): playful wave train",
            "Rock Creek (II+): named rapid above Florence Creek",
            "Joe Hutch Canyon (II+): final big rapid",
        ],
        "put_in": {"name": "Sand Wash", "lat": 39.7969, "lon": -109.9847},
        "take_out": {"name": "Swasey's Beach", "lat": 39.0686, "lon": -110.1322},
        "usgs_site_id": "09315000",
        # Friendly display name for the gauge — surfaced on the river
        # detail screen in place of the raw site number / gauge-height
        # reading. Keep this short enough to fit on one line on small
        # phones (e.g. iPhone SE).
        "usgs_site_name": "Green River at Green River, Utah (Station 09315000)",
        "image": "https://images.unsplash.com/photo-1626594995085-36b551227b9a?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
]



def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def classify_flow(
    cfs: Optional[float],
    thresholds: Optional[Dict[str, Any]] = None,
) -> Dict[str, str]:
    """Classify a CFS reading into a Very-low / Low / Normal / High bucket.

    When `thresholds` is provided (per-river overrides loaded from
    /app/data/runs/<id>/cfs_thresholds.json), we honor those exact
    boundaries:
        cfs < low_threshold                          → Very low (gray)
        low_threshold     ≤ cfs < normal_threshold   → Low      (muted blue)
        normal_threshold  ≤ cfs < high_threshold     → Normal   (green)
        cfs ≥ high_threshold                         → High     (amber)

    Falls back to the coarse generic buckets when curated thresholds
    aren't supplied so endpoints without per-river data still produce
    something useful.
    """
    if cfs is None:
        return {"status": "unknown", "label": "No data"}
    if thresholds:
        lo = thresholds.get("low_threshold")
        nm = thresholds.get("normal_threshold")
        hi = thresholds.get("high_threshold")
        if (
            isinstance(lo, (int, float))
            and isinstance(nm, (int, float))
            and isinstance(hi, (int, float))
        ):
            if cfs < lo:
                return {"status": "low", "label": "Very low"}
            if cfs < nm:
                return {"status": "info", "label": "Low"}
            if cfs < hi:
                return {"status": "safe", "label": "Normal"}
            return {"status": "warning", "label": "High"}
    # Generic fallback (MVP placeholder — replaced per-river over time).
    if cfs < 100:
        return {"status": "low", "label": "Low"}
    if cfs < 1500:
        return {"status": "safe", "label": "Runnable"}
    if cfs < 8000:
        return {"status": "warning", "label": "High"}
    return {"status": "danger", "label": "Flood"}


async def fetch_usgs_iv(site_ids: List[str]) -> Dict[str, Any]:
    """Fetch instantaneous values for one or more sites."""
    if not site_ids:
        return {}
    params = {
        "format": "json",
        "sites": ",".join(site_ids),
        "parameterCd": "00060,00065",
        "siteStatus": "active",
    }
    async with httpx.AsyncClient(timeout=15.0) as client_http:
        r = await client_http.get(USGS_IV_URL, params=params)
        r.raise_for_status()
        return r.json()


def parse_iv_response(payload: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """Group time-series by site_no -> {cfs, gauge_height_ft, name, lat, lon, dateTime}."""
    out: Dict[str, Dict[str, Any]] = {}
    series_list = payload.get("value", {}).get("timeSeries", []) or []
    for ts in series_list:
        source_info = ts.get("sourceInfo", {}) or {}
        site_code_list = source_info.get("siteCode", []) or []
        if not site_code_list:
            continue
        site_no = site_code_list[0].get("value")
        if not site_no:
            continue
        var_info = ts.get("variable", {}) or {}
        var_codes = var_info.get("variableCode", []) or []
        var_code = var_codes[0].get("value") if var_codes else None
        values_block = (ts.get("values") or [{}])[0].get("value", []) or []
        latest_val = None
        latest_time = None
        if values_block:
            last = values_block[-1]
            try:
                v = float(last.get("value"))
                if v <= -999998:
                    v = None
                latest_val = v
            except (TypeError, ValueError):
                latest_val = None
            latest_time = last.get("dateTime")

        entry = out.setdefault(site_no, {
            "site_id": site_no,
            "name": source_info.get("siteName"),
            "lat": (source_info.get("geoLocation", {}) or {}).get("geogLocation", {}).get("latitude"),
            "lon": (source_info.get("geoLocation", {}) or {}).get("geogLocation", {}).get("longitude"),
            "cfs": None,
            "gauge_height_ft": None,
            "updated_at": None,
        })
        if var_code == "00060":
            entry["cfs"] = latest_val
            entry["updated_at"] = latest_time or entry.get("updated_at")
        elif var_code == "00065":
            entry["gauge_height_ft"] = latest_val
            entry["updated_at"] = latest_time or entry.get("updated_at")
    return out


# ---------------- Routes ----------------
@api_router.get("/")
async def root():
    return {"message": "RiverRight API", "status": "ok"}


@api_router.get("/rivers/featured")
async def get_featured_rivers():
    # Annotate which rivers have curated GeoJSON data available
    out = []
    for r in FEATURED_RIVERS:
        rr = dict(r)
        rr["has_curated_data"] = (CURATED_RUNS_DIR / r["id"]).exists()
        out.append(rr)
    return {"rivers": out}


@api_router.get("/rivers/{river_id}/polyline")
async def get_river_polyline(river_id: str):
    """Return curated river polyline as GeoJSON (WGS84). 404 if not curated yet."""
    river = next((r for r in FEATURED_RIVERS if r["id"] == river_id), None)
    if not river:
        raise HTTPException(404, "River not found")
    bundle = _load_curated(river_id)
    if not bundle or "polyline" not in bundle:
        raise HTTPException(404, "No curated polyline for this run")
    return bundle["polyline"]


@api_router.get("/rivers/{river_id}")
async def get_river(river_id: str):
    river = next((r for r in FEATURED_RIVERS if r["id"] == river_id), None)
    if not river:
        raise HTTPException(404, "River not found")
    # Make a shallow copy so we don't mutate the FEATURED_RIVERS entry.
    river = dict(river)
    # Surface curated extras sitting next to the run's geojson on disk:
    #   /app/data/runs/<id>/helpful_info.json   → river.helpful_info
    #   /app/data/runs/<id>/cfs_thresholds.json → drives per-river flow
    #                                             classification + popup
    curated = _load_curated(river_id) or {}
    if curated.get("helpful_info"):
        river["helpful_info"] = curated["helpful_info"]
    cfs_th = curated.get("cfs_thresholds") or None
    flow = None
    site_id = river.get("usgs_site_id")
    if site_id:
        try:
            payload = await fetch_usgs_iv([site_id])
            parsed = parse_iv_response(payload)
            site_data = parsed.get(site_id)
            if site_data:
                cls = classify_flow(site_data.get("cfs"), thresholds=cfs_th)
                flow = {**site_data, **cls}
        except Exception as e:
            logging.warning(f"USGS fetch failed for {site_id}: {e}")
    # Always attach the curated thresholds + attribution to the flow
    # payload (even when the live USGS fetch failed) so the river card's
    # tap-to-explain popup still has something to show.
    if cfs_th:
        if flow is None:
            flow = {}
        # Expose the raw thresholds so the client can render the
        # "Very low / Low / Normal / High" ranges in the popup.
        flow["thresholds"] = {
            k: cfs_th[k]
            for k in ("low_threshold", "normal_threshold", "high_threshold")
            if k in cfs_th
        }
        if cfs_th.get("datasource_attribution"):
            flow["datasource_attribution"] = cfs_th["datasource_attribution"]
    return {"river": river, "flow": flow}


@api_router.get("/usgs/sites/nearby")
async def usgs_sites_nearby(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_miles: float = Query(50.0, gt=0, le=200),
):
    """Find active USGS streamflow sites near a point.
    USGS bBox max is 1° x 1°, so we cap the bounding box at 1 degree."""
    # 1 deg lat ~ 69 miles. Convert radius to degrees, capped to 0.5 each side.
    deg_lat = min(0.5, radius_miles / 69.0)
    # 1 deg lon depends on latitude
    cos_lat = max(0.1, math.cos(math.radians(lat)))
    deg_lon = min(0.5, radius_miles / (69.0 * cos_lat))
    west = lon - deg_lon
    east = lon + deg_lon
    south = lat - deg_lat
    north = lat + deg_lat
    bbox = f"{west:.6f},{south:.6f},{east:.6f},{north:.6f}"

    params = {
        "format": "json",
        "bBox": bbox,
        "parameterCd": "00060",
        "siteStatus": "active",
        "siteType": "ST",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client_http:
            r = await client_http.get(USGS_IV_URL, params=params)
            r.raise_for_status()
            payload = r.json()
    except Exception as e:
        logging.error(f"USGS nearby fetch failed: {e}")
        raise HTTPException(502, "USGS service unavailable")

    sites_map = parse_iv_response(payload)
    sites = []
    for s in sites_map.values():
        if s.get("lat") is None or s.get("lon") is None:
            continue
        dist = haversine_miles(lat, lon, s["lat"], s["lon"])
        if dist > radius_miles:
            continue
        cls = classify_flow(s.get("cfs"))
        sites.append({**s, "distance_miles": round(dist, 2), **cls})
    sites.sort(key=lambda x: x["distance_miles"])
    return {"sites": sites, "count": len(sites)}


@api_router.get("/usgs/sites/search")
async def usgs_sites_search(q: str = Query(..., min_length=2)):
    """Search USGS sites by state code (2-letter) or by site number.
    For a quick MVP, accepts a 2-letter state code (e.g., 'CO') or a numeric site id."""
    q = q.strip()
    params: Dict[str, Any] = {
        "format": "json",
        "parameterCd": "00060",
        "siteStatus": "active",
        "siteType": "ST",
    }
    if q.isdigit():
        params["sites"] = q
    elif len(q) == 2 and q.isalpha():
        params["stateCd"] = q.lower()
    else:
        # Fall back: treat as state code if 2 chars, else error
        raise HTTPException(400, "Search by 2-letter state code (e.g., 'CO') or numeric site ID")

    try:
        async with httpx.AsyncClient(timeout=20.0) as client_http:
            r = await client_http.get(USGS_IV_URL, params=params)
            r.raise_for_status()
            payload = r.json()
    except Exception as e:
        logging.error(f"USGS search failed: {e}")
        raise HTTPException(502, "USGS service unavailable")

    sites_map = parse_iv_response(payload)
    sites = []
    for s in sites_map.values():
        cls = classify_flow(s.get("cfs"))
        sites.append({**s, **cls})
    # Limit to 100 for response size
    sites = sites[:100]
    return {"sites": sites, "count": len(sites)}


@api_router.get("/usgs/site/{site_id}")
async def usgs_site_detail(site_id: str):
    if not site_id.isdigit():
        raise HTTPException(400, "Invalid site id")
    try:
        payload = await fetch_usgs_iv([site_id])
    except Exception as e:
        logging.error(f"USGS site fetch failed: {e}")
        raise HTTPException(502, "USGS service unavailable")
    parsed = parse_iv_response(payload)
    site = parsed.get(site_id)
    if not site:
        # Fallback: site has no current discharge data — fetch site metadata only
        try:
            async with httpx.AsyncClient(timeout=15.0) as client_http:
                r = await client_http.get(USGS_SITE_URL, params={"format": "rdb", "sites": site_id, "siteStatus": "all"})
                r.raise_for_status()
                for line in r.text.splitlines():
                    if line.startswith("USGS\t"):
                        cols = line.split("\t")
                        if len(cols) > 6:
                            return {
                                "site_id": site_id, "name": cols[2],
                                "lat": float(cols[4]), "lon": float(cols[5]),
                                "cfs": None, "gauge_height_ft": None,
                                "updated_at": None, "status": "unknown", "label": "No data",
                            }
        except Exception:
            pass
        raise HTTPException(404, "Site not found or inactive")
    cls = classify_flow(site.get("cfs"))
    return {**site, **cls}


# ---------------- OSM POI (dynamic, cached) ----------------
def _bbox_for_river(river: Dict[str, Any], pad_deg: float = 0.05):
    """Compute bbox covering put-in and take-out with a small padding (~3 mi)."""
    lats = [river["put_in"]["lat"], river["take_out"]["lat"]]
    lons = [river["put_in"]["lon"], river["take_out"]["lon"]]
    south, north = min(lats) - pad_deg, max(lats) + pad_deg
    west, east = min(lons) - pad_deg, max(lons) + pad_deg
    return south, west, north, east


def _classify_osm(tags: Dict[str, str]) -> Optional[Dict[str, str]]:
    """Map OSM tags to a friendly category + icon hint."""
    ww = tags.get("whitewater")
    wway = tags.get("waterway")
    if ww == "rapid":
        return {"category": "Rapid", "kind": "rapid"}
    if ww == "play_spot":
        return {"category": "Play spot", "kind": "play"}
    if ww == "put_in":
        return {"category": "Put-in", "kind": "putin"}
    if ww == "egress" or ww == "take_out":
        return {"category": "Take-out", "kind": "takeout"}
    if ww == "portage_way" or ww == "portage":
        return {"category": "Portage", "kind": "portage"}
    if ww == "hazard":
        return {"category": "Hazard", "kind": "hazard"}
    if wway == "waterfall":
        return {"category": "Waterfall", "kind": "waterfall"}
    if wway == "rapids":
        return {"category": "Rapids", "kind": "rapid"}
    if wway == "dam":
        return {"category": "Dam", "kind": "hazard"}
    if wway == "weir":
        return {"category": "Weir", "kind": "hazard"}
    if tags.get("tourism") in ("camp_site", "camp_pitch") or tags.get("leisure") == "campground":
        return {"category": "Campground", "kind": "camp"}
    return None


@api_router.get("/rivers/{river_id}/osm-poi")
async def get_river_osm_pois(river_id: str):
    """Fetch dynamic POIs (whitewater/waterfall/dam/rapids/campgrounds) from
    OpenStreetMap via the Overpass API for the named river. Cached for 24h.
    Distance is computed along the actual river polyline (not haversine).

    If a curated GeoJSON dataset exists for this river (see /app/data/runs/<id>/),
    we serve that directly — much faster and higher quality than live Overpass.
    """
    river = next((r for r in FEATURED_RIVERS if r["id"] == river_id), None)
    if not river:
        raise HTTPException(404, "River not found")

    # --- Curated path: prefer high-quality user-supplied data when available ---
    curated = _load_curated(river_id)
    if curated and curated.get("pois"):
        # Build along-river positions using curated polyline if we have it
        river_pts: List[tuple] = []
        poly = curated.get("polyline")
        if poly:
            for feat in poly.get("features", []) or []:
                geom = feat.get("geometry") or {}
                gtype = geom.get("type")
                coords = geom.get("coordinates") or []
                if gtype == "LineString":
                    for pt in coords:
                        river_pts.append((pt[1], pt[0]))
                elif gtype == "MultiLineString":
                    for seg in coords:
                        for pt in seg:
                            river_pts.append((pt[1], pt[0]))

        cum_miles: List[float] = [0.0]
        for i in range(1, len(river_pts)):
            cum_miles.append(
                cum_miles[-1] + haversine_miles(river_pts[i - 1][0], river_pts[i - 1][1], river_pts[i][0], river_pts[i][1])
            )

        def project_to_river_curated(lat: float, lon: float) -> Optional[float]:
            if len(river_pts) < 2:
                return None
            best_dist = float("inf")
            best_pos = 0.0
            for i in range(len(river_pts) - 1):
                a = river_pts[i]
                b = river_pts[i + 1]
                dx = b[1] - a[1]
                dy = b[0] - a[0]
                seg_len_sq = dx * dx + dy * dy
                if seg_len_sq == 0:
                    t = 0.0
                    px, py = a[1], a[0]
                else:
                    t = ((lon - a[1]) * dx + (lat - a[0]) * dy) / seg_len_sq
                    t = max(0.0, min(1.0, t))
                    px = a[1] + t * dx
                    py = a[0] + t * dy
                d = haversine_miles(lat, lon, py, px)
                if d < best_dist:
                    best_dist = d
                    seg_len_mi = cum_miles[i + 1] - cum_miles[i]
                    best_pos = cum_miles[i] + t * seg_len_mi
            return best_pos

        putin_pos = project_to_river_curated(river["put_in"]["lat"], river["put_in"]["lon"])

        pois_out: List[Dict[str, Any]] = []
        for p in curated["pois"].get("pois", []) or []:
            lat = p.get("lat")
            lon = p.get("lon")
            if lat is None or lon is None:
                continue
            # Distance is measured along the river polyline from its FIRST point
            # (not from the put-in). project_to_river_curated returns cumulative miles
            # from the start of the polyline.
            poi_pos = project_to_river_curated(lat, lon)
            if poi_pos is not None:
                dist = poi_pos
            else:
                # Fall back to straight-line if no polyline (shouldn't happen in curated branch)
                dist = haversine_miles(river["put_in"]["lat"], river["put_in"]["lon"], lat, lon)
            kind = p.get("kind") or "rapid"
            name = p.get("name")
            if not name:
                if kind == "rapid":
                    name = "Unnamed rapid"
                elif kind == "note":
                    name = "Note"
                else:
                    name = kind.replace("_", " ").title()
            pois_out.append({
                "name": name,
                "category": p.get("category") or kind,
                "kind": kind,
                "lat": lat,
                "lon": lon,
                "distance_from_putin_mi": round(dist, 2),  # kept for back-compat; now = river-mi from polyline start
                "river_mi": round(dist, 2),
                "grade": p.get("grade"),
                "description": p.get("description"),
                "source": "curated",
            })
        pois_out.sort(key=lambda x: x["river_mi"])
        return {
            "pois": pois_out,
            "cached": True,
            "count": len(pois_out),
            "source": "curated",
        }

    # --- Fallback: live OSM Overpass query ---
    cached = _osm_poi_cache.get(river_id)
    now = time.time()
    if cached and cached[0] > now:
        return {"pois": cached[1], "cached": True}

    south, west, north, east = _bbox_for_river(river)
    bbox = f"{south:.5f},{west:.5f},{north:.5f},{east:.5f}"

    osm_names: List[str] = river.get("osm_names") or []
    safe_names = [n.replace('"', '\\"') for n in osm_names]
    name_regex = "^(" + "|".join(safe_names) + ")$" if safe_names else None

    if name_regex:
        # Fetch the river geometry (for along-river distance) AND POIs in one query
        query = f"""
        [out:json][timeout:30];
        way["waterway"~"^(river|stream)$"]["name"~"{name_regex}"]({bbox})->.river;
        (
          .river;
          node(around.river:300)["whitewater"];
          way(around.river:300)["whitewater"];
          node(around.river:300)["waterway"="waterfall"];
          node(around.river:300)["waterway"="rapids"];
          way(around.river:300)["waterway"="rapids"];
          node(around.river:300)["waterway"="dam"];
          way(around.river:300)["waterway"="dam"];
          node(around.river:300)["waterway"="weir"];
          node(around.river:400)["tourism"="camp_site"];
          node(around.river:400)["tourism"="camp_pitch"];
          node(around.river:400)["leisure"="campground"];
          way(around.river:400)["leisure"="campground"];
        );
        out tags geom 200;
        """.strip()
    else:
        query = f"""
        [out:json][timeout:25];
        (
          node["whitewater"]({bbox});
          way["whitewater"]({bbox});
          node["waterway"="waterfall"]({bbox});
          node["waterway"="rapids"]({bbox});
          way["waterway"="rapids"]({bbox});
          node["waterway"="dam"]({bbox});
          way["waterway"="dam"]({bbox});
          node["waterway"="weir"]({bbox});
          node["tourism"="camp_site"]({bbox});
          node["leisure"="campground"]({bbox});
        );
        out tags center 80;
        """.strip()

    payload = None
    last_err: Optional[str] = None
    for url in OVERPASS_URLS:
        try:
            async with httpx.AsyncClient(timeout=12.0, headers={"User-Agent": "RiverRight/1.0 (river-info app)"}) as client_http:
                r = await client_http.post(url, content=query.encode("utf-8"), headers={"Content-Type": "text/plain"})
                if r.status_code == 200:
                    payload = r.json()
                    break
                last_err = f"{url} -> {r.status_code}"
        except Exception as e:
            last_err = f"{url} -> {e}"
            continue
    if payload is None:
        logging.warning(f"Overpass fetch failed for {river_id}: {last_err}")
        # Cache an empty result for a short time so we don't hammer the API
        _osm_poi_cache[river_id] = (now + 5 * 60, [])
        return {"pois": [], "cached": False, "error": "osm_unavailable"}

    pois: List[Dict[str, Any]] = []
    # Extract river polyline geometry for along-river distance computation
    river_pts: List[tuple] = []
    for el in payload.get("elements", []) or []:
        tags = el.get("tags", {}) or {}
        if tags.get("waterway") in ("river", "stream") and tags.get("name") and el.get("type") == "way":
            geom = el.get("geometry", []) or []
            for pt in geom:
                if pt.get("lat") is not None and pt.get("lon") is not None:
                    river_pts.append((pt["lat"], pt["lon"]))

    # Pre-compute cumulative miles along the polyline so we can map any point
    # to a position along the river quickly.
    cum_miles: List[float] = [0.0]
    for i in range(1, len(river_pts)):
        cum_miles.append(
            cum_miles[-1] + haversine_miles(river_pts[i - 1][0], river_pts[i - 1][1], river_pts[i][0], river_pts[i][1])
        )

    def project_to_river(lat: float, lon: float) -> Optional[float]:
        """Return the cumulative-miles position of (lat, lon) along the river polyline.
        None if no river geometry is available."""
        if len(river_pts) < 2:
            return None
        best_dist = float("inf")
        best_pos = 0.0
        for i in range(len(river_pts) - 1):
            a = river_pts[i]
            b = river_pts[i + 1]
            # Approximate projection onto segment (lat/lon plane is OK over short distances)
            dx = b[1] - a[1]
            dy = b[0] - a[0]
            seg_len_sq = dx * dx + dy * dy
            if seg_len_sq == 0:
                t = 0.0
                px, py = a[1], a[0]
            else:
                t = ((lon - a[1]) * dx + (lat - a[0]) * dy) / seg_len_sq
                t = max(0.0, min(1.0, t))
                px = a[1] + t * dx
                py = a[0] + t * dy
            d = haversine_miles(lat, lon, py, px)
            if d < best_dist:
                best_dist = d
                # Cumulative miles: cum_miles[i] + t * length(seg_i)
                seg_len_mi = cum_miles[i + 1] - cum_miles[i]
                best_pos = cum_miles[i] + t * seg_len_mi
        return best_pos

    # Compute put-in's position along the river
    putin_pos = project_to_river(river["put_in"]["lat"], river["put_in"]["lon"])

    for el in payload.get("elements", []) or []:
        tags = el.get("tags", {}) or {}
        # Skip the river way elements themselves
        if tags.get("waterway") in ("river", "stream") and not (tags.get("whitewater") or tags.get("waterway") in ("waterfall", "rapids", "dam", "weir")):
            continue
        cls = _classify_osm(tags)
        if not cls:
            continue
        if el.get("type") == "node":
            lat, lon = el.get("lat"), el.get("lon")
        else:
            geom = el.get("geometry") or []
            if geom:
                lat, lon = geom[0].get("lat"), geom[0].get("lon")
            else:
                center = el.get("center", {}) or {}
                lat, lon = center.get("lat"), center.get("lon")
        if lat is None or lon is None:
            continue
        name = (
            tags.get("name")
            or tags.get("whitewater:rapid_name")
            or tags.get("ref")
            or cls["category"]
        )
        pi = river["put_in"]
        # Distance is measured along the river polyline from its FIRST point
        # (not from the put-in). project_to_river returns cumulative miles from start.
        poi_pos = project_to_river(lat, lon)
        if poi_pos is not None:
            dist = poi_pos
        else:
            # Fallback to haversine if no river geometry was returned by OSM
            dist = haversine_miles(pi["lat"], pi["lon"], lat, lon)
        grade = tags.get("whitewater:rapid_grade") or tags.get("whitewater:section_grade")
        pois.append({
            "name": name,
            "category": cls["category"],
            "kind": cls["kind"],
            "lat": lat,
            "lon": lon,
            "distance_from_putin_mi": round(dist, 2),  # kept for back-compat; now = river-mi from polyline start
            "river_mi": round(dist, 2),
            "grade": grade,
        })

    pois.sort(key=lambda x: x["river_mi"])
    pois = pois[:60]
    _osm_poi_cache[river_id] = (now + _OSM_TTL_SECONDS, pois)
    return {"pois": pois, "cached": False, "count": len(pois)}


app.include_router(api_router)


# Pre-warm the OSM POI cache on startup so users see results instantly.
# Staggered + low-priority to avoid hammering Overpass.
@app.on_event("startup")
async def warm_osm_poi_cache():
    async def warm():
        # Wait a few seconds so the app is responsive first
        await asyncio.sleep(3)
        for r in FEATURED_RIVERS:
            # Skip rivers with curated data — they serve instantly from disk
            if (CURATED_RUNS_DIR / r["id"]).exists():
                continue
            try:
                await get_river_osm_pois(r["id"])
            except Exception as e:
                logging.warning(f"warm fail {r['id']}: {e}")
            await asyncio.sleep(0.8)
        logging.info("OSM POI cache warm-up complete")
    asyncio.create_task(warm())

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
