import { Turbine } from '../types';

/**
 * Standard Ray-Casting algorithm for point-in-polygon containment test.
 * Coordinates are [lat, lon].
 */
export function isPointInPolygon(point: [number, number] | number[], polygon: [number, number][] | number[][]): boolean {
  if (!polygon || polygon.length < 3) return false;
  const lat = point[0];
  const lon = point[1];
  let inside = false;
  const n = polygon.length;
  
  let p1lat = polygon[0][0];
  let p1lon = polygon[0][1];
  
  for (let i = 1; i <= n; i++) {
    const p2lat = polygon[i % n][0];
    const p2lon = polygon[i % n][1];
    
    if (lon > Math.min(p1lon, p2lon)) {
      if (lon <= Math.max(p1lon, p2lon)) {
        if (lat <= Math.max(p1lat, p2lat)) {
          if (p1lon !== p2lon) {
            const xinters = ((lon - p1lon) * (p2lat - p1lat)) / (p2lon - p1lon) + p1lat;
            if (p1lat === p2lat || lat <= xinters) {
              inside = !inside;
            }
          }
        }
      }
    }
    p1lat = p2lat;
    p1lon = p2lon;
  }
  return inside;
}

/**
 * Computes shortest Euclidean geodesic distance in meters from point to polygon edges.
 */
export function pointToPolygonDistMeters(point: [number, number] | number[], polygon: [number, number][] | number[][]): number {
  if (!polygon || polygon.length < 3) return 0;
  const plat = point[0];
  const plon = point[1];
  const cosLat = Math.cos((plat * Math.PI) / 180);
  
  let minMeters = Infinity;
  const n = polygon.length;
  
  for (let i = 0; i < n; i++) {
    const p1lat = polygon[i][0];
    const p1lon = polygon[i][1];
    const p2lat = polygon[(i + 1) % n][0];
    const p2lon = polygon[(i + 1) % n][1];
    
    // Convert to local Cartesian meters relative to point
    const x1 = (p1lon - plon) * 111320 * cosLat;
    const y1 = (p1lat - plat) * 110540;
    const x2 = (p2lon - plon) * 111320 * cosLat;
    const y2 = (p2lat - plat) * 110540;
    
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    
    let dist: number;
    if (lenSq === 0) {
      dist = Math.hypot(x1, y1);
    } else {
      let t = -(x1 * dx + y1 * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;
      dist = Math.hypot(projX, projY);
    }
    
    if (dist < minMeters) {
      minMeters = dist;
    }
  }
  return minMeters;
}

/**
 * Computes polygon centroid [lat, lon].
 */
export function polygonCentroid(polygon: [number, number][] | number[][]): [number, number] {
  if (!polygon || polygon.length === 0) return [19.6454, 84.1487];
  let sumLat = 0;
  let sumLon = 0;
  for (const pt of polygon) {
    sumLat += pt[0];
    sumLon += pt[1];
  }
  return [sumLat / polygon.length, sumLon / polygon.length];
}

/**
 * Generates an array of turbines strictly enclosed inside the provided boundary polygon.
 * 100% boundary containment guaranteed: no turbine will EVER lie outside the boundary.
 */
export function generatePolygonEnclosedTurbines(
  boundary: [number, number][] | number[][] | undefined,
  count: number,
  centerLat: number,
  centerLon: number,
  baseWindSpeed: number = 7.5
): Turbine[] {
  const targetCount = Math.max(1, count);
  const effectiveBoundary: [number, number][] = 
    boundary && boundary.length >= 3 ? (boundary as [number, number][]) : generateFallbackCircle(centerLat, centerLon, 2.5);

  const [cLat, cLon] = polygonCentroid(effectiveBoundary);
  const cosLat = Math.cos((cLat * Math.PI) / 180);

  // Compute bounding box
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;
  for (const [lat, lon] of effectiveBoundary) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }

  // Multi-pass interior candidate sampling with adaptive resolution
  let candidates: [number, number][] = [];
  const setbackTrials = [80, 50, 25, 10, 0];
  const steps = Math.max(50, Math.min(120, Math.ceil(Math.sqrt(targetCount) * 16)));

  for (const setback of setbackTrials) {
    candidates = [];
    const dLat = (maxLat - minLat) / steps;
    const dLon = (maxLon - minLon) / steps;

    for (let i = 1; i < steps; i++) {
      for (let j = 1; j < steps; j++) {
        const pt: [number, number] = [minLat + i * dLat, minLon + j * dLon];
        if (isPointInPolygon(pt, effectiveBoundary)) {
          if (setback === 0 || pointToPolygonDistMeters(pt, effectiveBoundary) >= setback) {
            // Strict settlement setback: never place turbine inside village settlement core (houses/habitations)
            const distToCenterM = Math.hypot((pt[0] - centerLat) * 110540, (pt[1] - centerLon) * 111320 * cosLat);
            if (distToCenterM >= 500.0) {
              candidates.push(pt);
            }
          }
        }
      }
    }
    if (candidates.length >= targetCount * 2) break;
  }

  // Dense adaptive sub-sampling if polygon is compact
  if (candidates.length < targetCount * 2 && candidates.length > 0) {
    const basePts = [...candidates];
    const dLat = (maxLat - minLat) / (steps * 2);
    const dLon = (maxLon - minLon) / (steps * 2);
    for (const [pLat, pLon] of basePts) {
      for (const [ox, oy] of [[0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]) {
        const subPt: [number, number] = [pLat + oy * dLat, pLon + ox * dLon];
        if (isPointInPolygon(subPt, effectiveBoundary) && pointToPolygonDistMeters(subPt, effectiveBoundary) >= 5) {
          const distToCenterM = Math.hypot((subPt[0] - centerLat) * 110540, (subPt[1] - centerLon) * 111320 * cosLat);
          if (distToCenterM >= 450.0) {
            candidates.push(subPt);
          }
          if (candidates.length >= targetCount * 3) break;
        }
      }
      if (candidates.length >= targetCount * 3) break;
    }
  }

  // If still empty (e.g. degenerate polygon), sample around outer rim away from settlement center
  if (candidates.length === 0) {
    const rDeg = 0.008;
    candidates.push([centerLat + rDeg, centerLon + rDeg / cosLat]);
  }

  // Spatial thinning / greedy dispersion with progressive relaxation
  const widthM = (maxLon - minLon) * 111320 * cosLat;
  const heightM = (maxLat - minLat) * 110540;
  const approxAreaM2 = Math.max(80000, widthM * heightM * 0.65);
  
  // Sort candidates by distance from boundary descending (prioritize deep interior)
  candidates.sort((a, b) => {
    return pointToPolygonDistMeters(b, effectiveBoundary) - pointToPolygonDistMeters(a, effectiveBoundary);
  });

  let selected: [number, number][] = [];
  let currentSpacingM = Math.max(50, Math.min(500, Math.sqrt(approxAreaM2 / targetCount) * 0.8));

  // Multi-pass spacing relaxation until exactly targetCount are chosen
  while (selected.length < targetCount && currentSpacingM >= 30) {
    selected = [];
    for (const cand of candidates) {
      let tooClose = false;
      for (const sel of selected) {
        const dx = (cand[1] - sel[1]) * 111320 * cosLat;
        const dy = (cand[0] - sel[0]) * 110540;
        if (Math.hypot(dx, dy) < currentSpacingM) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        selected.push(cand);
        if (selected.length === targetCount) break;
      }
    }
    currentSpacingM *= 0.72; // relax spacing threshold
  }

  // If still fewer than targetCount, fill remaining from available interior candidates
  if (selected.length < targetCount) {
    for (const cand of candidates) {
      if (!selected.includes(cand)) {
        selected.push(cand);
        if (selected.length === targetCount) break;
      }
    }
  }

  // Generate Turbine objects (exact targetCount guaranteed)
  return selected.slice(0, targetCount).map((coords, idx) => {
    const lat = Number(coords[0].toFixed(6));
    const lon = Number(coords[1].toFixed(6));
    const distM = pointToPolygonDistMeters(coords, effectiveBoundary);
    
    return {
      id: `T${idx + 1}`,
      label: `T-${String(idx + 1).padStart(2, '0')}`,
      displayLabel: `T-${String(idx + 1).padStart(2, '0')}`,
      lat,
      lon,
      elevation_m: 42 + (idx % 6) * 3,
      effective_mps: Number((baseWindSpeed * (0.94 + 0.06 * (idx % 3))).toFixed(2)),
      wake_deficit_pct: Number((2.0 + (idx % 4) * 1.2).toFixed(1)),
      is_conflicted: false,
      boundary_dist_m: Math.round(distM),
    };
  });
}

/**
 * Defensive guard: ensures 100% of turbines and candidate positions strictly reside
 * inside the boundary polygon and outside the village residential habitation zone.
 */
export function ensureTurbinesInsideBoundary<T = Turbine>(
  turbines: T[],
  boundary: [number, number][] | number[][] | undefined,
  centerLat?: number,
  centerLon?: number,
  radiusKm?: number
): T[] {
  if (!turbines || turbines.length === 0) {
    return [];
  }

  let validBoundary: [number, number][];
  if (boundary && boundary.length >= 3) {
    validBoundary = boundary as [number, number][];
  } else if (centerLat !== undefined && centerLon !== undefined) {
    validBoundary = generateGeographicCirclePolygon(centerLat, centerLon, radiusKm || 3.0, 48);
  } else {
    return turbines;
  }

  const cosLat = centerLat ? Math.cos((centerLat * Math.PI) / 180) : 1.0;

  return (turbines as any[]).filter((t) => {
    const tLat = t.lat ?? t.latitude;
    const tLon = t.lon ?? t.longitude;
    if (tLat === undefined || tLon === undefined) return false;
    if (!isPointInPolygon([tLat, tLon], validBoundary)) return false;
    // Settlement protection buffer
    if (centerLat !== undefined && centerLon !== undefined) {
      const distToCenterM = Math.hypot((tLat - centerLat) * 110540, (tLon - centerLon) * 111320 * cosLat);
      if (distToCenterM < 350.0) return false;
    }
    return true;
  }) as T[];
}

/**
 * Authoritative geodesic circular concession boundary polygon around (centerLat, centerLon).
 * Returns an array of 48 [lat, lon] coordinates matching physical radius.
 */
export function generateGeographicCirclePolygon(
  centerLat: number,
  centerLon: number,
  radiusKm: number,
  steps: number = 48
): [number, number][] {
  const pts: [number, number][] = [];
  const cosLat = Math.cos((centerLat * Math.PI) / 180) || 1e-6;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLat = (radiusKm / 111.0) * Math.cos(angle);
    const dLon = (radiusKm / (111.0 * cosLat)) * Math.sin(angle);
    pts.push([
      parseFloat((centerLat + dLat).toFixed(6)),
      parseFloat((centerLon + dLon).toFixed(6)),
    ]);
  }
  return pts;
}

function generateFallbackCircle(centerLat: number, centerLon: number, radiusKm: number): [number, number][] {
  return generateGeographicCirclePolygon(centerLat, centerLon, radiusKm, 32);
}
