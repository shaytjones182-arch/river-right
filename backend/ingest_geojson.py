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


def _chain_segments(segments: List[List[List[float]]]) -> List[List[List[float]]]:
    """Chain segments end-to-end to form a continuous path.

    Greedily attaches whichever remaining segment has an endpoint closest to the
    current chain's tail, reversing the segment if needed. This eliminates the
    artificial "jumps" you get when QGIS exports split a river into chunks in
    arbitrary order, which would otherwise inflate along-river mileage.
    """
    if not segments:
        return []
    chain: List[List[List[float]]] = [list(segments[0])]
    remaining: List[List[List[float]]] = [list(s) for s in segments[1:]]
    while remaining:
        tail = chain[-1][-1]
        best_idx = 0
        best_dist = float("inf")
        best_reverse = False
        for i, seg in enumerate(remaining):
            d_head = _haversine_mi(tail, seg[0])
            d_tail = _haversine_mi(tail, seg[-1])
            if d_head < best_dist:
                best_dist, best_idx, best_reverse = d_head, i, False
            if d_tail < best_dist:
                best_dist, best_idx, best_reverse = d_tail, i, True
        nxt = remaining.pop(best_idx)
        if best_reverse:
            nxt.reverse()
        chain.append(nxt)
    return chain


def _orient_chain(
    chain: List[List[List[float]]],
    anchors: Optional[List[List[float]]] = None,
) -> List[List[List[float]]]:
    """Reverse the whole chain if the FIRST anchor is closer to the chain's
    end than to its start. This makes mile 0 correspond to the upstream end
    (put-in side) when the anchors are roughly in flow order."""
    if not chain or not anchors:
        return chain
    first_anchor = anchors[0]
    head = chain[0][0]
    tail = chain[-1][-1]
    if _haversine_mi(tail, first_anchor) < _haversine_mi(head, first_anchor):
        return [list(reversed(seg)) for seg in reversed(chain)]
    return chain


def normalize_polyline(
    geojson: Dict[str, Any],
    run_name: Optional[str] = None,
    keep_near: Optional[List[List[float]]] = None,  # [[lon,lat], ...] anchor points
    max_dist_mi: float = 60.0,
    orient_anchor: Optional[List[float]] = None,  # [lon,lat] for mile 0 (put-in)
) -> Dict[str, Any]:
    """Reproject + flatten polyline features.

    If `keep_near` is supplied, polyline features whose nearest point is more
    than `max_dist_mi` miles from ANY anchor are dropped. This protects against
    QGIS exports that accidentally include unrelated rivers in the same file.
    """
    src_crs = _resolve_crs(geojson.get("crs"))
    transform = _make_transformer(src_crs)

    def _min_dist_mi_to_anchors(pt: List[float]) -> float:
        if not keep_near:
            return 0.0
        return min(_haversine_mi(pt, a) for a in keep_near)

    # Flatten to a single MultiLineString
    segments: List[List[List[float]]] = []
    name_hint: Optional[str] = None
    dropped_features = 0
    for feat in geojson.get("features", []) or []:
        if not name_hint:
            props = feat.get("properties") or {}
            name_hint = (
                _prop(props, "name", "river_name", "gnisidlabel")
                or None
            )
        geom = feat.get("geometry") or {}
        gtype = geom.get("type")
        coords = geom.get("coordinates")
        if not coords:
            continue
        reproj = _reproject_coords(coords, transform)
        feat_segs: List[List[List[float]]] = []
        if gtype == "LineString":
            feat_segs = [reproj]
        elif gtype == "MultiLineString":
            feat_segs = reproj
        else:
            print(f"  ! Skipping unsupported geometry type: {gtype}", file=sys.stderr)
            continue

        if keep_near:
            # Use sparse sampling of the feature to check distance — cheap & robust
            sampled = [pt for seg in feat_segs for pt in seg[::20] or seg[:1]]
            if sampled and min(_min_dist_mi_to_anchors(pt) for pt in sampled) > max_dist_mi:
                dropped_features += 1
                continue
        segments.extend(feat_segs)

    if not segments:
        raise ValueError("No polyline geometry found in input (after filtering)")

    if dropped_features:
        print(
            f"  ⚠ Dropped {dropped_features} polyline feature(s) far from POI anchors "
            f"(> {max_dist_mi:g} mi)"
        )

    # Chain segments end-to-end (reversing as needed) so the polyline is one
    # continuous path with no spurious jumps.
    if len(segments) > 1:
        segments = _chain_segments(segments)
    # Orient so the upstream end (put-in) is at mile 0.
    if orient_anchor:
        segments = _orient_chain(segments, [orient_anchor])
    elif keep_near:
        segments = _orient_chain(segments, keep_near[:1])

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
    "camp_pitch": "camp",
    "camping": "camp",
    "uncategorized": "camp",  # QGIS sometimes drops the tag — most user POIs are camps
    "uncategori": "camp",  # 10-char truncated form seen in some QGIS exports
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


def _prop(props: Dict[str, Any], *keys: str) -> Any:
    """Look up a property by name OR a 'properties.<name>' fallback (QGIS exports
    sometimes nest keys as literal dotted strings)."""
    for k in keys:
        if k in props and props[k] not in (None, ""):
            return props[k]
        dotted = f"properties.{k}"
        if dotted in props and props[dotted] not in (None, ""):
            return props[dotted]
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
            _prop(props, "waterway", "category", "kind", "type")
            or "rapid"
        )
        kind = WATERWAY_TO_KIND.get(str(raw_kind).lower(), str(raw_kind).lower())
        category = KIND_TO_CATEGORY.get(kind, kind)

        # Class can come from many keys
        class_raw = _prop(
            props,
            "rapids_class",
            "class",
            "grade",
            "description/rapids_class",
        )
        grade = _normalize_class(class_raw)
        # If class_raw is a sentence (note text), preserve it as description
        description = _prop(props, "description", "note")
        if class_raw and grade is None and isinstance(class_raw, str) and len(class_raw) > 4:
            description = description or class_raw

        name = _prop(props, "name")

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

def _load_river_anchors(run_id: str) -> Optional[List[List[float]]]:
    """Read FEATURED_RIVERS from server.py and return [put_in, take_out] as
    anchor points to help orient the polyline (mile 0 should be near put-in)."""
    server_py = Path(__file__).parent / "server.py"
    if not server_py.exists():
        return None
    src = server_py.read_text()
    # Find a block like {"id": "yampa-river", ... "put_in": {"lat":..,"lon":..}, "take_out": {...}}
    # We'll use a forgiving regex search.
    idx = src.find(f'"id": "{run_id}"')
    if idx < 0:
        return None
    blob = src[idx : idx + 4000]
    import re as _re
    def grab(coord_label: str):
        m = _re.search(rf'"{coord_label}":\s*\{{[^}}]*"lat":\s*([\-0-9.]+)[^}}]*"lon":\s*([\-0-9.]+)', blob)
        if not m:
            return None
        return [float(m.group(2)), float(m.group(1))]  # [lon, lat]
    pi = grab("put_in")
    to = grab("take_out")
    out = [p for p in (pi, to) if p]
    return out or None


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

    # Normalize POIs first so we can use their locations as anchors to filter
    # any rogue polyline features (other rivers accidentally included in export).
    poi_out = normalize_poi(poi_in)
    poi_anchors = [[p["lon"], p["lat"]] for p in poi_out["pois"] if p.get("lat") and p.get("lon")]

    # Look up the run's canonical put-in / take-out from server.py for stronger
    # orientation (mile 0 should be the put-in).
    river_anchors = _load_river_anchors(run_id) or []
    if river_anchors:
        labels = ["put_in", "take_out"][: len(river_anchors)]
        print(f"  • River anchors from server.py: "
              + ", ".join(f"{lab}={a}" for lab, a in zip(labels, river_anchors)))
    orient_anchor = river_anchors[0] if river_anchors else (poi_anchors[0] if poi_anchors else None)

    poly_out = normalize_polyline(
        poly_in,
        run_name=name,
        keep_near=(river_anchors + poi_anchors) or None,
        max_dist_mi=60.0,
        orient_anchor=orient_anchor,
    )

    (out_dir / "polyline.geojson").write_text(json.dumps(poly_out))
    (out_dir / "poi.geojson").write_text(json.dumps(poi_out))

    poly_props = poly_out["features"][0]["properties"]
    meta = {
        "run_id": run_id,
        "name": name or poly_props.get("name"),
        "length_mi": poly_props.get("length_mi"),
        "polyline_point_count": poly_props.get("point_count"),
        "polyline_segment_count": poly_props.get("segment_count"),
        "poi_count": poi_out["count"],
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))

    print(f"  ✓ {poly_props['point_count']} points / {poly_props['length_mi']} mi polyline "
          f"({poly_props['segment_count']} segment(s))")
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
