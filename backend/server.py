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
    # Only released runs are active here. To release another run from the
    # _UNRELEASED_RIVERS list below, cut its dict and paste it into this list.
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

# Rivers that are documented but NOT yet polished/curated enough for release.
# When a run is ready, move its dict into FEATURED_RIVERS above.
_UNRELEASED_RIVERS: List[Dict[str, Any]] = [
    {
        "id": "colorado-grand-canyon",
        "name": "Colorado River — Grand Canyon",
        "state": "AZ",
        "class_rating": "III–V",
        "type": "whitewater",
        "osm_names": ["Colorado River"],
        "description": "Iconic 277-mile expedition through the Grand Canyon. Big-water hydraulics, towering cliffs, world-class rapids.",
        "hazards": ["Massive holes (Lava Falls, Crystal)", "Cold water year-round", "Remote — multi-day commitment"],
        "points_of_interest": [
            "Mile 11.2 — Soap Creek (III): wave train; stay center-right",
            "Mile 76.5 — Hance (VIII on GC scale): rocky entry, scout river-left",
            "Mile 98 — Crystal (VIII–X): huge hole on river-right, run far left",
            "Mile 179.7 — Lava Falls (IX–X): biggest rapid; scout from right, bubble line entry",
            "Mile 225 — Diamond Peak: take-out warning — eddy out river-left early",
        ],
        "put_in": {"name": "Lees Ferry", "lat": 36.8650, "lon": -111.5883},
        "take_out": {"name": "Diamond Creek", "lat": 35.7700, "lon": -113.3700},
        "usgs_site_id": "09380000",
        "image": "https://images.unsplash.com/photo-1629248457649-b082812aea6c?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "gauley-river",
        "name": "Gauley River",
        "state": "WV",
        "class_rating": "IV–V",
        "type": "whitewater",
        "osm_names": ["Gauley River"],
        "description": "Legendary fall release run. 100+ rapids in 25 miles — 'Beast of the East'.",
        "hazards": ["Pillow Rock", "Sweet's Falls — mandatory scout", "Strainers and undercuts"],
        "points_of_interest": [
            "Initiation (IV): warm-up rapid 1/4 mile below put-in",
            "Insignificant (V): boat-eating hole at the bottom — punch left",
            "Pillow Rock (V): massive cushion wave on river-left rock; right-line is cleaner",
            "Lost Paddle (V): four-stage rapid; eddies on the right between drops",
            "Iron Ring (IV+): the namesake bolt is gone but the hole isn't",
            "Sweet's Falls (V): 14ft drop — mandatory scout river-right; boof the lip",
        ],
        "put_in": {"name": "Summersville Dam", "lat": 38.2256, "lon": -80.8831},
        "take_out": {"name": "Swiss", "lat": 38.1853, "lon": -81.0903},
        "usgs_site_id": "03189600",
        "image": "https://images.unsplash.com/photo-1767471716671-60052b672451?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "ocoee-river",
        "name": "Ocoee River (Middle)",
        "state": "TN",
        "class_rating": "III–IV",
        "type": "whitewater",
        "osm_names": ["Ocoee River"],
        "description": "1996 Olympic whitewater venue. Continuous, technical, and tons of fun.",
        "hazards": ["Hell Hole hydraulic", "Crashing rocks just below put-in"],
        "points_of_interest": [
            "Grumpy's (III): first rapid; rocky launch",
            "Broken Nose (III+): three-staged; left line cleanest",
            "Double Suck (III): two consecutive holes — keep momentum",
            "Double Trouble (III+): aerated trough; eddy out right after",
            "Tablesaw (III+): wave train — surfable wave at lower flows",
            "Hell Hole (IV): retentive hydraulic — punch right of the pourover",
            "Powerhouse (III): final drop, take-out 200 yards below river-left",
        ],
        "put_in": {"name": "Ocoee #2 Powerhouse", "lat": 35.0719, "lon": -84.5239},
        "take_out": {"name": "Rogers Branch", "lat": 35.0628, "lon": -84.5878},
        "usgs_site_id": "03559500",
        "image": "https://images.unsplash.com/photo-1767471716671-60052b672451?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "deschutes-river",
        "name": "Deschutes River (Lower)",
        "state": "OR",
        "class_rating": "II–III",
        "type": "mixed",
        "osm_names": ["Deschutes River"],
        "description": "Classic multi-day desert canyon run. Mix of calm flatwater and fun rapids.",
        "hazards": ["Whitehorse Rapid (III+)", "Hot summer temps — bring water"],
        "points_of_interest": [
            "Trout Creek (II): warm-up wave train below put-in",
            "Whitehorse (III+): biggest rapid — scout river-right, hole on left",
            "Boxcar (III): big waves at higher flows; straightforward",
            "Surf Rapid (II+): great play wave at 3,500–4,500 cfs",
            "Oak Springs (III): railroad bridge marks entry; keep right",
        ],
        "put_in": {"name": "Warm Springs", "lat": 44.7639, "lon": -121.2722},
        "take_out": {"name": "Maupin", "lat": 45.1751, "lon": -121.0833},
        "usgs_site_id": "14092500",
        "image": "https://images.unsplash.com/photo-1707261897515-834d5b65c12b?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "rogue-river",
        "name": "Rogue River (Wild Section)",
        "state": "OR",
        "class_rating": "II–IV",
        "type": "mixed",
        "osm_names": ["Rogue River"],
        "description": "Federally designated Wild & Scenic. 34 miles of pristine canyon, salmon, and a few big drops.",
        "hazards": ["Rainie Falls (V) — most portage", "Blossom Bar — complex maneuvering"],
        "points_of_interest": [
            "Rainie Falls (V): 12ft drop — most parties take fish ladder river-right",
            "Tyee Rapid (III): long wave train",
            "Wildcat (III): rocky entry, eddy on the right",
            "Mule Creek Canyon: narrow walls and Coffeepot eddy — watch for boils",
            "Blossom Bar (IV): rock-dodging maze; avoid the Picket Fence on the left",
            "Devil's Staircase (III+): three-tiered drop near Paradise Lodge",
        ],
        "put_in": {"name": "Grave Creek", "lat": 42.6500, "lon": -123.5833},
        "take_out": {"name": "Foster Bar", "lat": 42.6831, "lon": -123.9319},
        "usgs_site_id": "14372300",
        "image": "https://images.pexels.com/photos/34921063/pexels-photo-34921063.jpeg?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "buffalo-national-river",
        "name": "Buffalo National River",
        "state": "AR",
        "class_rating": "I–II",
        "type": "calm",
        "osm_names": ["Buffalo National River", "Buffalo River"],
        "description": "America's first National River. Crystal-clear water through Ozark bluffs — perfect for canoes.",
        "hazards": ["Strainers in spring high water", "Low flows in late summer"],
        "points_of_interest": [
            "Ponca low-water bridge: scout for clearance below 3 ft on the gauge",
            "Big Bluff (Goat Trail): towering cliffs river-right — calm pool below",
            "Hemmed-In Hollow: side hike to 200ft waterfall, eddy in on the left",
            "Gray Rock: small wave train with a sticky hole on the right at high water",
            "Steel Creek: prime camping eddy — pull in river-left before the bend",
        ],
        "put_in": {"name": "Ponca", "lat": 36.0411, "lon": -93.3624},
        "take_out": {"name": "Pruitt", "lat": 35.9672, "lon": -93.1939},
        "usgs_site_id": "07055875",
        "image": "https://images.unsplash.com/photo-1667198714117-857b9af745ef?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "delaware-river",
        "name": "Delaware River (Upper)",
        "state": "PA/NY",
        "class_rating": "I–II",
        "type": "calm",
        "osm_names": ["Delaware River"],
        "description": "Family-friendly float through wooded valleys. Easy access, eagles, and gentle riffles.",
        "hazards": ["Skinner's Falls (II)", "Cold water in spring"],
        "points_of_interest": [
            "Hancock confluence: East and West Branches join — easy launch",
            "Buckingham Access: mid-trip stop with restrooms",
            "Big Eddy: slow deep pool — popular swimming hole",
            "Skinner's Falls (II): ledge drop — run center-right; scout on the left in spring",
            "Narrowsburg deep hole: 113ft deepest point on the river",
        ],
        "put_in": {"name": "Hancock", "lat": 41.9468, "lon": -75.2807},
        "take_out": {"name": "Narrowsburg", "lat": 41.6076, "lon": -75.0556},
        "usgs_site_id": "01427510",
        "image": "https://images.unsplash.com/photo-1634712901426-5f7a7443c703?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "arkansas-river-numbers",
        "name": "Arkansas River — The Numbers",
        "state": "CO",
        "class_rating": "IV",
        "type": "whitewater",
        "osm_names": ["Arkansas River"],
        "description": "Steep, continuous Class IV through high-altitude granite. Rapids 1 through 7 — non-stop action.",
        "hazards": ["Continuous gradient — no rest", "Cold snowmelt water"],
        "points_of_interest": [
            "Number 1 (IV): big drop right at the put-in — be warmed up",
            "Number 2 (IV): rocky maze — eddy hop on the right",
            "Number 3 (IV+): the crux — boat-eating hole left-center, sneak right",
            "Number 4 (IV): wave train; surfable at medium flows",
            "Number 5 (IV+): tight slot move; scout river-right",
            "Number 6–7 (III+): final wave trains to Railroad Bridge take-out",
        ],
        "put_in": {"name": "Numbers Put-in", "lat": 39.0220, "lon": -106.2425},
        "take_out": {"name": "Railroad Bridge", "lat": 38.9450, "lon": -106.1815},
        "usgs_site_id": "07091200",
        "image": "https://images.unsplash.com/photo-1762943107260-d080e13266b3?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "new-river-gorge",
        "name": "New River Gorge",
        "state": "WV",
        "class_rating": "III–V",
        "type": "whitewater",
        "osm_names": ["New River"],
        "description": "Classic Appalachian big-water through a 1,000-ft gorge. Pool-drop with huge waves and surf-friendly hydraulics.",
        "hazards": [
            "Large hydraulics at high water (>3 ft Thurmond)",
            "Limited eddies between rapids in the lower gorge",
        ],
        "points_of_interest": [
            "Surprise (III): warm-up wave train at the put-in",
            "Upper Railroad (IV): big waves; right line is cleanest",
            "Double Z (IV): boulder maze — scout from river-left",
            "Greyhound Bus Stopper (IV): the namesake hole; sneak right",
            "Lower Keeney (IV): tight slot with a sticky hole left",
            "Fayette Station Rapid (IV): final rapid under the bridge",
        ],
        "put_in": {"name": "Cunard", "lat": 37.9347, "lon": -81.0786},
        "take_out": {"name": "Fayette Station", "lat": 38.0697, "lon": -81.0728},
        "usgs_site_id": "03185400",
        "image": "https://images.unsplash.com/photo-1624646580989-9f059e25eb78?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "nantahala-river",
        "name": "Nantahala River",
        "state": "NC",
        "class_rating": "II–III",
        "type": "mixed",
        "osm_names": ["Nantahala River"],
        "description": "Cold, dam-controlled run through the Nantahala Gorge. Reliable summer flows; great intro to whitewater.",
        "hazards": [
            "Cold water year-round (~50°F)",
            "Crowds — release schedule",
        ],
        "points_of_interest": [
            "Patton's Run (III): right at the put-in below the powerhouse",
            "Surfing Rapid: long playwave, mid-river",
            "Delebar's Rock (III): rocky shelf on river-right",
            "Nantahala Falls (III): the finale — scout left, run right of the central rock",
        ],
        "put_in": {"name": "Powerhouse", "lat": 35.2708, "lon": -83.6486},
        "take_out": {"name": "Ferebee Memorial / NOC", "lat": 35.3306, "lon": -83.6097},
        "usgs_site_id": "03504000",
        "image": "https://images.pexels.com/photos/33025530/pexels-photo-33025530.jpeg?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "lower-youghiogheny",
        "name": "Lower Youghiogheny",
        "state": "PA",
        "class_rating": "III–IV",
        "type": "whitewater",
        "osm_names": ["Youghiogheny River"],
        "description": "Pennsylvania's most-rafted whitewater. Fun pool-drop with great surfing and forgiving lines.",
        "hazards": [
            "Entrance Rapid right at the put-in — be ready",
            "Strainers along the wooded banks",
        ],
        "points_of_interest": [
            "Entrance (III+): immediately below the launch",
            "Cucumber (III): wave train into a hard right turn",
            "Railroad (III): long rapid with multiple holes",
            "Dimple Rock (IV): undercut rock river-right — stay left",
            "Swimmer's Rapid (III): the last big drop",
            "River's End (III): final rapid before Bruner Run take-out",
        ],
        "put_in": {"name": "Ohiopyle", "lat": 39.8689, "lon": -79.4914},
        "take_out": {"name": "Bruner Run", "lat": 39.9325, "lon": -79.5575},
        "usgs_site_id": "03082500",
        "image": "https://images.unsplash.com/photo-1762943107260-d080e13266b3?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "upper-youghiogheny",
        "name": "Upper Youghiogheny",
        "state": "MD",
        "class_rating": "IV–V",
        "type": "whitewater",
        "osm_names": ["Youghiogheny River"],
        "description": "Steep, technical Class IV-V. Continuous rapids in a tight gorge — committing run with limited bail-out.",
        "hazards": [
            "Continuous gradient (~115 ft/mi) — limited recovery",
            "Several mandatory boofs over keeper holes",
        ],
        "points_of_interest": [
            "Gap Falls (IV): warm-up boof a half-mile in",
            "Bastard (V): tight slot — scout river-left",
            "Charlie's Choice (IV+): the crux move",
            "Triple Drop (V): three-tiered staircase",
            "National Falls (IV+): big boof landing",
            "Powerful Popper (IV): exit rapid before Friendsville",
        ],
        "put_in": {"name": "Sang Run", "lat": 39.5722, "lon": -79.4136},
        "take_out": {"name": "Friendsville", "lat": 39.6647, "lon": -79.4072},
        "usgs_site_id": "03075500",
        "image": "https://images.unsplash.com/photo-1658355686821-f412c8397a0d?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "chattooga-section-iv",
        "name": "Chattooga River — Section IV",
        "state": "GA/SC",
        "class_rating": "IV–V",
        "type": "whitewater",
        "osm_names": ["Chattooga River"],
        "description": "Wild & Scenic gem on the GA/SC line. The 'Deliverance' run — committing wilderness Class IV-V with the famous Five Falls finale.",
        "hazards": [
            "Five Falls — back-to-back drops with scout/portage points",
            "Long carry-out at Lake Tugaloo",
        ],
        "points_of_interest": [
            "Bull Sluice (IV+): right above the put-in for some — check at Hwy 76",
            "Screaming Left Turn (IV)",
            "Rock Jumble (III+): obstacle course leading into Five Falls",
            "Entrance / Corkscrew / Crack-in-the-Rock (IV+): scout left",
            "Jawbone (IV+): undercut on river-left — line is right",
            "Sock-em-Dog (V): final drop before Lake Tugaloo flatwater",
        ],
        "put_in": {"name": "Hwy 76 Bridge", "lat": 34.8147, "lon": -83.3072},
        "take_out": {"name": "Lake Tugaloo", "lat": 34.7572, "lon": -83.2906},
        "usgs_site_id": "02177000",
        "image": "https://images.unsplash.com/photo-1762943107260-d080e13266b3?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "salmon-main-lower",
        "name": "Lower Salmon River",
        "state": "ID",
        "class_rating": "III–IV",
        "type": "mixed",
        "osm_names": ["Salmon River"],
        "description": "Multi-day desert canyon trip. Big-water sand-bar camping with classic Idaho rapids — the 'River of No Return'.",
        "hazards": [
            "Big water at high flows (>40k cfs) — huge waves and holes",
            "Long shuttle and remote take-out at Heller Bar",
        ],
        "points_of_interest": [
            "Lake Creek Rapid (III): the warm-up",
            "Half-and-Half (III+): half wave, half hole",
            "Snow Hole (IV): biggest rapid — scout river-right",
            "China Rapid (III+): wave train at the canyon mouth",
            "Eye-of-the-Needle (III): tight finish in the lower canyon",
        ],
        "put_in": {"name": "Hammer Creek", "lat": 45.8506, "lon": -116.3322},
        "take_out": {"name": "Heller Bar", "lat": 45.9819, "lon": -116.7464},
        "usgs_site_id": "13317000",
        "image": "https://images.unsplash.com/photo-1626594995085-36b551227b9a?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "snake-hells-canyon",
        "name": "Snake River — Hells Canyon",
        "state": "ID/OR",
        "class_rating": "III–IV",
        "type": "whitewater",
        "osm_names": ["Snake River"],
        "description": "Deepest river gorge in North America. Big-volume Class IV rapids with massive waves and rolling holes.",
        "hazards": [
            "Wild Sheep & Granite — huge hydraulics at high water",
            "Long, remote shuttle",
        ],
        "points_of_interest": [
            "Battle Creek (II+): warm-up below the dam",
            "Wild Sheep (IV): the biggest rapid — scout river-right",
            "Granite Creek (IV): right after Wild Sheep, big lateral wave",
            "Waterspout (III+): named for its huge spout-like wave",
            "Rush Creek (III): playful wave train",
        ],
        "put_in": {"name": "Hells Canyon Dam", "lat": 45.2422, "lon": -116.6997},
        "take_out": {"name": "Pittsburg Landing", "lat": 45.6378, "lon": -116.4561},
        "usgs_site_id": "13290450",
        "image": "https://images.unsplash.com/photo-1762943107260-d080e13266b3?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "wenatchee-river",
        "name": "Wenatchee River",
        "state": "WA",
        "class_rating": "III",
        "type": "mixed",
        "osm_names": ["Wenatchee River"],
        "description": "Pacific Northwest classic. Big, splashy Class III wave-trains through orchards in the Cascade foothills.",
        "hazards": [
            "Cold snowmelt water in spring",
            "Boulder Bend strainer at low flows",
        ],
        "points_of_interest": [
            "Rock 'n Roll (III): long wave train",
            "Drunkard's Drop (III): named for its surprising kick",
            "Granny's Hole (III): river-wide hole — sneak left",
            "Snowblind (III): final rapid below Cashmere",
        ],
        "put_in": {"name": "Tumwater Canyon", "lat": 47.6411, "lon": -120.6814},
        "take_out": {"name": "Cashmere", "lat": 47.5236, "lon": -120.4717},
        "usgs_site_id": "12462500",
        "image": "https://images.pexels.com/photos/33025530/pexels-photo-33025530.jpeg?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "tuolumne-river",
        "name": "Tuolumne River",
        "state": "CA",
        "class_rating": "IV–V",
        "type": "whitewater",
        "osm_names": ["Tuolumne River"],
        "description": "California's Wild & Scenic Tuolumne — pool-drop Class IV granite gorge. Considered one of the best multi-day wilderness runs in the West.",
        "hazards": [
            "Clavey Falls — scout/portage; multiple lines",
            "Cold Hetch Hetchy releases",
        ],
        "points_of_interest": [
            "Rock Garden (III+): warm-up technical paddle",
            "Nemesis (IV): tight slot with a hidden hole",
            "Sunderland's Chute (IV): big drop with a ramp",
            "Clavey Falls (V): the crux — scout right",
            "Gray's Grindstone (IV): long boulder garden",
            "Pinball (IV): exit rapid before Ward's Ferry",
        ],
        "put_in": {"name": "Meral's Pool (Lumsden)", "lat": 37.8753, "lon": -120.1442},
        "take_out": {"name": "Ward's Ferry", "lat": 37.8364, "lon": -120.2675},
        "usgs_site_id": "11290000",
        "image": "https://images.unsplash.com/photo-1629248457649-b082812aea6c?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "french-broad-river",
        "name": "French Broad River",
        "state": "NC",
        "class_rating": "II–III",
        "type": "mixed",
        "osm_names": ["French Broad River"],
        "description": "Big-volume mountain run through the Blue Ridge. Friendly Class II–III with great swimming and surfing all summer long.",
        "hazards": [
            "Powerhouse releases can spike flows quickly",
            "Strainers along banks at low water",
        ],
        "points_of_interest": [
            "Frank Bell's Rapid (III): the warm-up wave train",
            "Big Pillow (III): namesake pillow rock — pass on either side",
            "Stair Step (III): three-stage drop",
            "Kayaker's Ledge: surfable wave at moderate flows",
        ],
        "put_in": {"name": "Barnard", "lat": 35.7847, "lon": -82.7008},
        "take_out": {"name": "Hot Springs", "lat": 35.8939, "lon": -82.8275},
        "usgs_site_id": "03453500",
        "image": "https://images.unsplash.com/photo-1707261897515-834d5b65c12b?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "arkansas-royal-gorge",
        "name": "Arkansas River — Royal Gorge",
        "state": "CO",
        "class_rating": "IV",
        "type": "whitewater",
        "osm_names": ["Arkansas River"],
        "description": "Big-water Class IV through the spectacular 1,000-foot Royal Gorge. Dramatic granite walls and the famous Hanging Bridge overhead.",
        "hazards": [
            "Sunshine Falls — biggest rapid; scout from train tracks",
            "Limited eddies between rapids",
        ],
        "points_of_interest": [
            "Squeeze Play (III+): tight slot near the put-in",
            "Sunshine Falls (IV): the crux drop — scout left",
            "Wall Slammer (III+): named for the granite wall",
            "Boateater (IV): keeper hole at high water — sneak right",
            "Soda Pop (III): final wave train below the gorge",
        ],
        "put_in": {"name": "Parkdale", "lat": 38.4922, "lon": -105.4275},
        "take_out": {"name": "Cañon City", "lat": 38.4406, "lon": -105.2886},
        "usgs_site_id": "07094500",
        "image": "https://images.unsplash.com/photo-1658355686821-f412c8397a0d?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "cheat-canyon",
        "name": "Cheat Canyon",
        "state": "WV",
        "class_rating": "III–V",
        "type": "whitewater",
        "osm_names": ["Cheat River"],
        "description": "Spring snowmelt classic. Big-volume Class III–V through a remote Appalachian canyon — flow-dependent and committing.",
        "hazards": [
            "High Falls — mandatory portage at most levels",
            "Coliseum & Pete Morgan — keeper holes at high water",
        ],
        "points_of_interest": [
            "Decision Rapid (III+): the warm-up — sets the tone",
            "Big Nasty (IV): wave/hole combo",
            "High Falls (V+): scout/portage — most paddlers carry",
            "Coliseum (IV+): boulder garden with big holes",
            "Pete Morgan's (IV): named for a famous swim",
            "Recovery Room (III): final pool before the lake",
        ],
        "put_in": {"name": "Albright", "lat": 39.4983, "lon": -79.6492},
        "take_out": {"name": "Jenkinsburg Bridge", "lat": 39.5536, "lon": -79.7886},
        "usgs_site_id": "03070260",
        "image": "https://images.unsplash.com/photo-1641523448193-94c3c1ceaf05?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "kennebec-river",
        "name": "Kennebec River — The Forks",
        "state": "ME",
        "class_rating": "III–IV",
        "type": "whitewater",
        "osm_names": ["Kennebec River"],
        "description": "Maine's premier whitewater run. Big, splashy Class III–IV with reliable Harris Station dam releases all summer.",
        "hazards": [
            "Dam-release flows can spike fast",
            "Cold water year-round",
        ],
        "points_of_interest": [
            "Taster (III): warm-up below the powerhouse",
            "Three Sisters (III+): a trio of stout wave trains",
            "Magic Falls (IV): the biggest drop — scout right",
            "Z-Turn (III+): tight S-bend through boulders",
            "Carry Brook (III): the last named rapid before The Forks",
        ],
        "put_in": {"name": "Harris Station", "lat": 45.4675, "lon": -70.0150},
        "take_out": {"name": "The Forks", "lat": 45.3625, "lon": -69.9728},
        "usgs_site_id": "01042500",
        "image": "https://images.unsplash.com/photo-1624646580989-9f059e25eb78?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "salt-river-upper",
        "name": "Salt River — Upper",
        "state": "AZ",
        "class_rating": "III–IV",
        "type": "whitewater",
        "osm_names": ["Salt River"],
        "description": "Sonoran Desert wilderness run through saguaro-studded canyons. Spring-only flow window with classic technical rapids.",
        "hazards": ["Flash flooding from desert storms", "Limited bail-out options"],
        "points_of_interest": [
            "Mother Rock (III): warm-up below the put-in",
            "Maytag (III+): named for its washing-machine action",
            "Quartzite Falls (was IV; now portage after blasting)",
            "Eye of the Needle (III+): tight slot through volcanic rock",
            "Black Rock (IV): the crux — scout left",
        ],
        "put_in": {"name": "US-60 Bridge", "lat": 33.7906, "lon": -110.5006},
        "take_out": {"name": "Highway 288", "lat": 33.7944, "lon": -110.9119},
        "usgs_site_id": "09498500",
        "image": "https://images.unsplash.com/photo-1762943107254-d9113dc3c427?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "animas-lower",
        "name": "Animas River — Lower",
        "state": "CO",
        "class_rating": "II–III",
        "type": "mixed",
        "osm_names": ["Animas River"],
        "description": "Durango town run. Big-volume Class II–III with reliable summer snowmelt and easy roadside access.",
        "hazards": ["Cold snowmelt in spring", "Smelter Rapid at high water"],
        "points_of_interest": [
            "Smelter Rapid (III+): river-wide hole at high water",
            "Sawmill (II+): wave train through old mill site",
            "Santa Rita Hole: surfable wave at moderate flows",
        ],
        "put_in": {"name": "33rd Street", "lat": 37.2939, "lon": -107.8769},
        "take_out": {"name": "Dallabetta Park", "lat": 37.2208, "lon": -107.8736},
        "usgs_site_id": "09361500",
        "image": "https://images.pexels.com/photos/34921063/pexels-photo-34921063.jpeg?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "selway-river",
        "name": "Selway River",
        "state": "ID",
        "class_rating": "III–IV",
        "type": "whitewater",
        "osm_names": ["Selway River"],
        "description": "Permitted wilderness river through the Selway-Bitterroot. One of the most coveted permits in the West — pristine forested canyon.",
        "hazards": ["Permit required (lottery)", "Long shuttle and remote canyon"],
        "points_of_interest": [
            "Goat Creek (III): warm-up rapid",
            "Ham (IV): big drop with hidden hole",
            "Wolf Creek (IV): boulder garden",
            "Ladle (IV+): the crux — scout right",
            "Pinball (III+): final big rapid",
        ],
        "put_in": {"name": "Paradise", "lat": 46.0900, "lon": -114.7917},
        "take_out": {"name": "Selway Falls", "lat": 46.0772, "lon": -115.2986},
        "usgs_site_id": "13336500",
        "image": "https://images.unsplash.com/photo-1641523448193-94c3c1ceaf05?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "rio-grande-taos-box",
        "name": "Rio Grande — Taos Box",
        "state": "NM",
        "class_rating": "IV",
        "type": "whitewater",
        "osm_names": ["Rio Grande"],
        "description": "Steep basalt gorge run on the Rio Grande. Big-water Class IV with classic Western desert scenery.",
        "hazards": ["Powerful hydraulics at high spring flows", "Long carry to put-in"],
        "points_of_interest": [
            "Ski Jump (III+): big wave train at the entrance",
            "Boat Reamer (IV): rocky maze",
            "Powerline (IV): river-wide hole",
            "Rock Garden (III+): boulder slalom",
            "Sunset (IV): final big drop before take-out",
        ],
        "put_in": {"name": "Taos Junction Bridge", "lat": 36.3192, "lon": -105.7544},
        "take_out": {"name": "Taos Box Take-out", "lat": 36.4167, "lon": -105.7242},
        "usgs_site_id": "08276500",
        "image": "https://images.unsplash.com/photo-1624646580989-9f059e25eb78?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "white-salmon-river",
        "name": "White Salmon River",
        "state": "WA",
        "class_rating": "IV–V",
        "type": "whitewater",
        "osm_names": ["White Salmon River"],
        "description": "Steep, spring-fed Pacific Northwest classic. Pool-drop Class IV–V through a basalt slot canyon — runnable nearly year-round.",
        "hazards": ["Husum Falls — scout/portage", "Cold spring-fed water"],
        "points_of_interest": [
            "Top Drop (IV): warm-up boof",
            "Husum Falls (V): the crux; portage-able river-left",
            "Rattlesnake (IV): tight slot through volcanic rock",
            "BZ Falls (above) requires scout",
        ],
        "put_in": {"name": "BZ Corner", "lat": 45.8014, "lon": -121.5292},
        "take_out": {"name": "Northwestern Lake", "lat": 45.7714, "lon": -121.4933},
        "usgs_site_id": "14123500",
        "image": "https://images.unsplash.com/photo-1762943107254-d9113dc3c427?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "klamath-upper",
        "name": "Klamath River — Upper",
        "state": "CA",
        "class_rating": "II–III",
        "type": "mixed",
        "osm_names": ["Klamath River"],
        "description": "Big-volume run through Northern California's redwood country. Fun Class II–III with great fishing and overnight camping options.",
        "hazards": ["Hydraulic at Hamburg", "Water quality varies seasonally"],
        "points_of_interest": [
            "Caldera (II+): warm-up wave train",
            "Dragon's Tooth (III): pointed rock mid-river",
            "Hamburg Hole (III+): keeper at high water",
            "Big Foot (II+): final rapid before take-out",
        ],
        "put_in": {"name": "Sarah Totten", "lat": 41.7825, "lon": -123.0306},
        "take_out": {"name": "Happy Camp", "lat": 41.7989, "lon": -123.3789},
        "usgs_site_id": "11530500",
        "image": "https://images.pexels.com/photos/33025530/pexels-photo-33025530.jpeg?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "lochsa-river",
        "name": "Lochsa River",
        "state": "ID",
        "class_rating": "III–IV",
        "type": "whitewater",
        "osm_names": ["Lochsa River"],
        "description": "Highway-side Idaho big-water classic. Continuous Class IV wave-trains alongside US-12 — easy access, demanding paddling.",
        "hazards": ["Continuous gradient — limited eddies", "Cold snowmelt water"],
        "points_of_interest": [
            "Fish Creek (III+): warm-up rapid",
            "Pipeline (IV): river-wide wave-hole combo",
            "Grim Reaper (IV+): the crux at high water",
            "Lochsa Falls (IV): big drop with massive wave",
            "House Wave: surfable highway-side wave",
        ],
        "put_in": {"name": "Wilderness Gateway", "lat": 46.5375, "lon": -115.3267},
        "take_out": {"name": "Split Creek", "lat": 46.4400, "lon": -115.7050},
        "usgs_site_id": "13337000",
        "image": "https://images.unsplash.com/photo-1629248457649-b082812aea6c?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "south-fork-payette",
        "name": "South Fork Payette — Canyon",
        "state": "ID",
        "class_rating": "IV",
        "type": "whitewater",
        "osm_names": ["South Fork Payette River"],
        "description": "Classic Idaho Class IV run through granite canyon walls. Fun, surf-friendly, and surprisingly accessible from Boise.",
        "hazards": ["Big Falls — mandatory portage", "Continuous Class III between named drops"],
        "points_of_interest": [
            "Slalom (III+): wave-train opener",
            "Surprise (IV): blind drop with a hole",
            "Bronco Billy (IV): big drop with kicker wave",
            "Big Falls (V+): mandatory portage",
            "Staircase (IV): the namesake drop",
        ],
        "put_in": {"name": "Deer Creek", "lat": 44.0894, "lon": -115.6533},
        "take_out": {"name": "Banks", "lat": 44.0789, "lon": -116.1183},
        "usgs_site_id": "13235000",
        "image": "https://images.unsplash.com/photo-1762943107260-d080e13266b3?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "green-river-flaming-gorge",
        "name": "Green River — Flaming Gorge",
        "state": "UT",
        "class_rating": "II–III",
        "type": "mixed",
        "osm_names": ["Green River"],
        "description": "Tailwater run below Flaming Gorge Dam. A/B/C sections take you from icy emerald water through Red Canyon and Browns Park — popular for kayak instruction, fishing, and family rafting.",
        "hazards": ["Cold tailwater — wear neoprene", "Red Creek Rapid (III) below Little Hole"],
        "points_of_interest": [
            "Red Creek Rapid (III): biggest drop, just below Little Hole",
            "Bridge Rapid (II): below Spillway",
            "Bridge Hollow Campground (BLM): mid-run camp",
            "Little Hole: classic take-out for the 7-mile A section",
            "Swallow Canyon: end of C section with sandstone cliffs",
        ],
        "put_in": {"name": "Spillway Boat Launch", "lat": 40.9092, "lon": -109.4225},
        "take_out": {"name": "Swallow Canyon Boat Ramp", "lat": 40.8442, "lon": -109.0819},
        "usgs_site_id": "09234500",
        "image": "https://images.unsplash.com/photo-1626594995085-36b551227b9a?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "merced-river",
        "name": "Merced River",
        "state": "CA",
        "class_rating": "III–IV",
        "type": "whitewater",
        "osm_names": ["Merced River"],
        "description": "Sierra Nevada snowmelt classic. Continuous Class III–IV through gold-rush country below Yosemite.",
        "hazards": ["Cold snowmelt water", "North Fork Falls — scout"],
        "points_of_interest": [
            "Nightmare Island (III+): braided channel — go right",
            "Quarter Mile (IV): long boulder garden",
            "Ned's Gulch (III+): final wave train",
            "Split Rock (III+): named for the boulder mid-river",
        ],
        "put_in": {"name": "Red Bud", "lat": 37.6372, "lon": -119.8694},
        "take_out": {"name": "Briceburg", "lat": 37.6072, "lon": -120.0264},
        "usgs_site_id": "11264500",
        "image": "https://images.unsplash.com/photo-1641523448193-94c3c1ceaf05?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "yampa-river",
        "name": "Yampa River — Dinosaur",
        "state": "CO",
        "class_rating": "III–IV",
        "type": "mixed",
        "osm_names": ["Yampa River"],
        "description": "Last major undammed tributary of the Colorado. Permitted multi-day through Dinosaur National Monument with stunning red-rock canyons.",
        "hazards": ["Permit required (lottery)", "Warm Springs Rapid at high water"],
        "points_of_interest": [
            "Tepee Rapid (III): warm-up wave train",
            "Big Joe (III+): named for the boulder",
            "Warm Springs (IV+): the crux — scout river-right",
            "Echo Park: confluence with the Green River",
        ],
        "put_in": {"name": "Deerlodge Park", "lat": 40.4581, "lon": -108.5067},
        "take_out": {"name": "Echo Park", "lat": 40.5183, "lon": -108.9928},
        "usgs_site_id": "09251000",
        "image": "https://images.unsplash.com/photo-1626594995085-36b551227b9a?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "russell-fork",
        "name": "Russell Fork",
        "state": "VA/KY",
        "class_rating": "IV–V",
        "type": "whitewater",
        "osm_names": ["Russell Fork"],
        "description": "Steep, technical Appalachian gorge with October dam releases. Class IV–V boofs and slides through Breaks Interstate Park.",
        "hazards": ["Triple Drop and El Horrendo at high water", "Limited bail-out in the gorge"],
        "points_of_interest": [
            "Tower Falls (IV): the warm-up boof",
            "Triple Drop (IV+): three-tiered staircase",
            "El Horrendo (V): the crux — scout/portage",
            "Climax (IV+): final big rapid",
            "Fist (IV): boulder slot",
        ],
        "put_in": {"name": "Bartlick", "lat": 37.2856, "lon": -82.3369},
        "take_out": {"name": "Garden Hole", "lat": 37.2950, "lon": -82.4233},
        "usgs_site_id": "03208500",
        "image": "https://images.unsplash.com/photo-1767471716671-60052b672451?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "truckee-river",
        "name": "Truckee River",
        "state": "NV/CA",
        "class_rating": "III–IV",
        "type": "mixed",
        "osm_names": ["Truckee River"],
        "description": "Sierra-to-Nevada-desert run. Fun Class III–IV with reliable summer flows from Lake Tahoe releases.",
        "hazards": ["Diversion dams — portage required", "Strainers at low water"],
        "points_of_interest": [
            "Bronco Rapid (III+): warm-up wave train",
            "Jaws (IV): tight slot — biggest rapid",
            "Floriston (III+): final wave train",
        ],
        "put_in": {"name": "Boca", "lat": 39.3892, "lon": -120.0894},
        "take_out": {"name": "Floriston", "lat": 39.4042, "lon": -120.0214},
        "usgs_site_id": "10346000",
        "image": "https://images.unsplash.com/photo-1626594995085-36b551227b9a?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "hudson-gorge",
        "name": "Hudson Gorge",
        "state": "NY",
        "class_rating": "III–IV",
        "type": "whitewater",
        "osm_names": ["Hudson River"],
        "description": "Adirondack wilderness run on the upper Hudson. Spring snowmelt and dam-release Class III–IV with stunning fall foliage.",
        "hazards": ["Cold spring water", "Bus Stop Hole at high water"],
        "points_of_interest": [
            "OK Slip Falls confluence (III+)",
            "Black Hole (IV): river-wide keeper",
            "Bus Stop (III+): big wave train",
            "Mile-Long Rapid (III+): continuous Class III",
            "Harris (III+): final rapid before take-out",
        ],
        "put_in": {"name": "Indian River", "lat": 43.7619, "lon": -74.1700},
        "take_out": {"name": "North River", "lat": 43.7100, "lon": -74.0033},
        "usgs_site_id": "01315500",
        "image": "https://images.unsplash.com/photo-1629248564797-8c5ba85da9d3?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "pigeon-river",
        "name": "Pigeon River",
        "state": "NC/TN",
        "class_rating": "III",
        "type": "mixed",
        "osm_names": ["Pigeon River"],
        "description": "Dam-controlled Class III in the Smokies. Reliable summer flows make it one of the most-rafted rivers in the Southeast.",
        "hazards": ["Power releases create sudden flow spikes", "Strainers along forested banks"],
        "points_of_interest": [
            "Powerhouse (III): wave train at the put-in",
            "Vegamatic (III): named for its slicing action",
            "Lost Guide (III): tight S-bend",
            "Accelerator (III): final big drop",
        ],
        "put_in": {"name": "Powerhouse", "lat": 35.7836, "lon": -83.0931},
        "take_out": {"name": "Hartford", "lat": 35.8225, "lon": -83.1597},
        "usgs_site_id": "03460795",
        "image": "https://images.unsplash.com/photo-1527489377706-5bf97e608852?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "colorado-westwater",
        "name": "Colorado River — Westwater Canyon",
        "state": "UT",
        "class_rating": "III–IV",
        "type": "whitewater",
        "osm_names": ["Colorado River"],
        "description": "17-mile permitted run through the Black Granite of Westwater. Pool-drop Class III–IV with iconic Skull Rapid in the heart of Utah's red-rock country.",
        "hazards": ["Skull Rapid — Room of Doom undercut", "Permit required"],
        "points_of_interest": [
            "Little Dolores (III): warm-up rapid",
            "Marble Canyon (III+): wave train",
            "Funnel Falls (III+): tight slot",
            "Skull Rapid (IV): the crux — Room of Doom on river-right",
            "Sock-it-to-Me (III+): final named rapid",
        ],
        "put_in": {"name": "Westwater Ranger Station", "lat": 39.0214, "lon": -109.1467},
        "take_out": {"name": "Cisco", "lat": 38.9603, "lon": -109.3267},
        "usgs_site_id": "09180500",
        "image": "https://images.unsplash.com/photo-1658355686821-f412c8397a0d?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "yellowstone-river",
        "name": "Yellowstone River — Yankee Jim Canyon",
        "state": "MT",
        "class_rating": "II–III",
        "type": "mixed",
        "osm_names": ["Yellowstone River"],
        "description": "Big-volume Class III through Yankee Jim Canyon below Yellowstone National Park. Surfy waves and fun pool-drop in stunning Paradise Valley.",
        "hazards": ["Spring runoff peaks at >10k cfs", "Cold water year-round"],
        "points_of_interest": [
            "Big Rock (II+): warm-up rapid",
            "Boateater (III): biggest hole in the canyon",
            "Yankee Jim (III): the classic wave train",
            "Sleeping Giant (II+): final big drop",
        ],
        "put_in": {"name": "Carbella", "lat": 45.2025, "lon": -110.7689},
        "take_out": {"name": "Yankee Jim", "lat": 45.2581, "lon": -110.7350},
        "usgs_site_id": "06192500",
        "image": "https://images.pexels.com/photos/33025530/pexels-photo-33025530.jpeg?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "skykomish-river",
        "name": "Skykomish River — Boulder Drop",
        "state": "WA",
        "class_rating": "IV",
        "type": "whitewater",
        "osm_names": ["Skykomish River"],
        "description": "Pacific Northwest classic. Glacier-fed Class IV with the famous Boulder Drop boulder garden — surf-friendly and surprisingly accessible from Seattle.",
        "hazards": ["Boulder Drop — scout from river-right", "Cold glacial water"],
        "points_of_interest": [
            "Cable Drop (III+): warm-up wave train",
            "Boulder Drop (IV): the namesake drop — picks line carefully",
            "Aqua Velva (III+): big wave below Boulder Drop",
            "Lunch Hole: surfable wave at moderate flows",
        ],
        "put_in": {"name": "Index", "lat": 47.8211, "lon": -121.5572},
        "take_out": {"name": "Big Eddy", "lat": 47.8378, "lon": -121.6900},
        "usgs_site_id": "12134500",
        "image": "https://images.unsplash.com/photo-1762943107260-d080e13266b3?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "owyhee-river",
        "name": "Owyhee River",
        "state": "OR",
        "class_rating": "III–IV",
        "type": "whitewater",
        "osm_names": ["Owyhee River"],
        "description": "Spring-only desert wilderness run. Remote eastern Oregon canyon with hot springs, ancient petroglyphs, and Class III–IV.",
        "hazards": ["Short flow window (Apr–May)", "Long shuttle through remote desert"],
        "points_of_interest": [
            "Bull's Eye (III): warm-up rapid",
            "Half Mile (III+): long boulder garden",
            "Whistling Bird (IV): the crux — undercut river-left",
            "Squeeze (IV): tight slot at low water",
            "Iron Point (III+): final big rapid",
        ],
        "put_in": {"name": "Three Forks", "lat": 42.5325, "lon": -117.1731},
        "take_out": {"name": "Birch Creek", "lat": 43.4156, "lon": -117.2331},
        "usgs_site_id": "13183000",
        "image": "https://images.unsplash.com/photo-1762943107254-d9113dc3c427?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "smith-river-ca",
        "name": "Smith River — Middle Fork",
        "state": "CA",
        "class_rating": "III–IV",
        "type": "whitewater",
        "osm_names": ["Smith River", "Middle Fork Smith River"],
        "description": "California's only undammed major river. Crystal-clear water through old-growth redwoods; technical Class III–IV through Oregon Hole Gorge.",
        "hazards": ["Flash flooding during winter storms", "Tight Oregon Hole Gorge"],
        "points_of_interest": [
            "Oregon Hole Gorge (IV): tight slot through bedrock",
            "Boulder Garden (III+): long technical move",
            "Last Drop (III): final rapid before take-out",
        ],
        "put_in": {"name": "Patrick Creek", "lat": 41.8589, "lon": -123.8553},
        "take_out": {"name": "South Fork Confluence", "lat": 41.7986, "lon": -124.0686},
        "usgs_site_id": "11532500",
        "image": "https://images.unsplash.com/photo-1641523448193-94c3c1ceaf05?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "mckenzie-river",
        "name": "McKenzie River",
        "state": "OR",
        "class_rating": "II–III",
        "type": "mixed",
        "osm_names": ["McKenzie River"],
        "description": "Spring-fed Cascades classic. Crystal-clear Class II–III through old-growth Douglas fir forest — good for drift boats and rafts year-round.",
        "hazards": ["Strainers along banks", "Cold spring-fed water"],
        "points_of_interest": [
            "Bridge Hole (II+): play wave below the put-in",
            "Marten Rapid (III): the biggest drop",
            "Brown's Hole (II+): named for the famous swim",
            "Finn Rock (II+): final rapid before take-out",
        ],
        "put_in": {"name": "Olallie", "lat": 44.2089, "lon": -122.0500},
        "take_out": {"name": "Finn Rock", "lat": 44.1431, "lon": -122.4036},
        "usgs_site_id": "14162500",
        "image": "https://images.pexels.com/photos/34921063/pexels-photo-34921063.jpeg?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "north-fork-payette",
        "name": "North Fork Payette",
        "state": "ID",
        "class_rating": "V",
        "type": "whitewater",
        "osm_names": ["North Fork Payette River"],
        "description": "America's most legendary roadside Class V. Continuous gradient (~150 ft/mi) of huge waves and bus-stopping holes — only for elite paddlers.",
        "hazards": ["Continuous Class V — no swim-friendly water", "Limited bail-out between drops"],
        "points_of_interest": [
            "Steepness (V): the warm-up… of sorts",
            "Jacob's Ladder (V): the namesake staircase",
            "Bouncer Down the Middle (V): river-wide hole",
            "Otter's Slide (V+): the crux at high water",
            "Crunch (V): final huge drop before Banks",
        ],
        "put_in": {"name": "Smith's Ferry", "lat": 44.3017, "lon": -116.0667},
        "take_out": {"name": "Banks", "lat": 44.0789, "lon": -116.1183},
        "usgs_site_id": "13246000",
        "image": "https://images.unsplash.com/photo-1762943107254-d9113dc3c427?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "chattahoochee-river",
        "name": "Chattahoochee River",
        "state": "GA",
        "class_rating": "II",
        "type": "calm",
        "osm_names": ["Chattahoochee River"],
        "description": "Atlanta's urban river. Easy Class I–II suitable for tubing, kayaking, and SUP — popular summer cool-off through the city.",
        "hazards": ["Strainers along wooded banks", "Cold dam-released water"],
        "points_of_interest": [
            "Devil's Race Course (II): the only named rapid",
            "Diving Rock: popular jump spot",
            "Long Island: scenic mid-river island",
        ],
        "put_in": {"name": "Buford Dam", "lat": 34.1592, "lon": -84.0750},
        "take_out": {"name": "Paces Mill", "lat": 33.8703, "lon": -84.4486},
        "usgs_site_id": "02336000",
        "image": "https://images.unsplash.com/photo-1716392979020-16519d1874e1?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "tygart-river",
        "name": "Tygart River — Arden",
        "state": "WV",
        "class_rating": "III–IV",
        "type": "whitewater",
        "osm_names": ["Tygart River", "Tygart Valley River"],
        "description": "West Virginia gem with classic boulder gardens and a runnable waterfall. Big-water Class III–IV after good rain.",
        "hazards": ["Hard Hard Hole at high water", "Limited eddies in the gorge"],
        "points_of_interest": [
            "Moats Falls (IV): the warm-up boof",
            "S-Turn (III+): tight bend through boulders",
            "Hook Rapid (IV): the namesake drop",
            "Valley Falls (V): waterfall — most paddlers portage",
        ],
        "put_in": {"name": "Belington", "lat": 39.0264, "lon": -79.9347},
        "take_out": {"name": "Arden", "lat": 39.2872, "lon": -80.1086},
        "usgs_site_id": "03050500",
        "image": "https://images.unsplash.com/photo-1658355686821-f412c8397a0d?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "esopus-creek",
        "name": "Esopus Creek",
        "state": "NY",
        "class_rating": "II–III",
        "type": "mixed",
        "osm_names": ["Esopus Creek"],
        "description": "Catskills classic with Shandaken Tunnel releases. Reliable summer Class II–III, popular for tubing and beginner whitewater.",
        "hazards": ["Tunnel releases can spike flows", "Strainers at low water"],
        "points_of_interest": [
            "Railroad Bridge (II): wave train at the put-in",
            "Suicide Rapid (III): the biggest drop — scout left",
            "Garbage Hole (II+): keeper at high water",
        ],
        "put_in": {"name": "Phoenicia", "lat": 42.0822, "lon": -74.3158},
        "take_out": {"name": "Mt. Tremper", "lat": 42.0394, "lon": -74.2278},
        "usgs_site_id": "01362500",
        "image": "https://images.unsplash.com/photo-1527489377706-5bf97e608852?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "shenandoah-river",
        "name": "Shenandoah River — Staircase",
        "state": "WV/VA",
        "class_rating": "II–III",
        "type": "mixed",
        "osm_names": ["Shenandoah River"],
        "description": "Family-friendly Class II–III through the Appalachian foothills. Big, warm summer river with the famous Staircase ledges.",
        "hazards": ["Bull Falls — scout at high water", "Ledge holes at moderate flows"],
        "points_of_interest": [
            "Bull Falls (III): the warm-up",
            "Staircase (III): six ledges in succession",
            "Whitehorse (III): final wave train above the confluence",
        ],
        "put_in": {"name": "Bloomery", "lat": 39.2842, "lon": -77.7569},
        "take_out": {"name": "Harpers Ferry", "lat": 39.3258, "lon": -77.7375},
        "usgs_site_id": "01636500",
        "image": "https://images.unsplash.com/photo-1707261897515-834d5b65c12b?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "north-fork-american",
        "name": "North Fork American — Chamberlain Falls",
        "state": "CA",
        "class_rating": "IV",
        "type": "whitewater",
        "osm_names": ["North Fork American River"],
        "description": "Sierra Nevada granite gorge with the famous Chamberlain Falls. Pool-drop Class IV with steep, technical drops below Auburn.",
        "hazards": ["Chamberlain Falls — scout/portage", "Cold snowmelt water"],
        "points_of_interest": [
            "Slaughter's Sluice (III+): warm-up rapid",
            "Chamberlain Falls (IV+): the crux drop",
            "Bogus Thunder (IV): big wave train",
            "Achilles' Heel (IV): final drop above the takeout",
        ],
        "put_in": {"name": "Iowa Hill Bridge", "lat": 39.0156, "lon": -120.9067},
        "take_out": {"name": "Ponderosa Way", "lat": 38.9678, "lon": -121.0411},
        "usgs_site_id": "11427000",
        "image": "https://images.unsplash.com/photo-1762943107260-d080e13266b3?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "arkansas-bighorn-sheep-canyon",
        "name": "Arkansas River — Bighorn Sheep Canyon",
        "state": "CO",
        "class_rating": "III",
        "type": "mixed",
        "osm_names": ["Arkansas River"],
        "description": "Family-friendly Class III canyon below Browns Canyon. Roadside access, big surfy waves, and frequent bighorn sheep sightings.",
        "hazards": ["Three Rocks at high water — pick line carefully", "Cold snowmelt in spring"],
        "points_of_interest": [
            "Spike Buck Rapid (III): warm-up wave train",
            "Maytag (III): namesake washing-machine hole",
            "Three Rocks (III+): the crux — three big waves in a row",
            "Squaw Creek (II+): final wave train above takeout",
        ],
        "put_in": {"name": "Salt Lick", "lat": 38.4242, "lon": -105.6850},
        "take_out": {"name": "Parkdale", "lat": 38.4922, "lon": -105.4275},
        "usgs_site_id": "07091200",
        "image": "https://images.unsplash.com/photo-1707261897515-834d5b65c12b?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "browns-canyon",
        "name": "Arkansas River — Browns Canyon",
        "state": "CO",
        "class_rating": "III",
        "type": "mixed",
        "osm_names": ["Arkansas River"],
        "description": "Colorado's most-rafted run. Class III through Browns Canyon National Monument with iconic granite cliffs and reliable summer flows.",
        "hazards": ["Zoom Flume at high water", "Rocky low water"],
        "points_of_interest": [
            "Pinball (III): warm-up boulder slalom",
            "Zoom Flume (III+): the crux wave train",
            "Big Drop (III): named for the surprising drop",
            "Seidel's Suckhole (III): ledge hole — left line is best",
            "Staircase (III): final rapid before take-out",
        ],
        "put_in": {"name": "Fisherman's Bridge", "lat": 38.7575, "lon": -106.0317},
        "take_out": {"name": "Hecla Junction", "lat": 38.6661, "lon": -106.0231},
        "usgs_site_id": "07091200",
        "image": "https://images.unsplash.com/photo-1707261897515-834d5b65c12b?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "eagle-river",
        "name": "Eagle River — Dowd Chute",
        "state": "CO",
        "class_rating": "III–IV",
        "type": "whitewater",
        "osm_names": ["Eagle River"],
        "description": "Vail-area Class III–IV. Snowmelt-driven Colorado classic with the famous Dowd Chute big-wave train.",
        "hazards": ["Strainers in early spring", "Continuous Class III-IV at high water"],
        "points_of_interest": [
            "Dowd Chute (IV): the namesake long wave train",
            "Riverbend (III+): tight bend through the canyon",
            "Avon Wave: surfable wave at moderate flows",
        ],
        "put_in": {"name": "Edwards", "lat": 39.6431, "lon": -106.5947},
        "take_out": {"name": "Wolcott", "lat": 39.7028, "lon": -106.6786},
        "usgs_site_id": "09064600",
        "image": "https://images.unsplash.com/photo-1629248457649-b082812aea6c?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "colorado-upper",
        "name": "Colorado River — Pumphouse",
        "state": "CO",
        "class_rating": "II",
        "type": "calm",
        "osm_names": ["Colorado River"],
        "description": "Family-friendly upper Colorado run. Easy Class II through Gore Canyon's lower section — popular for overnight trips.",
        "hazards": ["Cold snowmelt", "Changing flows from upstream releases"],
        "points_of_interest": [
            "Eye of the Needle (II): playful entrance rapid",
            "Cottonwood Island: scenic mid-river camp",
            "Rancho del Rio: takeout option mid-trip",
        ],
        "put_in": {"name": "Pumphouse", "lat": 39.9342, "lon": -106.5358},
        "take_out": {"name": "Rancho del Rio", "lat": 39.8814, "lon": -106.6750},
        "usgs_site_id": "09070500",
        "image": "https://images.unsplash.com/photo-1722658062692-503ad5d906a2?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "klickitat-river",
        "name": "Klickitat River",
        "state": "WA",
        "class_rating": "III",
        "type": "mixed",
        "osm_names": ["Klickitat River"],
        "description": "Wild & Scenic Yakama Nation river. Class III through a scenic basalt canyon with great salmon runs and reliable summer flows.",
        "hazards": ["Strainers along banks", "Cold spring snowmelt"],
        "points_of_interest": [
            "Class III wave trains throughout",
            "Stinson Flats: scenic mid-trip camping",
            "Lower Canyon (III): final committing section",
        ],
        "put_in": {"name": "Leidl", "lat": 45.9606, "lon": -121.1242},
        "take_out": {"name": "Pitt", "lat": 45.7889, "lon": -121.1944},
        "usgs_site_id": "14113000",
        "image": "https://images.unsplash.com/photo-1707261897515-834d5b65c12b?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "sandy-river",
        "name": "Sandy River",
        "state": "OR",
        "class_rating": "III",
        "type": "mixed",
        "osm_names": ["Sandy River"],
        "description": "Glacier-fed Mt. Hood classic. Pacific Northwest Class III with great surfing waves and Old-Maid Flat scenery.",
        "hazards": ["Cold glacial water", "Strainers from washouts"],
        "points_of_interest": [
            "Marmot Dam removal site: now a free-flowing rapid",
            "Pipeline (III): wave train through the gorge",
            "Revenuer's Creek: takeout option",
        ],
        "put_in": {"name": "Dodge Park", "lat": 45.4317, "lon": -122.2756},
        "take_out": {"name": "Oxbow Park", "lat": 45.5089, "lon": -122.3014},
        "usgs_site_id": "14142500",
        "image": "https://images.unsplash.com/photo-1707261897515-834d5b65c12b?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "clackamas-river",
        "name": "Clackamas River",
        "state": "OR",
        "class_rating": "III",
        "type": "mixed",
        "osm_names": ["Clackamas River"],
        "description": "Oregon Cascades classic. Big-volume Class III through evergreen forest with reliable summer dam releases.",
        "hazards": ["Carter Falls — scout/portage", "Strainers in early spring"],
        "points_of_interest": [
            "Big Eddy (III): warm-up wave train",
            "Carter Falls (IV): scout/portage on river-right",
            "Bob's Hole: surfable play wave",
        ],
        "put_in": {"name": "Three Lynx", "lat": 45.1306, "lon": -122.0775},
        "take_out": {"name": "McIver Park", "lat": 45.3083, "lon": -122.3589},
        "usgs_site_id": "14210000",
        "image": "https://images.unsplash.com/photo-1707261897515-834d5b65c12b?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "john-day-river",
        "name": "John Day River",
        "state": "OR",
        "class_rating": "II",
        "type": "calm",
        "osm_names": ["John Day River"],
        "description": "Eastern Oregon desert wilderness. Multi-day Class II through painted hills and rimrock canyons — fossil country.",
        "hazards": ["Limited shade", "Long shuttle through remote desert"],
        "points_of_interest": [
            "Service Creek (II): the warm-up",
            "Clarno Rapid (III): the only major drop",
            "Cathedral Rock: dramatic cliffs mid-trip",
        ],
        "put_in": {"name": "Service Creek", "lat": 44.7906, "lon": -120.0892},
        "take_out": {"name": "Clarno", "lat": 44.9106, "lon": -120.4811},
        "usgs_site_id": "14048000",
        "image": "https://images.unsplash.com/photo-1722658062692-503ad5d906a2?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "trinity-river",
        "name": "Trinity River — Pigeon Point",
        "state": "CA",
        "class_rating": "II–III",
        "type": "mixed",
        "osm_names": ["Trinity River"],
        "description": "Northern California's Wild & Scenic Trinity. Class II–III through dense forest with great fishing and family rafting.",
        "hazards": ["Cold tailwater releases", "Strainers along forested banks"],
        "points_of_interest": [
            "Pigeon Point (II+): warm-up wave train",
            "Hell Hole (III): the biggest rapid — scout left",
            "Burnt Ranch Falls (V): mandatory portage downstream",
        ],
        "put_in": {"name": "Pigeon Point", "lat": 40.7747, "lon": -123.5181},
        "take_out": {"name": "Hawkins Bar", "lat": 40.8128, "lon": -123.5814},
        "usgs_site_id": "11530000",
        "image": "https://images.unsplash.com/photo-1707261897515-834d5b65c12b?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "bitterroot-river",
        "name": "Bitterroot River",
        "state": "MT",
        "class_rating": "II",
        "type": "calm",
        "osm_names": ["Bitterroot River"],
        "description": "Montana's premier trout stream. Easy Class I-II ideal for drift boats with stunning Bitterroot Range backdrop.",
        "hazards": ["Strainers from cottonwood logs", "Diversion dams — portage required"],
        "points_of_interest": [
            "Bell Crossing: popular put-in", 
            "Lolo Confluence: scenic mid-trip junction",
            "Jim Crew Bridge: final takeout option",
        ],
        "put_in": {"name": "Hamilton", "lat": 46.2469, "lon": -114.1578},
        "take_out": {"name": "Florence", "lat": 46.6228, "lon": -114.0589},
        "usgs_site_id": "12352500",
        "image": "https://images.unsplash.com/photo-1722658062692-503ad5d906a2?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "madison-river",
        "name": "Madison River",
        "state": "MT",
        "class_rating": "II",
        "type": "calm",
        "osm_names": ["Madison River"],
        "description": "Yellowstone-headwaters classic. Easy Class I-II through Hebgen Lake outflow — world-class trout fishing.",
        "hazards": ["Cold tailwater", "Drift-boat angling traffic"],
        "points_of_interest": [
            "Three Dollar Bridge: classic put-in",
            "Beartrap Canyon (III): mid-trip whitewater section",
            "Greycliff: peaceful camp option",
        ],
        "put_in": {"name": "Three Dollar Bridge", "lat": 44.7572, "lon": -111.4794},
        "take_out": {"name": "Lyons Bridge", "lat": 44.8589, "lon": -111.6431},
        "usgs_site_id": "06038500",
        "image": "https://images.unsplash.com/photo-1722658062692-503ad5d906a2?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "yellowstone-canyon",
        "name": "Yellowstone River — Paradise Valley",
        "state": "MT",
        "class_rating": "II",
        "type": "calm",
        "osm_names": ["Yellowstone River"],
        "description": "Below Yankee Jim — easy Class I–II through Paradise Valley. Great drift-boat fishing with Absaroka peaks in view.",
        "hazards": ["Spring runoff bumps Class to II+", "Riverside cottonwood strainers"],
        "points_of_interest": [
            "Carbella: popular drift-boat ramp",
            "Mallard's Rest: scenic mid-trip stop",
            "Pine Creek: takeout option",
        ],
        "put_in": {"name": "Carbella", "lat": 45.2025, "lon": -110.7689},
        "take_out": {"name": "Pine Creek", "lat": 45.4789, "lon": -110.7544},
        "usgs_site_id": "06192500",
        "image": "https://images.unsplash.com/photo-1722658062692-503ad5d906a2?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "deerfield-river",
        "name": "Deerfield River — Dryway",
        "state": "MA",
        "class_rating": "III",
        "type": "mixed",
        "osm_names": ["Deerfield River"],
        "description": "New England classic. Reliable summer dam releases bring Class III continuous wave trains through forested gorge.",
        "hazards": ["Cold tailwater releases", "Limited eddies in the gorge"],
        "points_of_interest": [
            "Maze (III): warm-up rapid",
            "Dragon's Tooth (III): named for the rock",
            "Labyrinth (III): tight technical section",
            "Final Drop (III): the take-out wave",
        ],
        "put_in": {"name": "Monroe Bridge", "lat": 42.7142, "lon": -72.9800},
        "take_out": {"name": "Hoosac Tunnel", "lat": 42.6797, "lon": -72.9203},
        "usgs_site_id": "01170500",
        "image": "https://images.unsplash.com/photo-1707261897515-834d5b65c12b?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "penobscot-east-branch",
        "name": "Penobscot — East Branch",
        "state": "ME",
        "class_rating": "II–III",
        "type": "mixed",
        "osm_names": ["East Branch Penobscot River"],
        "description": "Maine wilderness multi-day. Class II-III through Katahdin Woods and Waters with classic Northeast lake-and-river paddling.",
        "hazards": ["Remote backcountry", "Wind-exposed lake crossings"],
        "points_of_interest": [
            "Stair Falls (III): the classic drop",
            "Haskell Rock Pitch (III+): scout from river-left",
            "Pond Pitch (III): final big rapid",
        ],
        "put_in": {"name": "Matagamon Lake", "lat": 46.1322, "lon": -68.6717},
        "take_out": {"name": "Whetstone Falls", "lat": 45.9819, "lon": -68.6386},
        "usgs_site_id": "01029500",
        "image": "https://images.unsplash.com/photo-1707261897515-834d5b65c12b?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "new-river-virginia",
        "name": "New River — Virginia",
        "state": "VA",
        "class_rating": "II",
        "type": "calm",
        "osm_names": ["New River"],
        "description": "Upper New River through southwest Virginia. Easy Class I-II family floating with the New River Trail State Park access.",
        "hazards": ["Strainers along wooded banks", "Flash flooding in summer storms"],
        "points_of_interest": [
            "Foster Falls (II+): the only named drop",
            "New River Trail: rail-trail along the run",
            "Galax: family-friendly takeout",
        ],
        "put_in": {"name": "Allisonia", "lat": 36.9286, "lon": -80.7042},
        "take_out": {"name": "Foster Falls", "lat": 36.8736, "lon": -80.7289},
        "usgs_site_id": "03168000",
        "image": "https://images.unsplash.com/photo-1722658062692-503ad5d906a2?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "saluda-river",
        "name": "Saluda River — Lower",
        "state": "SC",
        "class_rating": "II–III",
        "type": "mixed",
        "osm_names": ["Saluda River"],
        "description": "Columbia's urban whitewater. Reliable dam releases create Class II-III play waves right in the city.",
        "hazards": ["Sudden flow spikes from dam releases", "Cold tailwater"],
        "points_of_interest": [
            "Pop-Up Wave: famous play feature",
            "Millrace Rapids (III): downtown wave train",
            "Three Rivers Confluence: takeout area",
        ],
        "put_in": {"name": "Lake Murray Dam", "lat": 34.0522, "lon": -81.2058},
        "take_out": {"name": "Three Rivers", "lat": 33.9897, "lon": -81.0539},
        "usgs_site_id": "02168504",
        "image": "https://images.unsplash.com/photo-1707261897515-834d5b65c12b?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
    },
    {
        "id": "snake-jackson-hole",
        "name": "Snake River — Jackson Hole Scenic",
        "state": "WY",
        "class_rating": "II",
        "type": "calm",
        "osm_names": ["Snake River"],
        "description": "Float through Grand Teton National Park. Easy Class I–II with iconic Teton peaks in view — wildlife everywhere.",
        "hazards": ["Strainers from logjams", "Cold snowmelt water"],
        "points_of_interest": [
            "Schwabacher Landing: classic put-in",
            "Snake River Overlook: dramatic Teton views",
            "Moose: village-side takeout",
        ],
        "put_in": {"name": "Deadman's Bar", "lat": 43.7544, "lon": -110.6219},
        "take_out": {"name": "Moose", "lat": 43.6597, "lon": -110.7106},
        "usgs_site_id": "13317660",
        "image": "https://images.unsplash.com/photo-1722658062692-503ad5d906a2?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85"
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
    # Surface any curated "Helpful information" bullets sitting next to the
    # run's geojson on disk (/app/data/runs/<id>/helpful_info.json). The
    # field is omitted entirely when the file is missing or empty so the
    # client can simply `if (r.helpful_info?.length) render…`.
    curated = _load_curated(river_id)
    if curated and curated.get("helpful_info"):
        river["helpful_info"] = curated["helpful_info"]
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
