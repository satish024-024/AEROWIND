"""
tests/test_environmental_stack.py
Automated Verification Suite for Multi-Source Geospatial & Environmental Stack.
"""

import pytest
from backend.app.gis.copernicus_dem import dem_client
from backend.app.gis.global_wind_atlas import gwa_client
from backend.app.gis.overpass_client import overpass_client
from backend.app.gis.worldcover_client import worldcover_client
from backend.app.gis.protected_planet_client import protected_planet_client
from backend.app.gis.sentinel_client import sentinel_client


def test_copernicus_dem_slope_and_elevation():
    """Verify Copernicus DEM elevation and 2D spatial slope calculation."""
    res = dem_client.compute_spatial_slope_aspect(lat=19.6743, lon=84.0871, step_meters=30.0)
    assert "elevation_m" in res
    assert "slope_deg" in res
    assert "aspect_deg" in res
    assert 0.0 <= res["slope_deg"] <= 90.0
    assert "Copernicus DEM" in res["source"] or "Open-Meteo" in res["source"]


def test_global_wind_atlas_climatology():
    """Verify Global Wind Atlas 3.0 Weibull and multi-height wind resource."""
    res = gwa_client.get_climatological_resource(lat=19.6743, lon=84.0871)
    assert res["mean_wind_speed_100m"] > 4.0
    assert res["mean_wind_speed_50m"] < res["mean_wind_speed_100m"] < res["mean_wind_speed_200m"]
    assert res["weibull_a"] > 0.0
    assert 1.5 <= res["weibull_k"] <= 3.5
    assert len(res["wind_rose_16_sectors"]) == 16
    total_pct = sum(s["freq_percent"] for s in res["wind_rose_16_sectors"])
    assert 99.0 <= total_pct <= 101.0


def test_osm_overpass_physical_setbacks():
    """Verify OpenStreetMap Overpass queries and setback categorization."""
    res = overpass_client.query_physical_features(center_lat=19.6743, center_lon=84.0871, radius_km=3.0)
    assert "counts" in res
    assert "features" in res
    assert "buildings" in res["features"]
    assert "powerlines" in res["features"]
    assert "highways" in res["features"]
    assert "waterways" in res["features"]


def test_worldcover_land_suitability():
    """Verify ESA WorldCover 10m land cover class and surface roughness."""
    res = worldcover_client.evaluate_concession_landcover(center_lat=19.6743, center_lon=84.0871, radius_km=3.0)
    assert "dominant_class_name" in res
    assert "aerodynamic_roughness_z0_m" in res
    assert res["aerodynamic_roughness_z0_m"] > 0.0
    assert res["construction_suitability"] in ["Preferred", "Buildable", "Restricted", "Excluded"]


def test_protected_planet_wdpa():
    """Verify Protected Planet WDPA v4 conservation area screening."""
    # Test point far from Gir National Park
    res_clear = protected_planet_client.check_protected_area_proximity(lat=19.6743, lon=84.0871)
    assert not res_clear["is_inside_protected_area"]

    # Test point inside/near Gir National Park
    res_gir = protected_planet_client.check_protected_area_proximity(lat=21.1244, lon=70.8242)
    assert res_gir["is_inside_protected_area"]
    assert res_gir["feasibility_status"] == "EXCLUDED"


def test_sentinel_optical_evidence():
    """Verify Copernicus Sentinel-2 L2A STAC metadata."""
    res = sentinel_client.get_latest_optical_scene(lat=19.6743, lon=84.0871)
    assert "Sentinel-2" in res["satellite"]
    assert res["cloud_cover_percent"] <= 15.0
    assert res["spatial_resolution_m"] == 10.0


def test_isric_soil_properties_and_bearing_capacity():
    """Verify ISRIC SoilGrids v2.0 physics and geotechnical bearing capacity calculation."""
    from backend.app.gis.soil_client import soil_client
    res = soil_client.get_soil_properties(lat=16.792, lon=80.821)
    assert "usda_texture_class" in res
    assert "bulk_density_kg_dm3" in res
    assert res["bulk_density_kg_dm3"] > 1.0
    assert res["estimated_bearing_capacity_kpa"] is not None
    assert res["estimated_bearing_capacity_kpa"] > 150.0  # Certified for gravity footing
    assert res["bearing_status"] == "CERTIFIED"
    assert res["hazard_level"] == "SAFE"
    assert res["is_suitable_standard_foundation"] is True

