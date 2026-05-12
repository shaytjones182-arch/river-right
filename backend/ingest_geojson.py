"""
RiverRight — GeoJSON ingestion utility.

Reads a polyline GeoJSON + a POI GeoJSON for a single river run, normalizes
them to a clean, WGS84 format, and writes them into:

    /app/data/runs/<run_id>/polyline.geojson
    /app/data/runs/<run_id>/poi.geojson
    /app/data/runs/<run_id>/meta.json

All coordinates are output as [lon, lat] in WGS84 (EPSG:4326). Any input CRS
declared via the GeoJSON `crs` member (or feature-level CRS) is reprojected.

Usage:
    python ingest_geojson.py \
        --run-id green-river-desolation \
        --polyline /path/to/polyline.geojson \
        --poi      /path/to/poi.geojson \
        [--name "Green River — Desolation Canyon"]

Run with --help for details.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    from pyproj import Transformer
except ImportError:  # pyproj is optional but recommended
    Transformer = None  # type: ignore

ROOT = Path(__file__).resolve().parent.parent  # /app
DATA_DIR = ROOT / "data" / "runs"


# ---------------------------------------------------------------------------
# CRS handling
# ---------------------------------------------------------------------------

# Common CRS aliases seen in the wild (QGIS, ArcGIS exports, etc.)
CRS_ALIASES = {
    "urn:ogc:def:crs:OGC::CRS84": "EPSG:4326",
    "urn:ogc:def:crs:EPSG::4326": "EPSG:4326",
    "EPSG:4326": "EPSG:4326",
}


def _resolve_crs(crs_obj: Optional[Dict[str, Any]]) -> Optional[str]:
    """Return an EPSG:xxxx-style string for a GeoJSON CRS member, or None for default."""
    if not crs_obj:
        return None
    if isinstance(crs_obj, str):
        name = crs_obj
    else:
        name = ((crs_obj.get("properties") or {}).get("name") or "").strip()
    if not name:
        return None
    if name in CRS_ALIASES:
        return CRS_ALIASES[name]
    # urn:ogc:def:crs:EPSG::6350  -> EPSG:6350
    m = re.match(r"urn:ogc:def:crs:EPSG::(\d+)", name)
    if m:
        return f"EPSG:{m.group(1)}"
    if name.upper().startswith("EPSG:"):
        return name.upper()
    return name


def _make_transformer(src: Optional[str]):
    """Return a pyproj transformer to convert from src CRS to WGS84, or None if no-op."""
    if not src or src == "EPSG:4326":
        return None
    if Transformer is None:
        raise RuntimeError(
            f"Input file is in {src} but pyproj is not installed. "
            "Run: pip install pyproj"
        )
    return Transformer.from_crs(src, "EPSG:4326", always_xy=True)


def _reproject_coords(coords, transform) -> Any:
    """Recursively reproject GeoJSON coordinates to WGS84 (rounded to 6 decimals)."""
    if transform is None:
        # Strip Z values and round
        def _strip(pt):
            return [round(float(pt[0]), 6), round(float(pt[1]), 6)]

        def _walk(c):
            if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
                return _strip(c)
            return [_walk(x) for x in c]
        return _walk(coords)

    def _walk(c):
        if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
            lon, lat = transform.transform(float(c[0]), float(c[1]))
            return [round(lon, 6), round(lat, 6)]
        return [_walk(x) for x in c]
    return _walk(coords)


# ---------------------------------------------------------------------------
# Polyline normalization
# ---------------------------------------------------------------------------

def _haversine_mi(a: List[float], b: List[float]) -> float:
    R = 3958.7613
    lon1, lat1 = math.radians(a[0]), math.radians(a[1])
    lon2, lat2 = math.radians(b[0]), math.radians(b[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def normalize_polyline(geojson: Dict[str, Any], run_name: Optional[str] = None) -> Dict[str, Any]:
    src_crs = _resolve_crs(geojson.get("crs"))
    transform = _make_transformer(src_crs)

    # Flatten to a single MultiLineString
    segments: List[List[List[float]]] = []
    name_hint: Optional[str] = None
    for feat in geojson.get("features", []) or []:
        if not name_hint:
            props = feat.get("properties") or {}
            name_hint = (
                props.get("name")
                or props.get("gnisidlabel")
                or props.get("river_name")
                or None
            )
        geom = feat.get("geometry") or {}
        gtype = geom.get("type")
        coords = geom.get("coordinates")
        if not coords:
            continue
        reproj = _reproject_coords(coords, transform)
        if gtype == "LineString":
            segments.append(reproj)
        elif gtype == "MultiLineString":
            segments.extend(reproj)
        else:
            print(f"  ! Skipping unsupported geometry type: {gtype}", file=sys.stderr)

    if not segments:
        raise ValueError("No polyline geometry found in input")

    # Compute total length
    total_mi = 0.0
    for seg in segments:
        for i in range(1, len(seg)):
            total_mi += _haversine_mi(seg[i - 1], seg[i])

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "name": run_name or name_hint or "River",
                    "length_mi": round(total_mi, 2),
                    "point_count": sum(len(s) for s in segments),
                    "segment_count": len(segments),
                },
                "geometry": {
                    "type": "MultiLineString",
                    "coordinates": segments,
                },
            }
        ],
    }


# ---------------------------------------------------------------------------
# POI normalization
# ---------------------------------------------------------------------------

# Map raw POI categories from input to our canonical kinds (matches frontend pin types)
WATERWAY_TO_KIND = {
    "rapids": "rapid",
    "rapid": "rapid",
    "waterfall": "waterfall",
    "fall": "waterfall",
    "falls": "waterfall",
    "dam": "hazard",
    "weir": "hazard",
    "hazard": "hazard",
    "campground": "camp",
    "camp": "camp",
    "camp_site": "camp",
    "slipway": "boat_ramp",
    "boat_ramp": "boat_ramp",
    "access_point": "access",
    "put_in": "putin",
    "putin": "putin",
    "take_out": "takeout",
    "takeout": "takeout",
    "egress": "takeout",
    "note": "note",
    "portage": "portage",
}

KIND_TO_CATEGORY = {
    "rapid": "rapid",
    "waterfall": "waterfall",
    "hazard": "hazard",
    "camp": "camp",
    "boat_ramp": "access",
    "access": "access",
    "putin": "putin",
    "takeout": "takeout",
    "note": "note",
    "portage": "portage",
}


def _normalize_class(raw: Any) -> Optional[str]:
    """Normalize a rapid class to a Roman-numeral grade like 'III' or 'IV+'."""
    if raw in (None, "", "None"):
        return None
    s = str(raw).strip()
    # Already roman?
    if re.fullmatch(r"[IVX]+\+?[-–][IVX]+\+?|[IVX]+\+?", s.upper()):
        return s.upper()
    # Numeric to roman
    m = re.match(r"^([1-6])(\+|\-)?$", s)
    if m:
        n = int(m.group(1))
        roman = ["I", "II", "III", "IV", "V", "VI"][n - 1]
        return roman + (m.group(2) or "")
    # Free-text descriptions (notes, etc.) — return as-is, callers should treat it as description not grade
    return None


def normalize_poi(geojson: Dict[str, Any]) -> Dict[str, Any]:
    src_crs = _resolve_crs(geojson.get("crs"))
    transform = _make_transformer(src_crs)

    pois: List[Dict[str, Any]] = []
    for feat in geojson.get("features", []) or []:
        geom = feat.get("geometry") or {}
        if geom.get("type") != "Point":
            continue
        coords = geom.get("coordinates")
        if not coords or len(coords) < 2:
            continue
        reproj = _reproject_coords(coords, transform)
        lon, lat = reproj[0], reproj[1]

        props = feat.get("properties") or {}
        raw_kind = (
            props.get("waterway")
            or props.get("category")
            or props.get("kind")
            or props.get("type")
            or "rapid"
        )
        kind = WATERWAY_TO_KIND.get(str(raw_kind).lower(), str(raw_kind).lower())
        category = KIND_TO_CATEGORY.get(kind, kind)

        # Class can come from many keys
        class_raw = (
            props.get("rapids_class")
            or props.get("class")
            or props.get("grade")
            or props.get("description/rapids_class")
        )
        grade = _normalize_class(class_raw)
        # If class_raw is a sentence (note text), preserve it as description
        description = props.get("description") or props.get("note")
        if class_raw and grade is None and isinstance(class_raw, str) and len(class_raw) > 4:
            description = description or class_raw

        name = props.get("name")

        pois.append(
            {
                "name": name,
                "kind": kind,
                "category": category,
                "lat": round(float(lat), 6),
                "lon": round(float(lon), 6),
                "grade": grade,
                "description": description,
            }
        )

    return {"type": "FeatureCollection", "pois": pois, "count": len(pois)}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def ingest(run_id: str, polyline_path: Path, poi_path: Path, name: Optional[str] = None) -> Path:
    out_dir = DATA_DIR / run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    with polyline_path.open() as f:
        poly_in = json.load(f)
    with poi_path.open() as f:
        poi_in = json.load(f)

    print(f"Ingesting run '{run_id}'")
    print(f"  polyline: {polyline_path}")
    print(f"  poi:      {poi_path}")

    poly_out = normalize_polyline(poly_in, run_name=name)
    poi_out = normalize_poi(poi_in)

    (out_dir / "polyline.geojson").write_text(json.dumps(poly_out))
    (out_dir / "poi.geojson").write_text(json.dumps(poi_out))

    poly_props = poly_out["features"][0]["properties"]
    meta = {
        "run_id": run_id,
        "name": name or poly_props.get("name"),
        "length_mi": poly_props.get("length_mi"),
        "polyline_point_count": poly_props.get("point_count"),
        "poi_count": poi_out["count"],
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))

    print(f"  ✓ {poly_props['point_count']} points / {poly_props['length_mi']} mi polyline")
    print(f"  ✓ {poi_out['count']} POIs (kinds: ", end="")
    from collections import Counter
    counts = Counter(p["kind"] for p in poi_out["pois"])
    print(", ".join(f"{k}×{v}" for k, v in counts.most_common()) + ")")
    print(f"  → wrote {out_dir}")
    return out_dir


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--run-id", required=True, help="River id, e.g. 'green-river-desolation'")
    ap.add_argument("--polyline", required=True, type=Path, help="Path to polyline GeoJSON")
    ap.add_argument("--poi", required=True, type=Path, help="Path to POI GeoJSON")
    ap.add_argument("--name", default=None, help="Optional human-readable run name")
    args = ap.parse_args()

    ingest(args.run_id, args.polyline, args.poi, name=args.name)


if __name__ == "__main__":
    main()
