# Curated River Run Data

This directory holds **clean, curated GeoJSON** for individual river runs. When a
river has data here, RiverRight serves it instead of doing live Overpass queries
— much faster, higher quality, and works offline.

## Directory layout

```
data/runs/
  <river-id>/
    polyline.geojson   # WGS84 MultiLineString of the river path
    poi.geojson        # WGS84 Points with normalized properties
    meta.json          # auto-generated summary (length, counts)
```

`river-id` must match an `id` field in `backend/server.py` `FEATURED_RIVERS`
(e.g. `green-river-desolation`).

## Adding a new run

1. Export from QGIS (or anywhere) — any CRS is fine, it'll be reprojected.
2. Make sure the **POI file** uses these property keys:
   - `name` — feature name
   - `waterway` — one of `rapids`, `waterfall`, `campground`, `slipway`,
     `access_point`, `put_in`, `take_out`, `hazard`, `note`
   - `rapids_class` *(optional)* — Roman numeral like `III`, `IV+`, or numeric `3`–`6`
   - `description` *(optional)* — free text for notes / hazard descriptions
3. Run the ingestion script:

   ```bash
   cd /app/backend
   python ingest_geojson.py \
     --run-id green-river-desolation \
     --polyline /path/to/polyline.geojson \
     --poi      /path/to/poi.geojson \
     --name "Green River — Desolation Canyon"
   ```

4. The backend will pick up the new files automatically on next request
   (in-memory cache; restart backend with `sudo supervisorctl restart backend`
   to force a reload).

## Endpoints affected

- `GET /api/rivers/<id>/polyline` → returns the curated polyline (404 if not curated)
- `GET /api/rivers/<id>/osm-poi`  → returns curated POIs (`source: "curated"`),
  falling back to live OSM Overpass when no curated data exists
- `GET /api/rivers/featured` → each river now has a `has_curated_data` boolean
