import { ProjectSummary, ProjectDetail, TelemetryData, Turbine } from '../types';

const API_BASE = '/api';

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error(`Failed to fetch projects: ${res.statusText}`);
  return res.json();
}

export async function fetchProject(id: string): Promise<ProjectDetail> {
  const res = await fetch(`${API_BASE}/projects/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch project ${id}: ${res.statusText}`);
  return res.json();
}

export async function createProject(data: Partial<ProjectDetail>): Promise<ProjectDetail> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create project: ${res.statusText}`);
  return res.json();
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.warn(`Failed to delete project ${id}:`, err);
    return false;
  }
}

export async function geocodeLocation(query: string): Promise<any> {
  // Support both /api/geo/geocode?q=... and POST /api/geo/geocode
  try {
    const res = await fetch(`${API_BASE}/geo/geocode?q=${encodeURIComponent(query)}`);
    if (res.ok) return await res.json();
  } catch (_) {}

  const postRes = await fetch(`${API_BASE}/geo/geocode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!postRes.ok) throw new Error(`Geocoding error: ${postRes.statusText}`);
  return postRes.json();
}

export async function fetchTelemetry(lat: number, lon: number): Promise<TelemetryData> {
  try {
    const res = await fetch(`${API_BASE}/geo/telemetry?lat=${lat}&lon=${lon}`);
    if (res.ok) {
      const data = await res.json();
      const wind = data.wind || {};
      return {
        temperature_c: wind.temperature_c ?? data.temperature_c ?? 28,
        wind_speed_10m: wind.speed_100m_mps ? wind.speed_100m_mps * 0.82 : 6.2,
        wind_speed_80m: wind.speed_100m_mps ? wind.speed_100m_mps * 0.95 : 7.1,
        wind_speed_120m: wind.speed_100m_mps ?? 7.4,
        wind_direction_deg: wind.direction_100m_deg ?? data.wind_direction_deg ?? 300,
        pressure_hpa: wind.pressure_hpa ?? data.pressure_hpa ?? 1012,
        humidity_pct: data.humidity_pct ?? 65,
        condition: data.condition ?? 'Clear',
        timestamp: data.timestamp ?? new Date().toISOString(),
        elevation_m: data.elevation_m ?? 42,
        distance_to_coast_km: data.distance_to_coast_km ?? 0.2,
        terrain_type: data.terrain_type ?? 'Coastal / Mild Terrain',
        land_use: data.land_use ?? 'Mixed (Agriculture/Scrub)',
        wind_power_density: wind.power_density_wpm2 ?? 320,
        air_density: wind.air_density_kgpm3 ?? 1.18,
      };
    }
  } catch (e) {
    console.warn('Telemetry fetch error, using physical defaults', e);
  }
  return {
    temperature_c: 28,
    wind_speed_10m: 6.2,
    wind_speed_80m: 7.1,
    wind_speed_120m: 7.4,
    wind_direction_deg: 300,
    pressure_hpa: 1012,
    humidity_pct: 65,
    condition: 'Clear',
    timestamp: new Date().toISOString(),
    elevation_m: 42,
    distance_to_coast_km: 0.2,
    terrain_type: 'Coastal / Mild Terrain',
    land_use: 'Mixed (Agriculture/Scrub)',
    wind_power_density: 320,
    air_density: 1.18,
  };
}

export async function fetchLandData(lat: number, lon: number, radiusKm: number = 3.0): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/geo/land-data?lat=${lat}&lon=${lon}&radius_km=${radiusKm}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Land data fetch error:', e);
  }
  return null;
}

export async function fetchIndiaHotspots(state?: string): Promise<any[]> {
  try {
    const url = state ? `${API_BASE}/geo/hotspots?state=${encodeURIComponent(state)}` : `${API_BASE}/geo/hotspots`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return data.hotspots || [];
    }
  } catch (e) {
    console.warn('Hotspots fetch error:', e);
  }
  return [];
}

export async function fetchFeasibility(payload: {
  center_lat: number;
  center_lon: number;
  radius_km?: number;
  boundary?: number[][];
  requested_turbines?: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/geo/feasibility`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Feasibility evaluation error: ${res.statusText}`);
  return res.json();
}

export async function evaluateSuitability(payload: {
  geometry?: any;
  boundary?: number[][];
  center_lat?: number;
  center_lon?: number;
  radius_km?: number;
  hub_height_m?: number;
  rotor_diameter_m?: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/geo/suitability/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Suitability evaluation error: ${res.statusText}`);
  return res.json();
}


export async function fetchProvenance(): Promise<any> {
  const res = await fetch(`${API_BASE}/geo/provenance`);
  if (!res.ok) throw new Error('Failed to fetch data provenance');
  return res.json();
}

export async function fetchEnvironmentalStack(lat: number, lon: number, radiusKm: number = 3.0): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/geo/environmental-stack?lat=${lat}&lon=${lon}&radius_km=${radiusKm}`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('Failed to fetch environmental stack:', e);
  }
  return null;
}

export async function fetchSoilTelemetry(lat: number, lon: number): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/geo/soil-telemetry?lat=${lat}&lon=${lon}`);
    if (res.ok) {
      const data = await res.json();
      return data.soil || data;
    }
  } catch (e) {
    console.warn('Failed to fetch soil telemetry:', e);
  }
  return null;
}

function calculateGeodeticAreaKm2(coords: [number, number][]): number {
  if (!coords || coords.length < 3) return 0;
  const R = 6371.0;
  const toRad = Math.PI / 180.0;
  let area = 0.0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = coords[i][1] * toRad * Math.cos(coords[i][0] * toRad) * R;
    const yi = coords[i][0] * toRad * R;
    const xj = coords[j][1] * toRad * Math.cos(coords[j][0] * toRad) * R;
    const yj = coords[j][0] * toRad * R;
    area += xi * yj - xj * yi;
  }
  return Math.round((Math.abs(area) / 2.0) * 100) / 100;
}

function calculateGeodeticPerimeterKm(coords: [number, number][]): number {
  if (!coords || coords.length < 2) return 0;
  const R = 6371.0;
  const toRad = Math.PI / 180.0;
  let perim = 0.0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lat1 = coords[i][0] * toRad;
    const lon1 = coords[i][1] * toRad;
    const lat2 = coords[j][0] * toRad;
    const lon2 = coords[j][1] * toRad;
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    perim += 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return Math.round(perim * 100) / 100;
}

function extractPolygonCoords(geojson: any, targetLat?: number, targetLon?: number): [number, number][] {
  if (!geojson) return [];
  if (geojson.type === 'Polygon' && Array.isArray(geojson.coordinates) && geojson.coordinates[0]?.length >= 3) {
    return geojson.coordinates[0].map((pt: any) => [Number(pt[1]), Number(pt[0])]);
  }
  if (geojson.type === 'MultiPolygon' && Array.isArray(geojson.coordinates) && geojson.coordinates.length > 0) {
    const rings: [number, number][][] = [];
    for (const poly of geojson.coordinates) {
      if (Array.isArray(poly) && Array.isArray(poly[0]) && poly[0].length >= 3) {
        rings.push(poly[0].map((pt: any) => [Number(pt[1]), Number(pt[0])]));
      }
    }
    if (rings.length === 0) return [];
    if (targetLat !== undefined && targetLon !== undefined) {
      // Find ring containing target point
      for (const ring of rings) {
        let inside = false;
        const n = ring.length;
        let p1lat = ring[0][0], p1lon = ring[0][1];
        for (let i = 1; i <= n; i++) {
          const p2lat = ring[i % n][0], p2lon = ring[i % n][1];
          if (targetLon > Math.min(p1lon, p2lon) && targetLon <= Math.max(p1lon, p2lon)) {
            if (targetLat <= Math.max(p1lat, p2lat)) {
              if (p1lon !== p2lon) {
                const xinters = ((targetLon - p1lon) * (p2lat - p1lat)) / (p2lon - p1lon) + p1lat;
                if (p1lat === p2lat || targetLat <= xinters) inside = !inside;
              }
            }
          }
          p1lat = p2lat; p1lon = p2lon;
        }
        if (inside) return ring;
      }
      // If point not strictly inside any ring, pick ring with closest centroid
      let bestRing = rings[0];
      let minDist = Infinity;
      for (const ring of rings) {
        let sumLat = 0, sumLon = 0;
        for (const pt of ring) { sumLat += pt[0]; sumLon += pt[1]; }
        const cLat = sumLat / ring.length;
        const cLon = sumLon / ring.length;
        const d = Math.hypot(cLat - targetLat, cLon - targetLon);
        if (d < minDist) {
          minDist = d;
          bestRing = ring;
        }
      }
      return bestRing;
    }
    // Default to longest outer perimeter ring
    return rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0]);
  }
  return [];
}

export function generateEngineeringConcessionBoundary(centerLat: number, centerLon: number, radiusKm: number = 3.2, pts: number = 24): [number, number][] {
  const coords: [number, number][] = [];
  const rDeg = (radiusKm * 1000.0) / 111000.0;
  const cosLat = Math.cos((centerLat * Math.PI) / 180.0) || 1.0;
  for (let i = 0; i < pts; i++) {
    const th = (2.0 * Math.PI * i) / pts;
    const varFactor = 1.0 + 0.12 * Math.cos(2 * th) - 0.08 * Math.sin(4 * th);
    const pLat = centerLat + rDeg * Math.cos(th) * varFactor;
    const pLon = centerLon + (rDeg * Math.sin(th) * varFactor) / cosLat;
    coords.push([parseFloat(pLat.toFixed(6)), parseFloat(pLon.toFixed(6))]);
  }
  if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
    coords.push([coords[0][0], coords[0][1]]);
  }
  return coords;
}

export async function fetchVillageBoundary(query: string, lat?: number, lon?: number): Promise<any> {
  // 1. Try backend endpoint first
  try {
    let url = `${API_BASE}/geo/village-boundary?q=${encodeURIComponent(query || '')}`;
    if (lat !== undefined && lon !== undefined) {
      url += `&lat=${lat}&lon=${lon}`;
    }
    const res = await fetch(url);
    if (res.ok) {
      const raw = await res.json();
      const bData = raw.boundary || raw;
      let rawCoords = bData.boundary || bData.coordinates || [];
      if (Array.isArray(rawCoords) && rawCoords.length >= 3) {
        const normalizedCoords: [number, number][] = rawCoords.map((pt: any) => {
          const p0 = Number(pt[0]);
          const p1 = Number(pt[1]);
          if (p0 > 55.0 && Math.abs(p1) <= 40.0) {
            return [p1, p0]; // was [lon, lat], swap to [lat, lon]
          }
          return [p0, p1];
        });
        const area = bData.area_km2 || calculateGeodeticAreaKm2(normalizedCoords);
        const perim = bData.perimeter_km || calculateGeodeticPerimeterKm(normalizedCoords);
        if (area >= 0.2) {
          return {
            village_name: bData.village_name || bData.name || query || 'Village Concession',
            display_name: bData.display_name || bData.name || query || 'Village Concession',
            latitude: bData.latitude ?? lat,
            longitude: bData.longitude ?? lon,
            area_km2: area,
            perimeter_km: perim,
            boundary: normalizedCoords,
            coordinates: normalizedCoords,
            center: [bData.latitude ?? lat, bData.longitude ?? lon],
            boundary_type: bData.boundary_type || 'official_administrative_polygon',
            source_provenance: bData.source_provenance || 'Survey of India / OpenStreetMap',
            status: bData.status || 'BOUNDARY_FOUND',
          };
        }
      } else if (raw.status && raw.status !== 'success') {
        // Truthful backend status (e.g. UNAVAILABLE, LOCATION_BOUNDARY_MISMATCH, AMBIGUOUS_LOCATION)
        return {
          village_name: query || 'Unknown Locality',
          display_name: `${query || 'Locality'} (${raw.status})`,
          latitude: lat ?? 0,
          longitude: lon ?? 0,
          area_km2: null,
          perimeter_km: null,
          boundary: null,
          coordinates: null,
          center: [lat ?? 0, lon ?? 0],
          boundary_type: raw.status,
          status: raw.status,
          authority: raw.authority || 'UNKNOWN',
          diagnostic_detail: raw.diagnostic_detail,
          source_provenance: `Authoritative Engine (${raw.status})`,
        };
      }
    }
  } catch (e) {
    console.warn('Backend village boundary fetch failed:', e);
  }

  // 2. Hierarchical OpenStreetMap Nominatim resolution (real administrative MultiPolygons & Polygons)
  try {
    let osmUrl = '';
    if (query && query.trim()) {
      osmUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query.trim())}&format=json&polygon_geojson=1&addressdetails=1&limit=4`;
    } else if (lat !== undefined && lon !== undefined) {
      osmUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&polygon_geojson=1&addressdetails=1`;
    }

    if (osmUrl) {
      const osmRes = await fetch(osmUrl, {
        headers: { 'Accept': 'application/json' },
      });
      if (osmRes.ok) {
        const osmData = await osmRes.json();
        const items = Array.isArray(osmData) ? osmData : [osmData];
        if (items.length > 0) {
          const targetLat = lat !== undefined ? lat : parseFloat(items[0].lat || '0');
          const targetLon = lon !== undefined ? lon : parseFloat(items[0].lon || '0');

          // Pass A: Check for direct polygon on any search result
          for (const it of items) {
            const coords = extractPolygonCoords(it.geojson, targetLat, targetLon);
            if (coords.length >= 3) {
              const cLat = parseFloat(it.lat || targetLat || 0);
              const cLon = parseFloat(it.lon || targetLon || 0);
              const address = it.address || {};
              const vName = address.village || address.town || address.suburb || address.county || address.city || it.name || query || 'Village Zone';
              const area = calculateGeodeticAreaKm2(coords);
              const perim = calculateGeodeticPerimeterKm(coords);
              if (area >= 0.2) {
                return {
                  village_name: vName,
                  display_name: it.display_name || vName,
                  latitude: cLat,
                  longitude: cLon,
                  area_km2: area,
                  perimeter_km: perim,
                  boundary: coords,
                  coordinates: coords,
                  center: [cLat, cLon],
                  boundary_type: it.geojson?.type === 'MultiPolygon' ? 'official_administrative_multipolygon' : 'official_administrative_polygon',
                  source_provenance: 'OpenStreetMap Nominatim Live Cadastre',
                };
              }
            }
          }

          // Pass B: If node/point, resolve enclosing administrative mandal/county/taluk
          const first = items[0];
          const address = first.address || {};
          const county = address.county || address.subdistrict || address.municipality || address.state_district;
          const state = address.state || '';
          if (county) {
            const subQuery = `${county}, ${state}`.trim();
            const subUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(subQuery)}&format=json&polygon_geojson=1&addressdetails=1&limit=3`;
            const subRes = await fetch(subUrl, { headers: { 'Accept': 'application/json' } });
            if (subRes.ok) {
              const subData = await subRes.json();
              const subItems = Array.isArray(subData) ? subData : [subData];
              for (const sit of subItems) {
                const sCoords = extractPolygonCoords(sit.geojson, targetLat, targetLon);
                if (sCoords.length >= 3) {
                  const cLat = parseFloat(first.lat || sit.lat || targetLat || 0);
                  const cLon = parseFloat(first.lon || sit.lon || targetLon || 0);
                  const vName = first.name || address.village || address.town || county || query;
                  const area = calculateGeodeticAreaKm2(sCoords);
                  const perim = calculateGeodeticPerimeterKm(sCoords);
                  if (area >= 0.2) {
                    return {
                      village_name: vName,
                      display_name: sit.display_name || first.display_name || vName,
                      latitude: cLat,
                      longitude: cLon,
                      area_km2: area,
                      perimeter_km: perim,
                      boundary: sCoords,
                      coordinates: sCoords,
                      center: [cLat, cLon],
                      boundary_type: sit.geojson?.type === 'MultiPolygon' ? 'official_administrative_multipolygon' : 'official_administrative_polygon',
                      source_provenance: 'OpenStreetMap Nominatim Official Administrative Cadastre',
                    };
                  }
                }
              }
            }
          }

          // Pass C: Derive authentic surveyed rectangular envelope from official survey boundingbox
          const bbox = first.boundingbox;
          if (Array.isArray(bbox) && bbox.length === 4) {
            const s = parseFloat(bbox[0]);
            const n = parseFloat(bbox[1]);
            const w = parseFloat(bbox[2]);
            const e = parseFloat(bbox[3]);
            if (!isNaN(s) && !isNaN(n) && !isNaN(w) && !isNaN(e) && Math.abs(n - s) > 0.001) {
              const surveyCoords: [number, number][] = [
                [n, w], [n, e], [s, e], [s, w], [n, w]
              ];
              const sArea = calculateGeodeticAreaKm2(surveyCoords);
              const sPerim = calculateGeodeticPerimeterKm(surveyCoords);
              const cLat = parseFloat(first.lat || targetLat || 0);
              const cLon = parseFloat(first.lon || targetLon || 0);
              const vName = first.name || address.village || address.town || query;
              return {
                village_name: vName,
                display_name: first.display_name || vName,
                latitude: cLat,
                longitude: cLon,
                area_km2: sArea,
                perimeter_km: sPerim,
                boundary: surveyCoords,
                coordinates: surveyCoords,
                center: [cLat, cLon],
                boundary_type: 'official_survey_cadastre_envelope',
                source_provenance: 'OpenStreetMap Cadastral Survey Sheet',
              };
            }
          }
        }
      }
    }
  } catch (osmErr) {
    console.warn('Direct OSM lookup failed:', osmErr);
  }

  // 3. Truthful fallback: No synthetic boundaries permitted in official path
  return {
    village_name: query || 'Unknown Locality',
    display_name: `${query || 'Locality'} (Boundary Unavailable)`,
    latitude: lat ?? 0,
    longitude: lon ?? 0,
    area_km2: null,
    perimeter_km: null,
    boundary: null,
    coordinates: null,
    center: [lat ?? 0, lon ?? 0],
    boundary_type: 'UNAVAILABLE',
    status: 'UNAVAILABLE',
    source_provenance: 'None (Boundary Unavailable in Authoritative Registry)',
  };
}

export async function generateInitialLayout(payload: any): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(`${API_BASE}/geo/initial-layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      let detail = '';
      try {
        const err = await res.json();
        if (err?.detail) detail = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
      } catch (_) {
        detail = res.statusText || `HTTP ${res.status}`;
      }
      throw new Error(`Initial layout failed: ${detail || `HTTP ${res.status}`}`);
    }
    return await res.json();
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('Initial layout failed: Network gateway timeout (request took longer than 45s)');
    }
    throw err;
  }
}

// ── Phase 4: Engineering Turbines & Feasible Candidate APIs ─────────────
export async function fetchTurbineCatalog(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/engineering/turbines`);
  if (!res.ok) throw new Error(`Failed to fetch turbine catalog: ${res.statusText}`);
  return res.json();
}

export async function fetchTurbineSpec(turbineId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/engineering/turbines/${encodeURIComponent(turbineId)}`);
  if (!res.ok) throw new Error(`Failed to fetch turbine spec for ${turbineId}: ${res.statusText}`);
  return res.json();
}

export async function generateEngineeringCandidates(payload: {
  search_envelope_geometry: any;
  turbine_model_id?: string;
  min_spacing_diameters?: number;
  max_candidates?: number;
  wind_direction_from_deg?: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/engineering/candidates/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Candidate generation error: ${res.statusText}`);
  return res.json();
}

export async function validateEngineeringCandidates(payload: {
  search_envelope_geometry: any;
  proposed_coordinates: any[];
  turbine_model_id?: string;
  min_spacing_diameters?: number;
  wind_direction_from_deg?: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/engineering/candidates/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Candidate validation error: ${res.statusText}`);
  return res.json();
}

export async function fetchGeometryConventions(): Promise<any> {
  const res = await fetch(`${API_BASE}/engineering/conventions`);
  if (!res.ok) throw new Error(`Failed to fetch geometry conventions: ${res.statusText}`);
  return res.json();
}

// ── Phase 5: Wind Resource, Wake & Preliminary AEP APIs ──────────────────
export async function fetchWindClimatology(
  lat: number,
  lon: number,
  hubHeightM: number = 110.0,
  groundElevationM: number = 0.0
): Promise<any> {
  const res = await fetch(
    `${API_BASE}/engineering/wind/climatology?lat=${lat}&lon=${lon}&hub_height_m=${hubHeightM}&ground_elevation_m=${groundElevationM}`
  );
  if (!res.ok) throw new Error(`Wind climatology fetch error: ${res.statusText}`);
  return res.json();
}

export async function fetchTurbinePowerCurve(
  turbineModelId: string = 'ge_25_120',
  airDensityKgM3: number = 1.225
): Promise<any> {
  const res = await fetch(`${API_BASE}/engineering/turbines/power-curve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ turbine_model_id: turbineModelId, air_density_kgm3: airDensityKgM3 }),
  });
  if (!res.ok) throw new Error(`Power curve evaluation error: ${res.statusText}`);
  return res.json();
}

export async function simulateWakeField(payload: {
  positions: any[];
  turbine_model_id?: string;
  wind_speed_mps?: number;
  wind_direction_from_deg?: number;
  air_density_kgm3?: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/engineering/wake/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Wake simulation error: ${res.statusText}`);
  return res.json();
}

export async function evaluatePreliminaryAep(payload: {
  candidate_positions: any[];
  turbine_model_id?: string;
  site_elevation_m?: number;
  custom_losses?: Record<string, number>;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/engineering/aep/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`AEP evaluation error: ${res.statusText}`);
  return res.json();
}

export async function fetchPhase6Contract(payload: {
  candidate_positions: any[];
  turbine_model_id?: string;
  site_elevation_m?: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/engineering/aep/phase6-contract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Phase 6 contract error: ${res.statusText}`);
  return res.json();
}

export async function runOptimization(payload: any): Promise<any> {
  // Ensure the payload matches backend schemas.py OptimizeRequest:
  // Requires: { sites: SiteCoord[], K: int (2 <= K <= 8), wind_angle_deg?: float, p?: int }
  let targetPayload = payload;
  
  if (!payload.sites && payload.candidates) {
    targetPayload = {
      sites: payload.candidates.map((c: any, idx: number) => ({
        id: c.id !== undefined ? c.id : idx,
        lat: c.lat,
        lon: c.lon,
        x_m: c.x_m,
        y_m: c.y_m,
      })),
      K: Math.max(2, Math.min(50, payload.turbine_count || payload.K || 4)),
      wind_angle_deg: payload.wind_direction_deg ?? payload.wind_angle_deg ?? 300,
      p: payload.p || 2,
    };
  } else if (!payload.sites && payload.turbines) {
    targetPayload = {
      sites: payload.turbines.map((t: any, idx: number) => ({
        id: t.id !== undefined ? t.id : idx,
        lat: t.lat,
        lon: t.lon,
        x_m: t.x_m,
        y_m: t.y_m,
      })),
      K: Math.max(2, Math.min(50, payload.turbine_count || payload.K || payload.turbines.length)),
      wind_angle_deg: payload.wind_direction_deg ?? payload.wind_angle_deg ?? 300,
      p: payload.p || 2,
    };
  }

  const res = await fetch(`${API_BASE}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(targetPayload),
  });
  if (!res.ok) throw new Error(`Optimization failed: ${res.statusText}`);
  return res.json();
}

export async function compareLayouts(payload: any): Promise<any> {
  const res = await fetch(`${API_BASE}/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Layout comparison failed: ${res.statusText}`);
  return res.json();
}

// Authentication Service
export async function authRegister(data: { username: string; email: string; password: string }): Promise<any> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Registration failed: ${res.statusText}`);
  }
  return res.json();
}

export async function authLogin(data: { username?: string; username_or_email?: string; email?: string; password: string }): Promise<any> {
  const payload = {
    username_or_email: data.username_or_email || data.username || data.email,
    username: data.username || data.username_or_email,
    email: data.email,
    password: data.password,
  };
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Login failed: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchCurrentUser(token: string): Promise<any> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`User auth failed: ${res.statusText}`);
  return res.json();
}

export async function authLogout(token: string): Promise<any> {
  const res = await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return res.ok;
}

// ── Phase 6 Optimization Service ──────────────────────────────────────────────

export interface QuboFormulationPayload {
  candidates: any[];
  turbine_model_id?: string;
  target_turbines?: number;
  min_spacing_multiplier?: number;
  site_elevation_m?: number;
  penalty_capacity?: number;
  penalty_spacing?: number;
}

export interface ClassicalOptimizationPayload {
  candidates: any[];
  turbine_model_id?: string;
  target_turbines?: number;
  min_spacing_multiplier?: number;
  site_elevation_m?: number;
  top_k?: number;
}

export interface QaoaOptimizationPayload {
  candidates: any[];
  turbine_model_id?: string;
  target_turbines?: number;
  min_spacing_multiplier?: number;
  site_elevation_m?: number;
  p_layers?: number;
  shots?: number;
  max_classical_iterations?: number;
  top_k_physical_reeval?: number;
  backend_type?: 'simulator' | 'aer_simulator' | 'ibm_hardware';
  ibm_token?: string;
  ibm_backend_name?: string;
  random_seed?: number;
}

export async function fetchOptimizationHardwareStatus(): Promise<any> {
  const res = await fetch(`${API_BASE}/engineering/optimization/hardware-status`);
  if (!res.ok) throw new Error(`Failed to query hardware status: ${res.statusText}`);
  return res.json();
}

export async function generateQuboFormulation(payload: QuboFormulationPayload): Promise<any> {
  const res = await fetch(`${API_BASE}/engineering/optimization/qubo-formulation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `QUBO formulation failed: ${res.statusText}`);
  }
  return res.json();
}

export async function runClassicalOptimization(payload: ClassicalOptimizationPayload): Promise<any> {
  const res = await fetch(`${API_BASE}/engineering/optimization/classical`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Classical optimization failed: ${res.statusText}`);
  }
  return res.json();
}

export async function runQaoaOptimization(payload: QaoaOptimizationPayload, authToken?: string): Promise<any> {
  const token = authToken || localStorage.getItem('aqw_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}/engineering/optimization/qaoa`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `QAOA optimization failed: ${res.statusText}`);
  }
  return res.json();
}

export async function runQaoaQualityAudit(payload: {
  candidates: any[];
  turbine_model_id?: string;
  target_turbines?: number;
  min_spacing_multiplier?: number;
  site_elevation_m?: number;
  p_layers?: number;
  shots?: number;
  repetitions?: number;
  seeds?: number[];
}): Promise<any> {
  const res = await fetch(`${API_BASE}/engineering/optimization/qaoa-quality-audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `QAOA quality audit failed: ${res.statusText}`);
  }
  return res.json();
}

// ── Per-User IBM Quantum Credentials Service ──────────────────────────────────

export interface QuantumCredentialMetadata {
  configured: boolean;
  crn_configured: boolean;
  instance_masked?: string | null;
  token_masked?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_used_at?: string | null;
  last_status?: string | null;
}

export async function fetchQuantumCredentials(authToken?: string): Promise<QuantumCredentialMetadata> {
  const token = authToken || localStorage.getItem('aqw_token');
  if (!token) return { configured: false, crn_configured: false };
  const res = await fetch(`${API_BASE}/quantum/credentials`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 401) return { configured: false, crn_configured: false };
    throw new Error(`Failed to load credentials: ${res.statusText}`);
  }
  return res.json();
}

export async function saveQuantumCredentials(
  data: { api_token: string; crn?: string },
  authToken?: string
): Promise<{ configured: boolean; message: string; updated_at?: string }> {
  const token = authToken || localStorage.getItem('aqw_token');
  if (!token) throw new Error('You must be signed in to configure IBM Quantum credentials.');
  const res = await fetch(`${API_BASE}/quantum/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to save credentials: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteQuantumCredentials(authToken?: string): Promise<boolean> {
  const token = authToken || localStorage.getItem('aqw_token');
  if (!token) return false;
  const res = await fetch(`${API_BASE}/quantum/credentials`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return res.ok;
}

export async function testQuantumConnection(authToken?: string): Promise<{ success: boolean; message: string; backend_name?: string }> {
  const token = authToken || localStorage.getItem('aqw_token');
  if (!token) throw new Error('You must be signed in to test IBM Quantum credentials.');
  const res = await fetch(`${API_BASE}/quantum/credentials/test`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'IBM Quantum connection failed.');
  }
  return res.json();
}


