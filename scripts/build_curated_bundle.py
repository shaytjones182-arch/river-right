"""
Regenerate /app/frontend/src/curatedData.ts by merging the existing
bundled rivers with any new ones present in /app/data/runs/.

Idempotent: re-running picks up file changes on disk and rewrites the
.ts source. Existing in-bundle entries that no longer have on-disk
counterparts are preserved (defensive — never silently drop a river).
"""
from __future__ import annotations
import json
import re
from pathlib import Path

TS_PATH = Path("/app/frontend/src/curatedData.ts")
RUNS_DIR = Path("/app/data/runs")
RIVER_IMAGES = {
    "green-river-desolation": "https://images.unsplash.com/photo-1626594995085-36b551227b9a?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85",
    "middle-fork-salmon":     "https://images.unsplash.com/photo-1626594995085-36b551227b9a?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85",
}
# Rivers that are gated behind an IAP for OFFLINE-MAP DOWNLOAD only. The
# river detail card and curated maps remain free to view for everyone
# (you only pay to download tiles for offline use, per the established
# "pay to download" → "download" → "downloaded" button sequence). The
# home-screen carousel does NOT show a lock badge for any river — locking
# is enforced inside the river detail screen's download button.
LOCKED_RIVERS: set[str] = set()


def load_existing_bundle() -> dict:
    raw = TS_PATH.read_text()
    m = re.search(r"export const CURATED_BUNDLE: any = (\{.*?\});\s*\n", raw, re.DOTALL)
    if not m:
        raise SystemExit("Could not locate CURATED_BUNDLE in curatedData.ts")
    return json.loads(m.group(1))


def poi_geojson_to_app_pois(poi_path: Path) -> list[dict]:
    """Convert the on-disk POI GeoJSON FeatureCollection back into the flat
    POI dict shape that the app's existing `pois: [...]` array uses."""
    raw = json.loads(poi_path.read_text())
    out = []
    for feat in raw.get("features", []):
        p = feat.get("properties") or {}
        g = feat.get("geometry") or {}
        coords = g.get("coordinates") or [None, None]
        out.append({
            "name": p.get("name"),
            "category": p.get("category"),
            "kind": p.get("kind"),
            "lat": coords[1],
            "lon": coords[0],
            "distance_from_putin_mi": p.get("distance_from_putin_mi") or 0.0,
            "river_mi": p.get("river_mi") or 0.0,
            "grade": p.get("grade"),
            "description": p.get("description"),
            "source": p.get("source") or "curated",
        })
    return out


def build_river_entry(run_dir: Path, existing_run: dict | None = None) -> dict:
    """Build a {featured_summary, run_full} pair for one river on disk.

    If the on-disk POI file is empty (no features), fall back to whatever
    POIs already lived in the previous bundle for this river. This guards
    against accidentally wiping POIs for rivers whose data isn't yet
    mirrored to /app/data/runs/<id>/poi.geojson (e.g. Desolation's
    curated POIs originally lived ONLY inside curatedData.ts).
    """
    river_id = run_dir.name
    meta = json.loads((run_dir / "meta.json").read_text())
    poly = json.loads((run_dir / "polyline.geojson").read_text())
    disk_pois = poi_geojson_to_app_pois(run_dir / "poi.geojson")
    if not disk_pois and existing_run and existing_run.get("pois"):
        pois = list(existing_run["pois"])
        poi_source = "existing-bundle"
    else:
        pois = disk_pois
        poi_source = "curated"
    helpful_info_path = run_dir / "helpful_info.json"
    cfs_path = run_dir / "cfs_thresholds.json"
    helpful = json.loads(helpful_info_path.read_text()) if helpful_info_path.exists() else None
    cfs = json.loads(cfs_path.read_text()) if cfs_path.exists() else None

    img = RIVER_IMAGES.get(river_id, meta.get("image"))
    # If meta.json doesn't carry put_in / take_out / class_rating / usgs
    # info (Desolation is the legacy case — that data lives only inside
    # the existing bundle's runs[id].river block), fall back to the
    # existing bundle so the featured carousel + map overview keep
    # working.
    legacy_river = (existing_run or {}).get("river") or {}
    def _pick(key):
        v = meta.get(key)
        if v is None or v == "" or v == []:
            return legacy_river.get(key) if legacy_river.get(key) not in (None, "", []) else v
        return v
    summary = {
        "id": river_id,
        "name": meta.get("name") or legacy_river.get("name"),
        "state": _pick("state"),
        "class_rating": _pick("class_rating"),
        "type": _pick("type"),
        "osm_names": _pick("osm_names") or [],
        "description": _pick("description") or "",
        "hazards": _pick("hazards") or [],
        "points_of_interest": _pick("points_of_interest") or [],
        "put_in": _pick("put_in"),
        "take_out": _pick("take_out"),
        "usgs_site_id": _pick("usgs_site_id"),
        "usgs_site_name": _pick("usgs_site_name"),
        "image": img,
        "has_curated_data": True,
    }
    if river_id in LOCKED_RIVERS:
        summary["locked"] = True

    river_full = dict(summary)
    if helpful is not None:
        river_full["helpful_info"] = helpful
    elif existing_run and (existing_run.get("river") or {}).get("helpful_info"):
        # Preserve helpful_info that lives only inside the existing bundle.
        river_full["helpful_info"] = existing_run["river"]["helpful_info"]

    run_full = {
        "river": river_full,
        "polyline": poly,
        "pois": pois,
        "poi_source": poi_source,
        "poi_count": len(pois),
        "has_curated_data": True,
    }
    if cfs is not None:
        run_full["cfs_thresholds"] = cfs
    elif existing_run and existing_run.get("cfs_thresholds"):
        # Preserve CFS thresholds that live only inside the existing bundle.
        run_full["cfs_thresholds"] = existing_run["cfs_thresholds"]

    return {"featured": summary, "run": run_full}


def main() -> None:
    bundle = load_existing_bundle()
    runs = {}
    featured_by_id = {}

    # 1. Keep any pre-existing rivers from the bundle that don't have on-disk
    #    counterparts (paranoid safety net — shouldn't happen in practice).
    for entry in bundle.get("featured", []):
        featured_by_id[entry["id"]] = entry
    for rid, run in (bundle.get("runs") or {}).items():
        runs[rid] = run

    # 2. Rebuild every river that has on-disk source data.
    disk_river_ids = []
    existing_runs = bundle.get("runs") or {}
    for run_dir in sorted(RUNS_DIR.iterdir()):
        if not run_dir.is_dir():
            continue
        # Skip the README + any underscore-prefixed dirs (e.g. backup copies).
        if run_dir.name.startswith("_") or not (run_dir / "meta.json").exists():
            continue
        out = build_river_entry(run_dir, existing_run=existing_runs.get(run_dir.name))
        rid = run_dir.name
        featured_by_id[rid] = out["featured"]
        runs[rid] = out["run"]
        disk_river_ids.append(rid)

    # Stable order: Desolation first (paid launch river), then alphabetical
    # for the rest so adding new locked rivers doesn't reshuffle the home
    # screen ordering unpredictably.
    def sort_key(rid: str) -> tuple:
        return (0 if rid == "green-river-desolation" else 1, rid)
    ordered_ids = sorted(featured_by_id.keys(), key=sort_key)
    featured_ordered = [featured_by_id[rid] for rid in ordered_ids]
    runs_ordered = {rid: runs[rid] for rid in ordered_ids if rid in runs}

    new_bundle = {
        "version": bundle.get("version", "1.0.0"),
        "featured": featured_ordered,
        "runs": runs_ordered,
    }
    body = (
        "// AUTO-GENERATED. Do not edit by hand. Regenerate by running\n"
        "// /scripts/build_curated_bundle.py whenever curated run data changes.\n"
        "//\n"
        "// This module ships ALL curated river data inside the app bundle so the\n"
        "// app works fully offline (no backend dependency for rivers list, POIs,\n"
        "// polylines, helpful info, or CFS thresholds). Only LIVE USGS flow data\n"
        "// still requires the network — and that gracefully falls back to \"No\n"
        "// data\" when offline.\n\n"
        "export const CURATED_BUNDLE: any = " + json.dumps(new_bundle) + ";\n"
    )
    TS_PATH.write_text(body)
    print(f"Wrote {TS_PATH} ({TS_PATH.stat().st_size:,} bytes) with {len(featured_ordered)} river(s):")
    for rid in ordered_ids:
        flags = []
        if featured_by_id[rid].get("locked"):
            flags.append("locked")
        if rid in disk_river_ids:
            flags.append("on-disk")
        print(f"  - {rid}  [{', '.join(flags) or 'in-bundle-only'}]")


if __name__ == "__main__":
    main()
