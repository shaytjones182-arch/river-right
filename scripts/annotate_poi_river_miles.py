#!/usr/bin/env python3
"""Compute each POI's river-mile distance from the put-in and rewrite
poi.geojson with that field populated + features sorted by it.

Usage:
    python3 scripts/annotate_poi_river_miles.py main-salmon-canyon middle-fork-salmon

Algorithm (matches the in-app projectOnPoly implementation in
/app/frontend/app/track.tsx and /app/frontend/app/map.tsx):
  1. Flatten the run's polyline into (lat, lon) vertices.
  2. Project into a local equirectangular plane centered on the mean
     latitude (accurate to ~0.1% for runs < 100 mi).
  3. Build a cumulative-meters index along the line.
  4. Find the vertex-projected cumulative meters for the put-in coord
     from meta.json. Detect direction: if the take-out projects at a
     SMALLER cum than the put-in, we reverse the polyline once.
  5. For each POI, project onto the (possibly-reversed) line and
     compute river-miles as (poi_cum - putin_cum) * 1/1609.344.
  6. Sort features by that value ascending; write back.

The distance is stored on both `distance_from_putin_mi` (existing field
name used by the app) and `river_mi` (kept as a mirror for backwards
compatibility with any older code paths).
"""
from __future__ import annotations
import json, math, sys
from pathlib import Path

RUNS_DIR = Path(__file__).parent.parent / "data" / "runs"
M_PER_MI = 1609.344


def _flatten_polyline(gj: dict) -> list[tuple[float, float]]:
    """Return [(lat, lon), ...] for the run. Handles FeatureCollection of
    LineString / MultiLineString. Concatenates multi-segment features in
    the order they appear on disk."""
    coords: list[tuple[float, float]] = []
    feats = gj.get("features") if gj.get("type") == "FeatureCollection" else [gj]
    for f in feats or []:
        g = f.get("geometry") if f.get("type") == "Feature" else f
        if not g:
            continue
        t = g.get("type")
        cc = g.get("coordinates") or []
        if t == "LineString":
            coords.extend((lat, lon) for lon, lat in cc)
        elif t == "MultiLineString":
            for seg in cc:
                coords.extend((lat, lon) for lon, lat in seg)
    return coords


def _project_index(coords: list[tuple[float, float]]) -> tuple[list[tuple[float, float]], list[float], float]:
    """Return (xy_verts, cum_meters, ref_lat) for a fast projectOnPoly."""
    R = 6378137.0
    ref_lat = sum(lat for lat, _ in coords) / len(coords)
    lat0 = ref_lat * math.pi / 180.0
    cos0 = math.cos(lat0)
    xy = [
        (R * (lon * math.pi / 180.0) * cos0, R * (lat * math.pi / 180.0))
        for lat, lon in coords
    ]
    cum = [0.0] * len(xy)
    for i in range(1, len(xy)):
        dx = xy[i][0] - xy[i - 1][0]
        dy = xy[i][1] - xy[i - 1][1]
        cum[i] = cum[i - 1] + math.sqrt(dx * dx + dy * dy)
    return xy, cum, ref_lat


def _project_pt(xy: list[tuple[float, float]], cum: list[float], ref_lat: float,
                lat: float, lon: float) -> tuple[float, float]:
    """Return (cum_meters_at_projection, perp_dist_m). Segment-wise."""
    R = 6378137.0
    lat0 = ref_lat * math.pi / 180.0
    px = R * (lon * math.pi / 180.0) * math.cos(lat0)
    py = R * (lat * math.pi / 180.0)
    best_d = float("inf")
    best_cum = 0.0
    for i in range(1, len(xy)):
        ax, ay = xy[i - 1]
        bx, by = xy[i]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        t = 0.0 if seg2 == 0 else ((px - ax) * dx + (py - ay) * dy) / seg2
        t = max(0.0, min(1.0, t))
        qx, qy = ax + t * dx, ay + t * dy
        ddx, ddy = px - qx, py - qy
        d = math.sqrt(ddx * ddx + ddy * ddy)
        if d < best_d:
            best_d = d
            best_cum = cum[i - 1] + t * math.sqrt(seg2)
    return best_cum, best_d


def annotate(run_id: str) -> None:
    run_dir = RUNS_DIR / run_id
    meta = json.loads((run_dir / "meta.json").read_text())
    put_in = meta.get("put_in") or {}
    take_out = meta.get("take_out") or {}
    if not put_in.get("lat") or not take_out.get("lat"):
        raise SystemExit(f"{run_id}: meta.json missing put_in / take_out")

    poly_gj = json.loads((run_dir / "polyline.geojson").read_text())
    coords = _flatten_polyline(poly_gj)
    if len(coords) < 2:
        raise SystemExit(f"{run_id}: polyline has < 2 vertices")

    xy, cum, ref_lat = _project_index(coords)
    put_cum, _ = _project_pt(xy, cum, ref_lat, put_in["lat"], put_in["lon"])
    take_cum, _ = _project_pt(xy, cum, ref_lat, take_out["lat"], take_out["lon"])

    # Direction check: if take-out cum-projects BEFORE the put-in, the
    # on-disk polyline runs upstream. Reverse it so cumulative meters
    # increase downstream from the put-in.
    reversed_dir = False
    if take_cum < put_cum:
        reversed_dir = True
        coords = list(reversed(coords))
        xy, cum, ref_lat = _project_index(coords)
        put_cum, _ = _project_pt(xy, cum, ref_lat, put_in["lat"], put_in["lon"])
        take_cum, _ = _project_pt(xy, cum, ref_lat, take_out["lat"], take_out["lon"])

    total_mi = (take_cum - put_cum) / M_PER_MI

    # Annotate + sort POIs
    poi_path = run_dir / "poi.geojson"
    gj = json.loads(poi_path.read_text())
    feats = gj.get("features") or []
    annotated: list[tuple[float, dict]] = []
    for f in feats:
        g = f.get("geometry") or {}
        c = g.get("coordinates") or [None, None]
        lon, lat = c[0], c[1]
        if lat is None or lon is None:
            annotated.append((float("inf"), f))
            continue
        poi_cum, perp = _project_pt(xy, cum, ref_lat, lat, lon)
        mi = max(0.0, (poi_cum - put_cum) / M_PER_MI)
        # Clamp: any POI whose projection lands past the take-out (drift
        # beyond the mapped section) gets clamped to the run length.
        mi = min(mi, total_mi + 0.05)
        props = dict(f.get("properties") or {})
        props["distance_from_putin_mi"] = round(mi, 2)
        props["river_mi"] = round(mi, 2)
        annotated.append((mi, {**f, "properties": props}))

    annotated.sort(key=lambda x: x[0])
    gj["features"] = [f for _, f in annotated]
    poi_path.write_text(json.dumps(gj, indent=2))

    print(f"{run_id}: annotated {len(feats)} POIs "
          f"(reversed_polyline={reversed_dir}, "
          f"put_in→take_out ≈ {total_mi:.2f} mi)")


def main():
    ids = sys.argv[1:] or ["main-salmon-canyon", "middle-fork-salmon"]
    for rid in ids:
        annotate(rid)


if __name__ == "__main__":
    main()
