"""RiverRunner backend API tests"""
import os
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://whitewater-guide.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# --- Health ---
def test_root_health(s):
    r = s.get(f"{API}/", timeout=20)
    assert r.status_code == 200
    j = r.json()
    assert j.get("status") == "ok"


# --- Featured rivers ---
def test_featured_rivers(s):
    r = s.get(f"{API}/rivers/featured", timeout=20)
    assert r.status_code == 200
    j = r.json()
    rivers = j.get("rivers", [])
    assert isinstance(rivers, list)
    assert len(rivers) == 8
    needed = {"id", "name", "state", "class_rating", "type", "description", "hazards", "put_in", "take_out", "image"}
    for rv in rivers:
        assert needed.issubset(rv.keys()), f"missing keys: {needed - rv.keys()}"
        assert isinstance(rv["hazards"], list)
        assert "lat" in rv["put_in"] and "lon" in rv["put_in"]
        assert "lat" in rv["take_out"] and "lon" in rv["take_out"]


# --- River detail ---
def test_river_detail_grand_canyon(s):
    r = s.get(f"{API}/rivers/colorado-grand-canyon", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["river"]["id"] == "colorado-grand-canyon"
    flow = j.get("flow")
    if flow is not None:
        assert "status" in flow and "label" in flow
        # cfs may be None if USGS sensor offline, but key should exist
        assert "cfs" in flow


def test_river_not_found(s):
    r = s.get(f"{API}/rivers/does-not-exist", timeout=20)
    assert r.status_code == 404


# --- USGS nearby ---
def test_usgs_nearby_co(s):
    r = s.get(f"{API}/usgs/sites/nearby", params={"lat": 39.5, "lon": -105.5, "radius_miles": 50}, timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert "sites" in j and "count" in j
    assert isinstance(j["sites"], list)
    if j["sites"]:
        s0 = j["sites"][0]
        for k in ("site_id", "name", "lat", "lon", "distance_miles", "status", "label"):
            assert k in s0, f"missing {k} in nearby site"
        assert s0["distance_miles"] <= 50


def test_usgs_nearby_invalid(s):
    r = s.get(f"{API}/usgs/sites/nearby", params={"lat": 999, "lon": 0, "radius_miles": 10}, timeout=15)
    assert r.status_code == 422


# --- USGS search ---
def test_usgs_search_state_co(s):
    r = s.get(f"{API}/usgs/sites/search", params={"q": "CO"}, timeout=40)
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j["sites"], list)
    assert j["count"] == len(j["sites"])
    # CO should have at least some active streamflow sites
    assert len(j["sites"]) > 0


def test_usgs_search_invalid(s):
    r = s.get(f"{API}/usgs/sites/search", params={"q": "longstring"}, timeout=15)
    assert r.status_code == 400


# --- USGS site detail ---
def test_usgs_site_detail(s):
    r = s.get(f"{API}/usgs/site/09380000", timeout=30)
    # Site may sometimes be offline; tolerate 404 but expect 200 typically
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        j = r.json()
        for k in ("site_id", "name", "status", "label"):
            assert k in j
        assert j["site_id"] == "09380000"


def test_usgs_site_invalid_id(s):
    r = s.get(f"{API}/usgs/site/abc123", timeout=15)
    assert r.status_code == 400
