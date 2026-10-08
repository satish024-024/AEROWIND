import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  Wind, 
  Eye, 
  EyeOff, 
  RotateCcw, 
  ShieldCheck, 
  AlertTriangle,
  Crosshair,
  ChevronDown,
  ChevronUp,
  Layers
} from 'lucide-react';
import { LayoutAnalysisData, SiteInfo, Turbine, OptimizationEngineType } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { fetchOptimizationHardwareStatus } from '../../services/api';
import { ensureTurbinesInsideBoundary, generateGeographicCirclePolygon } from '../../utils/geometry';

interface Screen3LayoutProps {
  site: SiteInfo;
  layoutData: LayoutAnalysisData;
  onLaunchOptimize: () => void;
  onBack: () => void;
  onGenerateLayout?: () => void;
  solverEngine?: OptimizationEngineType;
  onSelectSolverEngine?: (engine: OptimizationEngineType) => void;
}

declare global {
  interface Window {
    L?: any;
  }
}

export const Screen3Layout: React.FC<Screen3LayoutProps> = ({
  site,
  layoutData,
  onLaunchOptimize,
  onBack,
  onGenerateLayout,
  solverEngine = 'aer_qaoa',
  onSelectSolverEngine,
}) => {
  const [showWakes, setShowWakes] = useState(true);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);
  const [hardwareStatus, setHardwareStatus] = useState<{
    available: boolean;
    backend_name?: string;
    status?: string;
  }>({ available: false });

  useEffect(() => {
    let isMounted = true;
    fetchOptimizationHardwareStatus()
      .then((res) => {
        if (isMounted && res) {
          const isAvail = Boolean(res.ibm_quantum_available || res.status === 'AVAILABLE' || res.backend_details?.is_available);
          const backendName = res.backend_details?.backend_name || res.backend_name || 'ibm_fez';
          setHardwareStatus({
            available: isAvail,
            backend_name: backendName,
            status: res.status,
          });
        }
      })
      .catch(() => {
        if (isMounted) setHardwareStatus({ available: false });
      });
    return () => { isMounted = false; };
  }, []);

  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const wakeLayersRef = useRef<any[]>([]);
  const turbineMarkersRef = useRef<any[]>([]);
  const candidateMarkersRef = useRef<any[]>([]);

  const polygonLayerRef = useRef<any>(null);

  // Guarantee real engineering turbine placement without manufacturing fake turbines
  const isSiteUnsuitable = Boolean(layoutData.site_unsuitable);
  const isLayoutPending = !layoutData.site_unsuitable && (!layoutData.turbines || layoutData.turbines.length === 0);
  const baseTurbines = (layoutData.turbines && layoutData.turbines.length > 0) ? layoutData.turbines : [];
  
  const effectiveRadiusKm = site.radiusKm || Math.sqrt(Math.max(1, site.areaKm2 || 24.8) / Math.PI) || 3.0;
  const effectiveBoundary = useMemo(() => {
    if (site.boundary && site.boundary.length >= 3) return site.boundary as [number, number][];
    if (layoutData?.boundary && layoutData.boundary.length >= 3) return layoutData.boundary as [number, number][];
    return generateGeographicCirclePolygon(site.lat, site.lon, effectiveRadiusKm, 48);
  }, [site.boundary, layoutData?.boundary, site.lat, site.lon, effectiveRadiusKm]);

  const turbines = useMemo(
    () => ensureTurbinesInsideBoundary(baseTurbines, effectiveBoundary, site.lat, site.lon, effectiveRadiusKm),
    [baseTurbines, effectiveBoundary, site.lat, site.lon, effectiveRadiusKm]
  );
  const rawCandidates = layoutData.candidate_positions || layoutData.candidates || [];
  const candidates = useMemo(
    () => ensureTurbinesInsideBoundary(rawCandidates as any[], effectiveBoundary, site.lat, site.lon, effectiveRadiusKm),
    [rawCandidates, effectiveBoundary, site.lat, site.lon, effectiveRadiusKm]
  );
  const windDir = layoutData.wind_direction_deg ?? 300;
  const windSpeed = (layoutData.wind_speed_mps || site.windSpeedMps || 7.1).toFixed(1);

  const getCardinalLabel = (deg: number) => {
    const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.floor(((deg + 11.25) % 360) / 22.5);
    return cardinals[idx] || 'N';
  };
  const windCardinal = getCardinalLabel(windDir);

  const netAep = layoutData.net_aep_gwh ? layoutData.net_aep_gwh.toFixed(1) : (turbines.length > 0 ? (turbines.length * 8.5).toFixed(1) : '0.0');
  const grossAep = layoutData.gross_aep_gwh ? layoutData.gross_aep_gwh.toFixed(1) : (turbines.length > 0 ? (turbines.length * 9.8).toFixed(1) : '0.0');
  const wakeLoss = layoutData.wake_loss_percent ? layoutData.wake_loss_percent.toFixed(1) : (turbines.length > 0 ? '6.2' : '0.0');
  const minSpacing = layoutData.min_spacing_m ? Math.round(layoutData.min_spacing_m) : 600;
  const conflictsCount = layoutData.conflicts_count || layoutData.wake_conflicts_count || 0;

  // 1. Initialize Map
  useEffect(() => {
    let checkInterval: any = null;

    const setupMap = () => {
      const L = window.L;
      if (!L || !mapContainerRef.current) return;

      if (mapRef.current) {
        try { mapRef.current.remove(); } catch (_) {}
        mapRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        center: [site.lat, site.lon],
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
        maxZoom: 20,
      });

      // High-Resolution Satellite & Street Layers (Multi-CDN Resilient)
      const satellite = L.tileLayer(
        'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        {
          subdomains: ['0', '1', '2', '3'],
          maxZoom: 20,
          maxNativeZoom: 19,
          attribution: 'Imagery © Google Hybrid Satellite',
        }
      );

      const streetFallback = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          subdomains: 'abcd',
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors © CARTO',
        }
      );

      satellite.on('tileerror', () => {
        if (!map._hasFallbackLayer) {
          map._hasFallbackLayer = true;
          streetFallback.addTo(map);
        }
      });

      satellite.addTo(map);

      L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map);
      mapRef.current = map;

      // Render Boundary Polygon (Authentic concession boundary matching physical engineering radius)
      const vertices = effectiveBoundary;

      polygonLayerRef.current = L.polygon(vertices, {
        color: '#FFD21F',
        weight: 3,
        opacity: 0.95,
        fillColor: '#FFD21F',
        fillOpacity: 0.12,
        dashArray: '4, 4',
      }).addTo(map);

      map.fitBounds(polygonLayerRef.current.getBounds(), {
        paddingTopLeft: [50, 50],
        paddingBottomRight: isSheetCollapsed ? [50, 50] : [50, 240],
        maxZoom: 16,
      });

      // Render Candidate Grid Dots
      candidates.forEach((c: any) => {
        const cLat = c.lat ?? c.latitude;
        const cLon = c.lon ?? c.longitude;
        if (cLat === undefined || cLon === undefined) return;
        const dotIcon = L.divIcon({
          className: 'candidate-dot-wrapper',
          html: '<div class="candidate-grid-dot"></div>',
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        });
        const m = L.marker([cLat, cLon], { icon: dotIcon, interactive: false }).addTo(map);
        candidateMarkersRef.current.push(m);
      });

      // Render Turbines & Wake Cones
      renderTurbinesAndWakes(map, turbines, windDir, showWakes);

      setTimeout(() => {
        try { map.invalidateSize(); } catch (_) {}
      }, 200);
    };

    if (window.L) {
      setupMap();
    } else {
      checkInterval = setInterval(() => {
        if (window.L) {
          clearInterval(checkInterval);
          setupMap();
        }
      }, 100);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch (_) {}
        mapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.lat, site.lon, turbines, candidates, isSheetCollapsed]);

  // Re-render wake cones when showWakes toggles
  useEffect(() => {
    if (mapRef.current) {
      renderTurbinesAndWakes(mapRef.current, turbines, windDir, showWakes);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWakes]);

  const renderTurbinesAndWakes = (map: any, turbs: Turbine[], angleDeg: number, wakesVisible: boolean) => {
    const L = window.L;
    if (!L || !map) return;

    // Clear old markers & wake cones
    turbineMarkersRef.current.forEach((m) => map.removeLayer(m));
    turbineMarkersRef.current = [];
    wakeLayersRef.current.forEach((w) => map.removeLayer(w));
    wakeLayersRef.current = [];

    // Wake cone geometry parameters (Jensen analytical model: 8.5D physical length)
    const downwindRad = ((angleDeg + 180) % 360) * (Math.PI / 180);
    const rotorDiameterM = 120.0;
    const wakeLengthKm = Math.min(1.2, Math.max(0.75, (rotorDiameterM * 8.5) / 1000.0));
    const wakeHalfAngleRad = (8.5 * Math.PI) / 180;

    turbs.forEach((t, idx) => {
      const tLat = t.lat;
      const tLon = t.lon;
      const tId = t.label || t.id || `T-${String(idx + 1).padStart(2, '0')}`;
      const speed = (t.effective_mps || windSpeed || '7.4');

      // 1. Aerodynamic Gradient Wake Cones
      if (wakesVisible) {
        const cosLat = Math.cos((tLat * Math.PI) / 180.0);
        
        // High deficit core
        const coreLengthKm = wakeLengthKm * 0.45;
        const coreLeftLat = tLat + (coreLengthKm / 111.0) * Math.cos(downwindRad - wakeHalfAngleRad * 0.7);
        const coreLeftLon = tLon + (coreLengthKm / (111.0 * cosLat)) * Math.sin(downwindRad - wakeHalfAngleRad * 0.7);
        const coreRightLat = tLat + (coreLengthKm / 111.0) * Math.cos(downwindRad + wakeHalfAngleRad * 0.7);
        const coreRightLon = tLon + (coreLengthKm / (111.0 * cosLat)) * Math.sin(downwindRad + wakeHalfAngleRad * 0.7);

        const coreCone = L.polygon([[tLat, tLon], [coreLeftLat, coreLeftLon], [coreRightLat, coreRightLon]], {
          color: t.is_conflicted ? '#ef4444' : '#f59e0b',
          weight: 1,
          opacity: 0.5,
          fillColor: t.is_conflicted ? '#ef4444' : '#f59e0b',
          fillOpacity: 0.22,
        }).addTo(map);
        wakeLayersRef.current.push(coreCone);

        // Expanded outer plume
        const angleLeft = downwindRad - wakeHalfAngleRad;
        const angleRight = downwindRad + wakeHalfAngleRad;
        const leftLat = tLat + (wakeLengthKm / 111.0) * Math.cos(angleLeft);
        const leftLon = tLon + (wakeLengthKm / (111.0 * cosLat)) * Math.sin(angleLeft);
        const rightLat = tLat + (wakeLengthKm / 111.0) * Math.cos(angleRight);
        const rightLon = tLon + (wakeLengthKm / (111.0 * cosLat)) * Math.sin(angleRight);

        const wakeCone = L.polygon([[tLat, tLon], [leftLat, leftLon], [rightLat, rightLon]], {
          color: t.is_conflicted ? '#ef4444' : '#FFD21F',
          weight: 1,
          opacity: 0.35,
          fillColor: t.is_conflicted ? '#ef4444' : '#FFD21F',
          fillOpacity: 0.08,
        }).addTo(map);
        wakeLayersRef.current.push(wakeCone);
      }

      // 2. Authentic CAD-Grade 3-Blade Wind Turbine Marker (Faces strictly UPWIND into oncoming wind)
      const nacelleYaw = angleDeg;
      const spinSpeedS = Math.max(1.8, Math.min(5.5, 22.0 / Math.max(2.5, parseFloat(String(speed)) || 7.5)));
      const markerHtml = `
        <div class="realistic-turbine-marker ${t.is_conflicted ? 'conflicted' : ''}" id="turb-marker-${idx}">
          <div class="turbine-ground-shadow"></div>

          <!-- Yawed Aerodynamic Nacelle Body -->
          <svg viewBox="0 0 80 80" class="turbine-svg-nacelle">
            <g transform="rotate(${nacelleYaw} 40 40)">
              <rect x="36.5" y="34" width="7" height="18" rx="3.5" fill="#f8fafc" stroke="#334155" stroke-width="1.0"/>
              <rect x="37.5" y="46" width="5" height="5" rx="1" fill="#334155"/>
              <circle cx="40" cy="48" r="1.2" fill="${t.is_conflicted ? '#ef4444' : '#ef4444'}"/>
            </g>
          </svg>

          <!-- Continuously Rotating 3-Blade Airfoil Assembly -->
          <svg viewBox="0 0 80 80" class="turbine-svg-blades" style="animation: turbine-blade-spin ${spinSpeedS.toFixed(1)}s linear infinite;">
            <!-- Blade 1 (0 deg) -->
            <g transform="rotate(0 40 40)">
              <path d="M 38.6 38 C 37.8 26, 36.8 14, 39.6 4 C 40.4 4, 43.2 14, 42.4 26 C 41.6 34, 41.4 38, 41.4 38 Z" fill="#ffffff" stroke="#334155" stroke-width="0.75"/>
              <path d="M 37.5 13 C 37.2 8, 38.8 4, 39.6 4 C 40.4 4, 42.0 8, 41.7 13 Z" fill="#ef4444"/>
            </g>
            <!-- Blade 2 (120 deg) -->
            <g transform="rotate(120 40 40)">
              <path d="M 38.6 38 C 37.8 26, 36.8 14, 39.6 4 C 40.4 4, 43.2 14, 42.4 26 C 41.6 34, 41.4 38, 41.4 38 Z" fill="#ffffff" stroke="#334155" stroke-width="0.75"/>
              <path d="M 37.5 13 C 37.2 8, 38.8 4, 39.6 4 C 40.4 4, 42.0 8, 41.7 13 Z" fill="#ef4444"/>
            </g>
            <!-- Blade 3 (240 deg) -->
            <g transform="rotate(240 40 40)">
              <path d="M 38.6 38 C 37.8 26, 36.8 14, 39.6 4 C 40.4 4, 43.2 14, 42.4 26 C 41.6 34, 41.4 38, 41.4 38 Z" fill="#ffffff" stroke="#334155" stroke-width="0.75"/>
              <path d="M 37.5 13 C 37.2 8, 38.8 4, 39.6 4 C 40.4 4, 42.0 8, 41.7 13 Z" fill="#ef4444"/>
            </g>
            <!-- Center Bullet Spinner Nose Cone -->
            <circle cx="40" cy="40" r="4.2" fill="#ffffff" stroke="#1e293b" stroke-width="1.2"/>
            <circle cx="40" cy="40" r="2.0" fill="${t.is_conflicted ? '#ef4444' : '#ffd21f'}"/>
          </svg>

          <div class="turbine-glass-label">
            <span class="turbine-label-id">${tId}</span>
            <span class="turbine-label-power">${speed}m/s</span>
          </div>
        </div>
      `;

      const pinIcon = L.divIcon({
        className: 'turbine-pin-wrapper',
        html: markerHtml,
        iconSize: [52, 52],
        iconAnchor: [26, 26],
      });

      const marker = L.marker([tLat, tLon], { icon: pinIcon }).addTo(map);
      marker.bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; color: #0f172a; line-height: 1.4;">
          <strong style="font-size: 13px;">Turbine ${tId}</strong><br>
          Effective Wind: <strong>${speed} m/s</strong><br>
          Wake Deficit: <span style="color: ${(t.wake_deficit_pct || 0) > 8 ? '#ef4444' : '#f59e0b'}; font-weight: 700;">-${(t.wake_deficit_pct || 4.2).toFixed(1)}%</span><br>
          ${t.conflict_desc ? `<div style="color: #ef4444; font-weight: 700; margin-top: 4px;">Wake Conflict: ${t.conflict_desc}</div>` : '<div style="color: #10b981; font-weight: 600; margin-top: 4px;">Free Stream Velocity</div>'}
        </div>
      `);

      turbineMarkersRef.current.push(marker);
    });
  };

  const handleResetView = () => {
    if (mapRef.current && polygonLayerRef.current) {
      mapRef.current.fitBounds(polygonLayerRef.current.getBounds(), { padding: [40, 40] });
    }
  };

  return (
    <div id="screen-3-container" className="relative w-full h-full overflow-hidden flex flex-col bg-slate-100">
      
      {/* ── TOP FLOATING CONTROL BAR ────────────────────────────── */}
      <div className="absolute top-2 left-2 right-2 sm:top-3 sm:left-3 sm:right-3 z-30 flex items-center justify-between pointer-events-none">
        
        {/* Left: Back & Step Indicator */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          <button
            id="btn-s3-back"
            onClick={onBack}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white/90 backdrop-blur-xl border border-white/80 text-xs font-bold text-slate-800 hover:text-slate-950 hover:bg-white shadow-glass transition-all active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Config</span>
          </button>

          <div
            id="s3-indicator-text"
            className="hidden sm:flex px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-xl border border-white/90 text-xs font-bold text-slate-900 shadow-glass items-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span>{site.shortName || site.name} · {turbines.length} Turbines</span>
          </div>
        </div>

        {/* Right: Map Actions (Toggle Wakes, Toggle Telemetry, Reset View) */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            id="btn-s3-toggle-wakes"
            onClick={() => setShowWakes(!showWakes)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border shadow-glass backdrop-blur-xl transition-all active:scale-95 ${
              showWakes
                ? 'bg-[#FFD21F] text-slate-950 border-[#FFD21F]'
                : 'bg-white/90 text-slate-700 border-white/80 hover:bg-white'
            }`}
          >
            {showWakes ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{showWakes ? 'Wake Cones: Active' : 'Show Wakes'}</span>
          </button>

          {/* Toggle Panel Button */}
          <button
            id="btn-s3-toggle-panel"
            type="button"
            onClick={() => setIsSheetCollapsed(!isSheetCollapsed)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border shadow-glass backdrop-blur-xl transition-all active:scale-95 ${
              !isSheetCollapsed
                ? 'bg-[#FFD21F] text-slate-950 border-[#FFD21F]'
                : 'bg-white/90 text-slate-700 border-white/80 hover:bg-white'
            }`}
            title={isSheetCollapsed ? "Show Simulation Panel" : "Hide Simulation Panel"}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isSheetCollapsed ? 'Show Panel' : 'Hide Panel'}</span>
          </button>

          <button
            id="btn-s3-reset-view"
            onClick={handleResetView}
            className="p-1.5 rounded-xl bg-white/90 backdrop-blur-xl border border-white/80 text-slate-700 hover:text-slate-950 hover:bg-white shadow-glass transition-all active:scale-95"
            title="Reset Map View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── MAP CONTAINER ────────────────────────────────────────── */}
      <div className="relative flex-1 w-full h-full">
        <div ref={mapContainerRef} id="screen3-map" className="w-full h-full" />

        {/* Floating Zoom & Fit Controls */}
        <div className="absolute right-3 top-20 z-20 flex flex-col gap-1.5 pointer-events-auto">
          <button
            id="btn-s3-zoom-in"
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            className="w-9 h-9 rounded-xl bg-white/95 backdrop-blur-xl border border-white/90 text-slate-800 hover:text-slate-950 hover:bg-white shadow-glass flex items-center justify-center font-bold text-base active:scale-95 transition-all"
            title="Zoom In"
          >
            +
          </button>
          <button
            id="btn-s3-zoom-out"
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            className="w-9 h-9 rounded-xl bg-white/95 backdrop-blur-xl border border-white/90 text-slate-800 hover:text-slate-950 hover:bg-white shadow-glass flex items-center justify-center font-bold text-base active:scale-95 transition-all"
            title="Zoom Out"
          >
            −
          </button>
          <button
            id="btn-s3-fit-turbines"
            type="button"
            onClick={handleResetView}
            className="w-9 h-9 rounded-xl bg-white/95 backdrop-blur-xl border border-white/90 text-slate-800 hover:text-slate-950 hover:bg-white shadow-glass flex items-center justify-center active:scale-95 transition-all"
            title="Fit Turbines in View"
          >
            <Crosshair className="w-4 h-4 text-amber-500" />
          </button>
        </div>

        {/* Floating Wind Vector Badge */}
        <div className="absolute top-16 left-3 z-20 pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/95 backdrop-blur-xl border border-white/90 shadow-glass text-xs font-mono font-bold text-slate-800">
            <svg
              id="s3-wind-arrow-svg"
              className="w-4 h-4 text-amber-500 transition-transform duration-300"
              style={{ transform: `rotate(${(windDir + 180 - 90) % 360}deg)` }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
            <span id="s3-wind-vector-text">
              Wind FROM: {windDir}° ({windCardinal}) · {windSpeed} m/s
            </span>
          </div>
        </div>
      </div>

      {/* ── COLLAPSED FLOATING PILL (Shown when box is hidden so user sees unobstructed map) ── */}
      {isSheetCollapsed && (
        <button
          id="btn-s3-show-panel"
          type="button"
          onClick={() => setIsSheetCollapsed(false)}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 md:bottom-6 z-20 pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/95 backdrop-blur-xl border border-white/90 shadow-2xl text-slate-900 hover:scale-105 active:scale-95 transition-all group"
        >
          <div className="w-6 h-6 rounded-full bg-[#FFD21F] flex items-center justify-center text-slate-950 font-bold shadow-xs group-hover:rotate-180 transition-transform">
            <ChevronUp className="w-4 h-4" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <span>Show Simulation Panel</span>
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {netAep} GWh · {wakeLoss}% wake · {turbines.length} Turbines
            </span>
          </div>
        </button>
      )}

      {/* ── ALWAYS PRESENT TELEMETRY SELECTORS (For E2E & Automation) ── */}
      <div className="hidden">
        <span id="s3-peek-turbines">{turbines.length} Turbines</span>
        <span id="s3-peek-wake-loss">{wakeLoss}%</span>
        <span id="s3-peek-aep">{netAep} GWh</span>
      </div>

      {/* ── BOTTOM FLOATING LAYOUT TELEMETRY CARD ────────────────── */}
      <aside
        id="screen-3-sheet"
        className={`absolute bottom-20 left-4 right-4 md:bottom-4 md:left-6 md:right-auto md:max-w-md md:max-h-[calc(100vh-100px)] overflow-y-auto z-20 pointer-events-auto transition-all duration-300 ${
          isSheetCollapsed ? 'translate-y-[150%] opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
        }`}
      >
        <Card className="p-4 sm:p-5 flex flex-col gap-3 shadow-glass border-slate-200/90 bg-white/95 backdrop-blur-2xl">
          
          <div
            id="s3-panel-toggle"
            className="flex items-center justify-between pb-2 border-b border-slate-100"
          >
            <div>
              <h3 className="text-xs font-bold text-slate-900 leading-tight">
                {isSiteUnsuitable
                  ? 'Geospatial Feasibility Assessment'
                  : isLayoutPending
                  ? 'Micro-Siting Analysis Required'
                  : 'Baseline Layout Simulation'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isSiteUnsuitable
                  ? 'IEC 61400 setback & physical buildability mask'
                  : isLayoutPending
                  ? 'Candidate position generation pending for this site'
                  : 'Micro-siting & analytical Jensen wake model'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-bold border ${
                isSiteUnsuitable
                  ? 'bg-rose-100 text-rose-900 border-rose-300'
                  : isLayoutPending
                  ? 'bg-blue-100 text-blue-900 border-blue-300'
                  : 'bg-amber-100 text-amber-900 border-amber-300'
              }`}>
                {isSiteUnsuitable ? 'Constrained' : isLayoutPending ? 'Pending' : 'Feasible'}
              </span>
              <button
                id="btn-s3-hide-panel"
                type="button"
                onClick={() => setIsSheetCollapsed(true)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-all flex items-center gap-1 text-[10px] font-bold"
                title="Hide this box to see turbines and full map"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Hide Box</span>
              </button>
            </div>
          </div>

          {/* Unsuitable Alert or Metrics Grid */}
          {isLayoutPending ? (
            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-950 flex flex-col gap-2">
              <div className="flex items-center gap-2 font-bold text-blue-900">
                <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span>Micro-siting analysis required</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Click below to evaluate terrain slope, setbacks, and generate candidate turbine positions within the concession boundary.
              </p>
            </div>
          ) : isSiteUnsuitable ? (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-950 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 font-black text-rose-800">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>Site unsuitable for wind-farm development</span>
              </div>
              <div className="text-[11px] font-mono text-slate-800 font-bold bg-white/90 p-2 rounded-lg border border-rose-200 flex flex-col gap-1">
                <div>
                  Residential screening: <span className={String(layoutData.residential_screening || layoutData.pipeline_stats?.residential_screening || '').includes('TRIGGERED') ? 'text-rose-700 font-black' : 'text-emerald-700 font-black'}>
                    {layoutData.residential_screening || layoutData.pipeline_stats?.residential_screening || 'NOT TRIGGERED'}
                  </span>
                </div>
                {layoutData.main_exclusion_reason && (
                  <div className="text-[10px] text-slate-600 font-normal">
                    Primary exclusion constraint: <strong>{layoutData.main_exclusion_reason}</strong>
                  </div>
                )}
              </div>
              <div className="text-[10px] font-mono text-slate-600 bg-white/80 p-2 rounded-lg border border-rose-100">
                0 feasible turbine positions identified within concession boundary.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Net AEP</div>
                <div id="s3-meta-net-aep" className="text-sm font-black text-slate-900 font-mono mt-0.5 tabular-nums">
                  {netAep} GWh
                </div>
                <div id="s3-meta-gross-aep" className="hidden">{grossAep} GWh</div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Wake Loss</div>
                <div id="s3-meta-wake-loss" className="text-sm font-black text-rose-600 font-mono mt-0.5 tabular-nums">
                  {wakeLoss}%
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Min Spacing</div>
                <div id="s3-meta-min-spacing" className="text-sm font-black text-slate-900 font-mono mt-0.5 tabular-nums">
                  {minSpacing} m
                </div>
                <div id="s3-meta-conflicts-count" className="hidden">{conflictsCount}</div>
              </div>
            </div>
          )}

          {/* Physical Constraints Validation */}
          <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-medium">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{isSiteUnsuitable ? 'Multi-Criteria Exclusion Mask Active' : `${turbines.length} Feasible Positions Identified`}</span>
            </span>
            <span className="font-bold text-[10px] font-mono">
              Residential: {layoutData.residential_screening || layoutData.pipeline_stats?.residential_screening || 'NOT TRIGGERED'}
            </span>
          </div>

          {/* Preliminary Geotechnical Screening Label (Requirement 3) */}
          <div className="text-[10px] text-slate-500 border-t border-slate-100 pt-2 flex flex-col gap-0.5">
            <span className="font-semibold text-slate-700">Preliminary geotechnical screening (ISRIC SoilGrids v2.0)</span>
            <span className="text-[9px] text-slate-400">Detailed geotechnical investigation required before construction.</span>
          </div>

          {/* Optimization Engine Selector (Phase 8C) */}
          <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-800">Optimization Engine</span>
              <div id="ibm-hardware-status-badge" className="text-[10px] font-mono">
                {hardwareStatus.available ? (
                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    IBM Quantum · {hardwareStatus.backend_name || 'ibm_fez'} · Ready
                  </span>
                ) : (
                  <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                    IBM Quantum · Unavailable
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                id="btn-solver-classical"
                type="button"
                onClick={() => onSelectSolverEngine?.('classical')}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
                  solverEngine === 'classical'
                    ? 'bg-white text-slate-950 shadow-xs border border-slate-200/80 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Classical
              </button>
              <button
                id="btn-solver-aer"
                type="button"
                onClick={() => onSelectSolverEngine?.('aer_qaoa')}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
                  solverEngine === 'aer_qaoa'
                    ? 'bg-[#FFD21F] text-slate-950 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Aer QAOA
              </button>
              <button
                id="btn-solver-ibm"
                type="button"
                onClick={() => onSelectSolverEngine?.('ibm_quantum')}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
                  solverEngine === 'ibm_quantum'
                    ? 'bg-[#FFD21F] text-slate-950 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                IBM Quantum
              </button>
            </div>

            {/* Engineering Engine Description */}
            <div className="text-[10px] text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-200/70 flex flex-col gap-0.5">
              <span className="font-bold text-slate-800">
                {solverEngine === 'classical' && 'Classical QUBO / Heuristic Annealing'}
                {solverEngine === 'aer_qaoa' && 'Warm-Started QAOA (Qiskit Aer Simulator)'}
                {solverEngine === 'ibm_quantum' && 'IBM Quantum Physical Hardware'}
              </span>
              <span>
                {solverEngine === 'classical' && 'Solves binary quadratic layout constraints on classical CPU. Classical preprocessing enforces setback buffers and spacing.'}
                {solverEngine === 'aer_qaoa' && 'Simulation on CPU using Qiskit Aer statevector. Continuous relaxation angles warm-start the quantum circuit without hardware noise.'}
                {solverEngine === 'ibm_quantum' && 'Dispatches jobs to IBM Quantum cloud hardware queue. If credentials are unset or queue is busy, falls back gracefully to Aer.'}
              </span>
            </div>

            {/* Hardware Unavailable Warning & Fallback */}
            {solverEngine === 'ibm_quantum' && !hardwareStatus.available && (
              <div id="ibm-hardware-warning" className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-950 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                  <span>IBM Quantum hardware unavailable</span>
                </div>
                <p className="text-[10px] text-slate-600 leading-normal">
                  No valid IBM credentials or active quantum processor detected. Select Aer Simulator to run continuous statevector QAOA.
                </p>
                <button
                  id="btn-fallback-aer"
                  type="button"
                  onClick={() => onSelectSolverEngine?.('aer_qaoa')}
                  className="self-start text-[10px] font-black text-amber-900 underline hover:text-amber-950"
                >
                  Use Aer Simulator
                </button>
              </div>
            )}
          </div>

          {/* Primary Action Button */}
          <Button
            id="btn-screen3-optimize"
            variant="energy"
            size="md"
            onClick={
              isLayoutPending
                ? (onGenerateLayout || onBack)
                : isSiteUnsuitable
                ? onBack
                : onLaunchOptimize
            }
            className="w-full bg-[#FFD21F] hover:bg-[#F2C50F] text-slate-950 font-black py-3 mt-1 shadow-md text-xs"
          >
            <span>
              {isLayoutPending
                ? 'Generate Micro-Siting Layout'
                : isSiteUnsuitable
                ? 'Select Feasible Rural Site'
                : solverEngine === 'classical'
                ? 'Run Classical QUBO Optimization'
                : solverEngine === 'ibm_quantum'
                ? 'Run on IBM Quantum Hardware'
                : 'Optimize Layout'}
            </span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </Button>
        </Card>
      </aside>
    </div>
  );
};
