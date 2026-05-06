from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from typing import List, Optional, Any, Dict
import httpx
import math

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

app = FastAPI()
api_router = APIRouter(prefix="/api")

USGS_IV_URL = "https://waterservices.usgs.gov/nwis/iv/"
USGS_SITE_URL = "https://waterservices.usgs.gov/nwis/site/"

# Discharge (cfs) parameter code = 00060, Gauge height (ft) = 00065

# ---------------- Featured Rivers (curated USA whitewater + calm) ----------------
FEATURED_RIVERS: List[Dict[str, Any]] = [
    {
        "id": "colorado-grand-canyon",
        "name": "Colorado River — Grand Canyon",
        "state": "AZ",
        "class_rating": "III–V",
        "type": "whitewater",
        "description": "Iconic 277-mile expedition through the Grand Canyon. Big-water hydraulics, towering cliffs, world-class rapids.",
        "hazards": ["Massive holes (Lava Falls, Crystal)", "Cold water year-round", "Remote — multi-day commitment"],
        "put_in": {"name": "Lees Ferry", "lat": 36.8650, "lon": -111.5883},
        "take_out": {"name": "Diamond Creek", "lat": 35.7700, "lon": -113.3700},
        "usgs_site_id": "09380000",
        "image": "https://images.unsplash.com/photo-1729906003626-c867d5dd4b19?crop=entropy&cs=srgb&fm=jpg&w=800&q=85"
    },
    {
        "id": "gauley-river",
        "name": "Gauley River",
        "state": "WV",
        "class_rating": "IV–V",
        "type": "whitewater",
        "description": "Legendary fall release run. 100+ rapids in 25 miles — 'Beast of the East'.",
        "hazards": ["Pillow Rock", "Sweet's Falls — mandatory scout", "Strainers and undercuts"],
        "put_in": {"name": "Summersville Dam", "lat": 38.2256, "lon": -80.8831},
        "take_out": {"name": "Swiss", "lat": 38.1853, "lon": -81.0903},
        "usgs_site_id": "03189600",
        "image": "https://images.unsplash.com/photo-1729906003626-c867d5dd4b19?crop=entropy&cs=srgb&fm=jpg&w=800&q=85"
    },
    {
        "id": "ocoee-river",
        "name": "Ocoee River (Middle)",
        "state": "TN",
        "class_rating": "III–IV",
        "type": "whitewater",
        "description": "1996 Olympic whitewater venue. Continuous, technical, and tons of fun.",
        "hazards": ["Hell Hole hydraulic", "Crashing rocks just below put-in"],
        "put_in": {"name": "Ocoee #2 Powerhouse", "lat": 35.0719, "lon": -84.5239},
        "take_out": {"name": "Rogers Branch", "lat": 35.0628, "lon": -84.5878},
        "usgs_site_id": "03566425",
        "image": "https://images.unsplash.com/photo-1729906003626-c867d5dd4b19?crop=entropy&cs=srgb&fm=jpg&w=800&q=85"
    },
    {
        "id": "deschutes-river",
        "name": "Deschutes River (Lower)",
        "state": "OR",
        "class_rating": "II–III",
        "type": "mixed",
        "description": "Classic multi-day desert canyon run. Mix of calm flatwater and fun rapids.",
        "hazards": ["Whitehorse Rapid (III+)", "Hot summer temps — bring water"],
        "put_in": {"name": "Warm Springs", "lat": 44.7639, "lon": -121.2722},
        "take_out": {"name": "Maupin", "lat": 45.1751, "lon": -121.0833},
        "usgs_site_id": "14092500",
        "image": "https://images.unsplash.com/photo-1695918431205-b70d3d43b332?crop=entropy&cs=srgb&fm=jpg&w=800&q=85"
    },
    {
        "id": "rogue-river",
        "name": "Rogue River (Wild Section)",
        "state": "OR",
        "class_rating": "II–IV",
        "type": "mixed",
        "description": "Federally designated Wild & Scenic. 34 miles of pristine canyon, salmon, and a few big drops.",
        "hazards": ["Rainie Falls (V) — most portage", "Blossom Bar — complex maneuvering"],
        "put_in": {"name": "Grave Creek", "lat": 42.6500, "lon": -123.5833},
        "take_out": {"name": "Foster Bar", "lat": 42.6831, "lon": -123.9319},
        "usgs_site_id": "14372300",
        "image": "https://images.unsplash.com/photo-1695918431205-b70d3d43b332?crop=entropy&cs=srgb&fm=jpg&w=800&q=85"
    },
    {
        "id": "buffalo-national-river",
        "name": "Buffalo National River",
        "state": "AR",
        "class_rating": "I–II",
        "type": "calm",
        "description": "America's first National River. Crystal-clear water through Ozark bluffs — perfect for canoes.",
        "hazards": ["Strainers in spring high water", "Low flows in late summer"],
        "put_in": {"name": "Ponca", "lat": 36.0411, "lon": -93.3624},
        "take_out": {"name": "Pruitt", "lat": 35.9672, "lon": -93.1939},
        "usgs_site_id": "07055875",
        "image": "https://images.unsplash.com/photo-1695918431205-b70d3d43b332?crop=entropy&cs=srgb&fm=jpg&w=800&q=85"
    },
    {
        "id": "delaware-river",
        "name": "Delaware River (Upper)",
        "state": "PA/NY",
        "class_rating": "I–II",
        "type": "calm",
        "description": "Family-friendly float through wooded valleys. Easy access, eagles, and gentle riffles.",
        "hazards": ["Skinner's Falls (II)", "Cold water in spring"],
        "put_in": {"name": "Hancock", "lat": 41.9468, "lon": -75.2807},
        "take_out": {"name": "Narrowsburg", "lat": 41.6076, "lon": -75.0556},
        "usgs_site_id": "01427510",
        "image": "https://images.unsplash.com/photo-1695918431205-b70d3d43b332?crop=entropy&cs=srgb&fm=jpg&w=800&q=85"
    },
    {
        "id": "arkansas-river-numbers",
        "name": "Arkansas River — The Numbers",
        "state": "CO",
        "class_rating": "IV",
        "type": "whitewater",
        "description": "Steep, continuous Class IV through high-altitude granite. Rapids 1 through 7 — non-stop action.",
        "hazards": ["Continuous gradient — no rest", "Cold snowmelt water"],
        "put_in": {"name": "Number 1", "lat": 38.8500, "lon": -106.1500},
        "take_out": {"name": "Railroad Bridge", "lat": 38.8167, "lon": -106.0833},
        "usgs_site_id": "07091200",
        "image": "https://images.unsplash.com/photo-1729906003626-c867d5dd4b19?crop=entropy&cs=srgb&fm=jpg&w=800&q=85"
    }
]


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def classify_flow(cfs: Optional[float]) -> Dict[str, str]:
    """Heuristic flow classification when only CFS is known.
    For an MVP without per-river ranges, we use coarse buckets."""
    if cfs is None:
        return {"status": "unknown", "label": "No data"}
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
    return {"message": "RiverRunner API", "status": "ok"}


@api_router.get("/rivers/featured")
async def get_featured_rivers():
    return {"rivers": FEATURED_RIVERS}


@api_router.get("/rivers/{river_id}")
async def get_river(river_id: str):
    river = next((r for r in FEATURED_RIVERS if r["id"] == river_id), None)
    if not river:
        raise HTTPException(404, "River not found")
    flow = None
    site_id = river.get("usgs_site_id")
    if site_id:
        try:
            payload = await fetch_usgs_iv([site_id])
            parsed = parse_iv_response(payload)
            site_data = parsed.get(site_id)
            if site_data:
                cls = classify_flow(site_data.get("cfs"))
                flow = {**site_data, **cls}
        except Exception as e:
            logging.warning(f"USGS fetch failed for {site_id}: {e}")
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
        raise HTTPException(404, "Site not found or inactive")
    cls = classify_flow(site.get("cfs"))
    return {**site, **cls}


app.include_router(api_router)

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
