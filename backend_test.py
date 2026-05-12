"""
Backend test suite for RiverRight curated GeoJSON data pipeline.

Tests the new endpoints:
- GET /api/rivers/featured (has_curated_data flag)
- GET /api/rivers/{id}/polyline
- GET /api/rivers/{id}/osm-poi (curated + fallback)
- GET /api/rivers/{id} (regression)
"""
import os
import time
import sys
import json
import requests
from typing import Any, Dict, List

# Use public backend URL from frontend env (Expo project, no REACT_APP_BACKEND_URL).
BASE_URL = "https://whitewater-guide.preview.emergentagent.com"
API = f"{BASE_URL}/api"

PASS = "PASS"
FAIL = "FAIL"

results: List[Dict[str, Any]] = []


def record(name: str, status: str, detail: str = "") -> None:
    results.append({"name": name, "status": status, "detail": detail})
    icon = "✅" if status == PASS else "❌"
    print(f"{icon} {name}: {status}")
    if detail:
        print(f"    -> {detail}")


def test_featured_has_curated_data() -> Dict[str, Any]:
    name = "GET /api/rivers/featured includes has_curated_data"
    r = requests.get(f"{API}/rivers/featured", timeout=30)
    if r.status_code != 200:
        record(name, FAIL, f"status={r.status_code}")
        return {}
    body = r.json()
    rivers = body.get("rivers", [])
    if not rivers:
        record(name, FAIL, "no rivers returned")
        return {}

    missing_flag = [rv.get("id") for rv in rivers if "has_curated_data" not in rv]
    if missing_flag:
        record(name, FAIL, f"{len(missing_flag)} rivers missing has_curated_data: {missing_flag[:5]}")
        return body

    curated_true = [rv["id"] for rv in rivers if rv.get("has_curated_data") is True]
    curated_false_count = sum(1 for rv in rivers if rv.get("has_curated_data") is False)

    detail_parts = [f"total={len(rivers)}", f"curated=true: {curated_true}", f"curated=false: {curated_false_count}"]

    if curated_true != ["green-river-desolation"]:
        record(name, FAIL, f"expected ['green-river-desolation'] to be the only curated river; got {curated_true}")
        return body

    # Verify other fields preserved
    sample = next((rv for rv in rivers if rv["id"] == "green-river-desolation"), None)
    required_fields = ["id", "name", "state", "class_rating", "type"]
    missing = [f for f in required_fields if f not in sample]
    if missing:
        record(name, FAIL, f"green-river-desolation missing fields: {missing}")
        return body

    record(name, PASS, "; ".join(detail_parts))
    return body


def test_polyline_curated() -> None:
    name = "GET /api/rivers/green-river-desolation/polyline"
    r = requests.get(f"{API}/rivers/green-river-desolation/polyline", timeout=30)
    if r.status_code != 200:
        record(name, FAIL, f"status={r.status_code}, body={r.text[:200]}")
        return
    fc = r.json()
    if fc.get("type") != "FeatureCollection":
        record(name, FAIL, f"top type={fc.get('type')}")
        return
    feats = fc.get("features", [])
    if len(feats) < 1:
        record(name, FAIL, "no features")
        return
    feat = feats[0]
    geom = feat.get("geometry", {})
    if geom.get("type") != "MultiLineString":
        record(name, FAIL, f"geometry.type={geom.get('type')}, expected MultiLineString")
        return
    coords = geom.get("coordinates", [])
    if not coords:
        record(name, FAIL, "no coordinates array")
        return
    total_pts = sum(len(seg) for seg in coords)
    max_seg = max(len(seg) for seg in coords) if coords else 0
    if max_seg < 1000:
        record(name, FAIL, f"largest segment has {max_seg} points, expected >= 1000")
        return

    props = feat.get("properties", {})
    length_mi = props.get("length_mi")
    if length_mi is None or abs(length_mi - 83.0) > 2.0:
        record(name, FAIL, f"length_mi={length_mi}, expected ~83.0")
        return

    pname = props.get("name") or ""
    if "Green River" not in pname and "Desolation" not in pname:
        record(name, FAIL, f"properties.name={pname!r} (expected to contain 'Green River' or 'Desolation')")
        return

    # Verify coordinate ranges (WGS84 — lon ~ -110, lat ~ 39)
    sample_seg = max(coords, key=len)
    sample_pts = sample_seg[:: max(1, len(sample_seg) // 50)]
    bad = []
    for pt in sample_pts:
        if len(pt) < 2:
            bad.append(pt)
            continue
        lon, lat = pt[0], pt[1]
        if not (-115 < lon < -105 and 35 < lat < 42):
            bad.append((lon, lat))
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            bad.append((lon, lat))
    if bad:
        record(name, FAIL, f"out-of-range coordinates: {bad[:3]}")
        return

    record(
        name,
        PASS,
        f"segments={len(coords)} total_pts={total_pts} max_seg={max_seg} length_mi={length_mi} name={pname!r}",
    )


def test_polyline_non_curated_404() -> None:
    for rid in ["gauley-river", "ocoee-river"]:
        name = f"GET /api/rivers/{rid}/polyline returns 404"
        r = requests.get(f"{API}/rivers/{rid}/polyline", timeout=30)
        if r.status_code != 404:
            record(name, FAIL, f"status={r.status_code}, expected 404; body={r.text[:200]}")
            continue
        try:
            detail = (r.json().get("detail") or "").lower()
        except Exception:
            detail = ""
        if "curated" not in detail and "polyline" not in detail:
            record(name, FAIL, f"detail does not mention curated/polyline: {detail!r}")
            continue
        record(name, PASS, f"detail={detail!r}")


def test_polyline_invalid_id() -> None:
    name = "GET /api/rivers/invalid-id/polyline returns 404 'River not found'"
    r = requests.get(f"{API}/rivers/invalid-id/polyline", timeout=30)
    if r.status_code != 404:
        record(name, FAIL, f"status={r.status_code}, body={r.text[:200]}")
        return
    try:
        detail = (r.json().get("detail") or "")
    except Exception:
        detail = ""
    if "River not found" not in detail:
        record(name, FAIL, f"detail={detail!r}, expected 'River not found'")
        return
    record(name, PASS, f"detail={detail!r}")


def test_osm_poi_curated() -> None:
    name = "GET /api/rivers/green-river-desolation/osm-poi (curated)"
    t0 = time.time()
    r = requests.get(f"{API}/rivers/green-river-desolation/osm-poi", timeout=30)
    elapsed_ms = (time.time() - t0) * 1000
    if r.status_code != 200:
        record(name, FAIL, f"status={r.status_code}, body={r.text[:200]}")
        return
    body = r.json()
    if body.get("source") != "curated":
        record(name, FAIL, f"source={body.get('source')!r}, expected 'curated'")
        return
    count = body.get("count")
    if count != 38:
        record(name, FAIL, f"count={count}, expected 38")
        return
    pois = body.get("pois", [])
    if len(pois) != 38:
        record(name, FAIL, f"len(pois)={len(pois)}, expected 38")
        return

    # Required fields per POI
    required = ["name", "kind", "category", "lat", "lon", "distance_from_putin_mi"]
    missing_field = None
    for p in pois:
        for f in required:
            if f not in p:
                missing_field = (p.get("name"), f)
                break
        if missing_field:
            break
    if missing_field:
        record(name, FAIL, f"POI missing field: {missing_field}")
        return

    # Kind counts
    kinds = [p["kind"] for p in pois]
    rapid_count = sum(1 for k in kinds if k == "rapid")
    if rapid_count < 30:
        record(name, FAIL, f"only {rapid_count} rapid POIs, expected >= 30; kinds={set(kinds)}")
        return

    expected_kinds = {"boat_ramp", "note", "camp", "access"}
    kind_set = set(kinds)
    missing_kinds = [k for k in expected_kinds if k not in kind_set]
    if missing_kinds:
        record(name, FAIL, f"missing required kinds {missing_kinds}; got {kind_set}")
        return

    # 'note' kind should contain description
    note_pois = [p for p in pois if p["kind"] == "note"]
    if not any(p.get("description") for p in note_pois):
        record(name, FAIL, "no 'note' kind POI has a description field populated")
        return

    # Sorted ascending by distance
    dists = [p["distance_from_putin_mi"] for p in pois]
    if any(dists[i] > dists[i + 1] + 1e-6 for i in range(len(dists) - 1)):
        record(name, FAIL, f"distance_from_putin_mi not sorted ascending. first 5: {dists[:5]}")
        return

    # Latency check (should be fast since served from disk cache)
    if elapsed_ms > 1500:
        record(name, FAIL, f"slow response: {elapsed_ms:.0f}ms")
        return

    record(
        name,
        PASS,
        f"count=38, rapids={rapid_count}, kinds={kind_set}, sorted asc, {elapsed_ms:.0f}ms",
    )


def test_osm_poi_non_curated_fallback() -> None:
    name = "GET /api/rivers/gauley-river/osm-poi (fallback, not curated)"
    # Allow longer timeout since this may hit Overpass live
    try:
        r = requests.get(f"{API}/rivers/gauley-river/osm-poi", timeout=90)
    except requests.exceptions.Timeout:
        record(name, FAIL, "request timed out after 90s (Overpass fallback)")
        return
    if r.status_code != 200:
        record(name, FAIL, f"status={r.status_code}, body={r.text[:200]}")
        return
    body = r.json()
    if body.get("source") == "curated":
        record(name, FAIL, "source should NOT be 'curated' for gauley-river")
        return
    if "pois" not in body or not isinstance(body["pois"], list):
        record(name, FAIL, f"missing 'pois' array; body keys={list(body.keys())}")
        return
    record(
        name,
        PASS,
        f"pois={len(body['pois'])}, cached={body.get('cached')}, source={body.get('source')!r}",
    )


def test_river_detail_regression() -> None:
    name = "GET /api/rivers/green-river-desolation (regression)"
    r = requests.get(f"{API}/rivers/green-river-desolation", timeout=30)
    if r.status_code != 200:
        record(name, FAIL, f"status={r.status_code}, body={r.text[:200]}")
        return
    body = r.json()
    river = body.get("river") or {}
    # Basic fields
    for f in ["id", "name", "state", "class_rating", "type", "put_in", "take_out"]:
        if f not in river:
            record(name, FAIL, f"missing river.{f}")
            return
    if river.get("id") != "green-river-desolation":
        record(name, FAIL, f"river.id={river.get('id')}")
        return
    # flow may or may not be populated (USGS dependency)
    record(
        name,
        PASS,
        f"id={river['id']}, name={river['name'][:40]!r}, flow={'present' if body.get('flow') else 'none'}",
    )


def main() -> int:
    print(f"Running RiverRight backend tests against {API}\n")
    test_featured_has_curated_data()
    test_polyline_curated()
    test_polyline_non_curated_404()
    test_polyline_invalid_id()
    test_osm_poi_curated()
    test_river_detail_regression()
    test_osm_poi_non_curated_fallback()

    print("\n" + "=" * 60)
    passed = sum(1 for r in results if r["status"] == PASS)
    failed = sum(1 for r in results if r["status"] == FAIL)
    print(f"SUMMARY: {passed} passed, {failed} failed (total {len(results)})")
    for r in results:
        icon = "✅" if r["status"] == PASS else "❌"
        print(f"  {icon} {r['name']}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
