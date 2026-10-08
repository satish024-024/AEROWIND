"""
backend/app/db.py — SQLite Database Layer for Projects and Authentication.

Provides:
- Lightweight, zero-config SQLite persistence
- User authentication & password hashing (PBKDF2-HMAC-SHA256)
- Project save, update, retrieve, list, and delete
- Automatic seeding of real prototype wind farm projects
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import shutil

SEED_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "aeroquantum.db"

if os.environ.get("AEROQUANTUM_DB_PATH"):
    DB_PATH = Path(os.environ["AEROQUANTUM_DB_PATH"])
    DB_DIR = DB_PATH.parent
    DB_DIR.mkdir(parents=True, exist_ok=True)
    if SEED_DB_PATH.exists() and not DB_PATH.exists():
        try:
            shutil.copy2(SEED_DB_PATH, DB_PATH)
        except Exception as e:
            print(f"Warning: could not copy seed database to {DB_PATH}: {e}")
elif os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    DB_DIR = Path("/tmp/aeroquantum_data")
    DB_DIR.mkdir(parents=True, exist_ok=True)
    DB_PATH = DB_DIR / "aeroquantum.db"
    if SEED_DB_PATH.exists() and not DB_PATH.exists():
        try:
            shutil.copy2(SEED_DB_PATH, DB_PATH)
        except Exception as e:
            print(f"Warning: could not copy seed database to /tmp: {e}")
else:
    DB_DIR = Path(__file__).resolve().parent.parent / "data"
    try:
        DB_DIR.mkdir(parents=True, exist_ok=True)
    except Exception:
        DB_DIR = Path("/tmp/aeroquantum_data")
        DB_DIR.mkdir(parents=True, exist_ok=True)
    DB_PATH = DB_DIR / "aeroquantum.db"


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 100000)
    return f"{salt}:{key.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    try:
        salt, key_hex = hashed.split(":")
        test_key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 100000)
        return hmac.compare_digest(test_key.hex(), key_hex)
    except Exception:
        return False


def init_db() -> None:
    """Initialize database schema and seed default projects if empty."""
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Projects table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                user_id INTEGER,
                name TEXT NOT NULL,
                location_name TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                area_km2 REAL,
                turbine_count INTEGER DEFAULT 12,
                turbine_model TEXT DEFAULT 'GE 2.5-120',
                rotor_diameter REAL DEFAULT 120,
                hub_height REAL DEFAULT 110,
                spacing_d REAL DEFAULT 5.0,
                wind_speed REAL DEFAULT 7.1,
                wind_direction REAL DEFAULT 300,
                suitability TEXT DEFAULT 'Good',
                gross_aep REAL,
                net_aep REAL,
                wake_loss_percent REAL,
                turbines_json TEXT,
                boundary_json TEXT,
                status TEXT DEFAULT 'configured',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
            )
        """)

        # Defensive migrations for projects table
        for col_def in [
            "soil_bearing_capacity_kpa REAL",
            "usda_texture_class TEXT",
            "foundation_type TEXT DEFAULT 'GRAVITY_BASE'",
            "soil_hazard_level TEXT DEFAULT 'SAFE'",
            "environmental_notes TEXT",
        ]:
            try:
                cursor.execute(f"ALTER TABLE projects ADD COLUMN {col_def}")
            except sqlite3.OperationalError:
                pass

        # Sessions table for tokenless/bearer auth
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at REAL NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """)

        # IBM Quantum Per-User Credentials table (encrypted server-side with AES-256-GCM)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ibm_quantum_credentials (
                id TEXT PRIMARY KEY,
                user_id TEXT UNIQUE NOT NULL,
                encrypted_api_token TEXT NOT NULL,
                crn_or_instance TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used_at TIMESTAMP,
                last_status TEXT DEFAULT 'CONFIGURED'
            )
        """)

        # Real GIS site land assessment cache
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS site_land_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cache_key TEXT UNIQUE NOT NULL,
                center_lat REAL NOT NULL,
                center_lon REAL NOT NULL,
                radius_km REAL NOT NULL,
                elevation_min REAL,
                elevation_max REAL,
                elevation_mean REAL,
                slope_mean REAL,
                wind_speed_100m REAL,
                wind_direction_100m REAL,
                weibull_a REAL,
                weibull_k REAL,
                air_density REAL,
                dominant_lulc TEXT,
                buildable_percent REAL,
                restricted_percent REAL,
                excluded_percent REAL,
                roads_count INTEGER DEFAULT 0,
                buildings_count INTEGER DEFAULT 0,
                waterways_count INTEGER DEFAULT 0,
                osm_features_json TEXT,
                elevation_samples_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Authoritative National Institute of Wind Energy (NIWE) / MNRE wind energy hotspots for India
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS india_wind_hotspots (
                id TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                district TEXT NOT NULL,
                location_name TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                annual_mean_wind_mps REAL NOT NULL,
                wind_direction_deg REAL NOT NULL,
                weibull_a REAL NOT NULL,
                weibull_k REAL NOT NULL,
                capacity_factor_est REAL NOT NULL,
                terrain_type TEXT NOT NULL,
                elevation_m REAL NOT NULL,
                grid_proximity_km REAL NOT NULL,
                niwe_wind_class TEXT NOT NULL,
                description TEXT
            )
        """)

        # Authoritative Survey of India & validated boundary cache
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS authoritative_boundary_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cache_key TEXT UNIQUE NOT NULL,
                state TEXT,
                district TEXT,
                subdistrict TEXT,
                village TEXT,
                village_id TEXT,
                authority TEXT NOT NULL,
                source_status TEXT NOT NULL,
                dataset TEXT,
                version TEXT,
                crs TEXT DEFAULT 'EPSG:4326',
                projected_crs TEXT,
                geometry_type TEXT NOT NULL,
                geometry_json TEXT NOT NULL,
                area_m2 REAL,
                area_km2 REAL,
                perimeter_km REAL,
                geometry_repaired INTEGER DEFAULT 0,
                retrieved_at TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.commit()

        # Seed initial projects if table is empty
        cursor.execute("SELECT COUNT(*) FROM projects")
        if cursor.fetchone()[0] == 0:
            seed_default_projects(conn)

        # Seed India wind energy hotspots if empty
        cursor.execute("SELECT COUNT(*) FROM india_wind_hotspots")
        if cursor.fetchone()[0] == 0:
            seed_india_hotspots(conn)


def seed_default_projects(conn: sqlite3.Connection) -> None:
    """Seed benchmark engineering projects for instant Screen 0 loading."""
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    cursor = conn.cursor()

    projects = [
        (
            "proj-kanyakumari-01",
            None,
            "Kanyakumari Wind Complex",
            "Kanyakumari, Tamil Nadu, India",
            8.0883,
            77.5385,
            11.0,
            12,
            "GE 2.5-120",
            120,
            110,
            5.0,
            7.1,
            300,
            "Good",
            92.0,
            83.2,
            9.5,
            json.dumps([]),
            json.dumps([]),
            "optimized",
            now,
            now,
        ),
        (
            "proj-jaisalmer-02",
            None,
            "Jaisalmer Desert Array",
            "Jaisalmer, Rajasthan, India",
            26.9157,
            70.9083,
            16.5,
            16,
            "Siemens Gamesa SG 3.4-132",
            132,
            120,
            5.5,
            7.8,
            245,
            "Good",
            112.4,
            102.5,
            8.8,
            json.dumps([]),
            json.dumps([]),
            "simulated",
            now,
            now,
        ),
        (
            "proj-kutch-03",
            None,
            "Kutch Coastal Farm",
            "Kutch, Gujarat, India",
            23.7337,
            69.8597,
            22.0,
            20,
            "Vestas V110-2.0MW",
            110,
            100,
            5.0,
            8.2,
            270,
            "Good",
            149.3,
            134.1,
            10.2,
            json.dumps([]),
            json.dumps([]),
            "configured",
            now,
            now,
        ),
    ]

    cursor.executemany("""
        INSERT INTO projects (
            id, user_id, name, location_name, latitude, longitude, area_km2,
            turbine_count, turbine_model, rotor_diameter, hub_height, spacing_d,
            wind_speed, wind_direction, suitability, gross_aep, net_aep,
            wake_loss_percent, turbines_json, boundary_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, projects)
    conn.commit()


def seed_india_hotspots(conn: sqlite3.Connection) -> None:
    """Seeds authoritative National Institute of Wind Energy (NIWE) hotspots across India."""
    cursor = conn.cursor()
    hotspots = [
        # Tamil Nadu
        ("hotspot-tn-01", "Tamil Nadu", "Kanyakumari", "Muppandal Wind Complex", 8.2583, 77.5517, 8.6, 265.0, 9.7, 2.3, 38.5, "Gap Winds / Coastal Foothills", 65.0, 4.2, "Class I", "Asia's largest onshore operational wind cluster with high jet gap acceleration through the Palakkad / Aralvaimozhi gap."),
        ("hotspot-tn-02", "Tamil Nadu", "Tirunelveli", "Kayathar Wind Corridor", 8.9500, 77.7800, 7.9, 270.0, 8.9, 2.2, 34.2, "Alluvial Plain", 95.0, 8.5, "Class I", "Historic wind testing corridor with high 400kV substation grid connectivity."),
        ("hotspot-tn-03", "Tamil Nadu", "Theni", "Theni Palakkad Pass Corridor", 9.9800, 77.4800, 8.1, 250.0, 9.1, 2.1, 35.8, "Mountain Valley Funnel", 280.0, 12.0, "Class I", "Western Ghats natural wind funnel with persistent southwest monsoon flow."),
        ("hotspot-tn-04", "Tamil Nadu", "Kanyakumari", "Kanyakumari Coastal Array", 8.0883, 77.5385, 7.6, 275.0, 8.6, 2.1, 32.5, "Coastal Plain", 18.0, 3.1, "Class II", "Three-seas junction coastal marine breeze corridor with smooth laminar flow."),
        # Gujarat
        ("hotspot-gj-01", "Gujarat", "Kutch", "Jakhau Coastal Wind Park", 23.2386, 68.7042, 8.4, 240.0, 9.5, 2.3, 37.1, "Coastal Saline Flat", 12.0, 6.0, "Class I", "Arabian Sea coastal expanse with high-density unshaded wind flow."),
        ("hotspot-gj-02", "Gujarat", "Porbandar", "Porbandar Coast Belt", 21.6417, 69.6293, 7.8, 235.0, 8.8, 2.2, 33.6, "Coastal Scrub", 25.0, 5.5, "Class I", "Saurashtra peninsula deep coastal wind front with steady sea breeze."),
        ("hotspot-gj-03", "Gujarat", "Rajkot", "Rajkot Central Plateau", 22.3039, 70.8022, 7.2, 245.0, 8.1, 2.0, 30.2, "Basalt Plateau", 134.0, 14.2, "Class II", "Central Saurashtra elevated plateau terrain with low aerodynamic roughness."),
        ("hotspot-gj-04", "Gujarat", "Jamnagar", "Gulf of Kutch South Coast", 22.4707, 70.0577, 7.5, 230.0, 8.5, 2.1, 32.0, "Alluvial Scrub", 18.0, 9.0, "Class II", "Gulf of Kutch coastal transition zone with high availability factors."),
        # Rajasthan
        ("hotspot-rj-01", "Rajasthan", "Jaisalmer", "Jaisalmer Desert Plateau", 26.9157, 70.9083, 7.7, 220.0, 8.7, 2.2, 33.0, "Arid Sandstone Plateau", 225.0, 15.0, "Class II", "India's landmark desert wind park with 1064+ MW operational capacity."),
        ("hotspot-rj-02", "Rajasthan", "Barmer", "Barmer Southern Thar", 25.7521, 71.3967, 7.3, 215.0, 8.2, 2.0, 30.5, "Semi-Arid Desert", 180.0, 18.5, "Class II", "Thar Desert southern margin with thermal convective winds."),
        ("hotspot-rj-03", "Rajasthan", "Phalodi", "Phalodi Renewable Zone", 27.1333, 72.3667, 7.1, 225.0, 8.0, 2.0, 29.8, "Open Desert Plain", 210.0, 22.0, "Class II", "High-irradiance hybrid solar-wind co-located development zone."),
        # Karnataka
        ("hotspot-ka-01", "Karnataka", "Gadag", "Gadag Kappatagudda Ridge", 15.4314, 75.6322, 8.0, 260.0, 9.0, 2.2, 35.0, "Elevated Iron-Ore Ridge", 670.0, 11.0, "Class I", "Kappatagudda hill range with ridge-induced aerodynamic wind speedup."),
        ("hotspot-ka-02", "Karnataka", "Chitradurga", "Chitradurga Wind Belt", 14.2251, 76.3980, 7.8, 265.0, 8.8, 2.1, 33.8, "Granite Inselberg Scrub", 730.0, 7.8, "Class I", "High-capacity wind corridor serving Southern Regional Load Despatch."),
        ("hotspot-ka-03", "Karnataka", "Davanagere", "Davanagere Plains", 14.4644, 75.9218, 7.4, 255.0, 8.3, 2.0, 31.4, "Deccan Plateau Scrub", 600.0, 10.5, "Class II", "Central Karnataka transition plateau with consistent summer monsoons."),
        ("hotspot-ka-04", "Karnataka", "Belagavi", "Belagavi Escarpment", 15.8497, 74.4977, 7.5, 250.0, 8.5, 2.1, 32.1, "Western Ghats Crest", 762.0, 13.0, "Class II", "Upper Deccan escarpment with southwest monsoonal surges."),
        # Maharashtra
        ("hotspot-mh-01", "Maharashtra", "Satara", "Chalkewadi Tableland Plateau", 17.6805, 73.9997, 8.2, 255.0, 9.3, 2.2, 36.2, "Laterite Tableland Plateau", 1050.0, 16.0, "Class I", "Famous high-altitude wind plateau overlooking Koyna reservoir."),
        ("hotspot-mh-02", "Maharashtra", "Sangli", "Sangli Jath Ridge", 16.8524, 74.5815, 7.6, 260.0, 8.6, 2.1, 32.7, "Elevated Ridge Scrub", 580.0, 8.0, "Class II", "Southern Maharashtra continuous ridge system."),
        ("hotspot-mh-03", "Maharashtra", "Dhule", "Dhule Vankusawade North", 20.9042, 74.7749, 7.3, 250.0, 8.2, 2.0, 30.8, "Tapi Basin Plateau", 390.0, 12.5, "Class II", "Northern Khandesh plateau wind cluster."),
        # Andhra Pradesh
        ("hotspot-ap-01", "Andhra Pradesh", "Anantapur", "Anantapur Beluguppa Belt", 14.6819, 77.6006, 7.8, 260.0, 8.8, 2.2, 34.0, "Arid Deccan Scrub", 335.0, 9.5, "Class I", "Rayalaseema high-resource wind belt with ultra-mega renewable parks."),
        ("hotspot-ap-02", "Andhra Pradesh", "Kurnool", "Kurnool Aspari Plateau", 15.8281, 78.0373, 7.5, 255.0, 8.5, 2.1, 32.2, "Open Scrubland", 273.0, 14.0, "Class II", "Integrated hybrid renewable energy corridor."),
        # Madhya Pradesh
        ("hotspot-mp-01", "Madhya Pradesh", "Dewas", "Dewas Malwa Plateau", 22.9676, 76.0534, 7.1, 245.0, 8.0, 2.0, 29.5, "Black Soil Plateau", 535.0, 11.2, "Class II", "Central India Malwa plateau wind development hub."),
        # Odisha
        ("hotspot-od-01", "Odisha", "Kandhamal", "Brahmanigaon Highland Ridge", 19.6743, 84.0871, 7.4, 215.0, 8.3, 2.1, 31.5, "Eastern Ghats Highland", 804.0, 19.0, "Class II", "Eastern Ghats upland corridor with steady thermal updrafts and low roughness."),
        ("hotspot-od-02", "Odisha", "Koraput", "Damanjodi Panchpatmali", 18.7733, 82.9972, 7.7, 220.0, 8.7, 2.2, 33.2, "Bauxite Hill Crest", 980.0, 14.5, "Class I", "High-altitude Panchpatmali bauxite ridge with strong diurnal winds."),
        # Kerala
        ("hotspot-kl-01", "Kerala", "Idukki", "Ramakkalmedu Precipice", 9.8000, 77.2400, 9.2, 270.0, 10.4, 2.4, 42.0, "Western Ghats Precipice", 1100.0, 21.0, "Class I", "Highest recorded onshore wind velocity in South India (gale-force monsoonal winds)."),
    ]

    cursor.executemany("""
        INSERT OR IGNORE INTO india_wind_hotspots (
            id, state, district, location_name, latitude, longitude,
            annual_mean_wind_mps, wind_direction_deg, weibull_a, weibull_k,
            capacity_factor_est, terrain_type, elevation_m, grid_proximity_km,
            niwe_wind_class, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, hotspots)
    conn.commit()


# Initialize database when module is imported
init_db()

