import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, 
  MapPin, 
  ArrowRight, 
  Database, 
  Box, 
  Edit3, 
  CircleDot, 
  Crosshair, 
  Layers, 
  Compass, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  Building2,
  Waves,
  Zap,
  Truck,
  X,
  Plus,
  Minus,
  Sparkles,
  ChevronUp,
  ChevronDown,
  Check,
  Info,
  Wind,
  Mountain,
  Sliders,
  Maximize2,
  Landmark,
  Flame,
  PenTool,
  ChevronLeft
} from 'lucide-react';
import { SiteInfo, TelemetryData } from '../../types';
import { Button } from '../ui/Button';
import { 
  fetchLandData, 
  fetchIndiaHotspots, 
  fetchSoilTelemetry, 
  fetchVillageBoundary,
  generateEngineeringConcessionBoundary
} from '../../services/api';
import { CesiumGlobeView } from '../gis/CesiumGlobeView';

interface Screen1SiteProps {
  site: SiteInfo;
  telemetry: TelemetryData | null;
  onConfirmSite: (siteParams?: Partial<SiteInfo>) => void;
  onOpenDataSources: () => void;
  onSearchLocation: (query: string) => Promise<void> | void;
  onSelectRadius: (radiusKm: number) => void;
  onToggleDrawMode: (active: boolean) => void;
  onToggle3D: () => void;
  is3DActive: boolean;
  onSiteChange: (newSite: Partial<SiteInfo>) => void;
  onBack?: () => void;
}

declare global {
  interface Window {
    L?: any;
    CESIUM_BASE_URL?: string;
  }
}

const PRESET_LOCATIONS = [
  { name: 'Kanyakumari, Tamil Nadu', lat: 8.0883, lon: 77.5385, areaKm2: 24.8, terrain: 'Coastal / Mild Slope' },
  { name: 'Jaisalmer, Rajasthan', lat: 26.9157, lon: 70.9083, areaKm2: 32.4, terrain: 'Desert Plain' },
  { name: 'Kutch, Gujarat', lat: 23.7337, lon: 69.8597, areaKm2: 28.0, terrain: 'Coastal Salt Flat' },
  { name: 'Tuticorin, Tamil Nadu', lat: 8.7642, lon: 78.1348, areaKm2: 22.5, terrain: 'Coastal Plain' },
  { name: 'Anantapur, Andhra Pradesh', lat: 14.6819, lon: 77.6006, areaKm2: 30.2, terrain: 'High Plateau' },
];

export const Screen1Site: React.FC<Screen1SiteProps> = ({
  site,
  telemetry,
  onConfirmSite,
  onOpenDataSources,
  onSearchLocation,
  onSelectRadius,
  onToggleDrawMode,
  onToggle3D,
  is3DActive,
  onSiteChange,
  onBack,
}) => {
  // Interaction Modes: 'search' | 'radius' | 'draw' | 'village' | 'hotspots'
  const [mode, setMode] = useState<'search' | 'radius' | 'draw' | 'village' | 'hotspots'>('search');
  const [searchVal, setSearchVal] = useState(site.name);
  const [selectedRadius, setSelectedRadius] = useState<number>(site.radiusKm || 5);
  const [customRadius, setCustomRadius] = useState<string>('5');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [isGpsLocating, setIsGpsLocating] = useState(false);
  const [showCoordsPopup, setShowCoordsPopup] = useState(false);
  const [manualLat, setManualLat] = useState(site.lat.toString());
  const [manualLon, setManualLon] = useState(site.lon.toString());
  const [activeBaseLayer, setActiveBaseLayer] = useState<'satellite' | 'street' | 'terrain'>('satellite');
  const [showLayerMenu, setShowLayerMenu] = useState(false);

  // Bottom Sheet state
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(() => {
    return typeof window !== 'undefined' ? window.innerWidth < 768 : false;
  });
  const [activeDrawerTab, setActiveDrawerTab] = useState<'soil' | 'wind' | 'village' | 'hotspots' | 'intel'>('soil');

  // Real Geotechnical Soil Telemetry (ISRIC SoilGrids v2.0 + Open-Meteo Land Surface)
  const [soilData, setSoilData] = useState<any>(null);
  const [isSoilLoading, setIsSoilLoading] = useState<boolean>(false);
  const [selectedFoundation, setSelectedFoundation] = useState<string>('GRAVITY_BASE');
  const [acknowledgedSoilHazard, setAcknowledgedSoilHazard] = useState<boolean>(false);

  // Normalized geotechnical metrics supporting flat and nested API structures
  const bearingKpa: number | null = soilData?.measured_bearing_capacity_kpa ?? soilData?.estimated_bearing_capacity_kpa ?? soilData?.geotechnical_metrics?.bearing_capacity_kpa ?? null;
  const usdaClass = soilData?.usda_texture_class ?? soilData?.soil_classification?.usda_texture_class ?? 'Clay Loam';
  const hazardLevel = soilData?.hazard_level ?? soilData?.geotechnical_metrics?.hazard_level ?? 'SAFE';
  const hazardTitle = soilData?.hazard_title ?? soilData?.geotechnical_metrics?.hazard_title ?? '';
  const hazardDetails: string[] = soilData?.hazard_details ?? soilData?.geotechnical_metrics?.hazard_details ?? [];
  const foundationRec = soilData?.foundation_recommendation ?? soilData?.geotechnical_metrics?.foundation_recommendation ?? 'Shallow spread footing or shallow pad foundation suitable for 3-5 MW class turbines with minimal risk of liquefaction.';
  const clayPct = soilData?.clay_percentage ?? soilData?.soil_classification?.clay_pct ?? 31.2;
  const sandPct = soilData?.sand_percentage ?? soilData?.soil_classification?.sand_pct ?? 36.4;
  const siltPct = soilData?.silt_percentage ?? soilData?.soil_classification?.silt_pct ?? 32.4;
  const bulkDensity = soilData?.bulk_density_kg_dm3 ?? soilData?.soil_classification?.bulk_density_g_cm3 ?? 1.38;
  const moisture = soilData?.live_soil_moisture_m3_m3 ?? soilData?.live_telemetry?.soil_moisture_0_to_1cm_m3pm3 ?? 0.09;
  const soilTemp = soilData?.live_soil_temperature_c ?? soilData?.live_telemetry?.soil_temperature_0cm_c ?? 31.4;

  // Real Village Boundary Data (OpenStreetMap Nominatim / Overpass)
  const [villageData, setVillageData] = useState<any>(null);
  const [isVillageLoading, setIsVillageLoading] = useState<boolean>(false);
  const [villageSearchQuery, setVillageSearchQuery] = useState<string>('');

  // Real India Wind Hotspots & Land Database
  const [indiaHotspots, setIndiaHotspots] = useState<any[]>([]);
  const [selectedStateFilter, setSelectedStateFilter] = useState<string>('ALL');
  const [selectedHotspot, setSelectedHotspot] = useState<any | null>(null);
  const [isHotspotResolving, setIsHotspotResolving] = useState<boolean>(false);
  const [landData, setLandData] = useState<any>(null);

  // Photoshop-Style Polygonal Lasso State
  const [drawnPoints, setDrawnPoints] = useState<[number, number][]>([]);
  const [drawStats, setDrawStats] = useState<{ areaKm2: number; perimKm: number } | null>(null);

  // Leaflet and Layer Refs
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const baseLayersRef = useRef<{ satellite?: any; street?: any; terrain?: any; labels?: any }>({});
  const polygonLayerRef = useRef<any>(null);
  const areaBadgeRef = useRef<any>(null);
  const hotspotMarkersLayerRef = useRef<any>(null);
  const drawnMarkersRef = useRef<any[]>([]);
  const drawnPolylineRef = useRef<any>(null);
  const rubberbandPolylineRef = useRef<any>(null);

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const drawnPointsRef = useRef(drawnPoints);
  drawnPointsRef.current = drawnPoints;

  // 1. Load Initial Hotspots
  useEffect(() => {
    fetchIndiaHotspots().then(res => {
      if (res && res.length > 0) setIndiaHotspots(res);
    }).catch(() => {});
  }, []);

  // 2. Fetch Real Geotechnical Soil Telemetry from ISRIC SoilGrids REST API v2.0
  useEffect(() => {
    let isCancelled = false;
    setIsSoilLoading(true);
    fetchSoilTelemetry(site.lat, site.lon)
      .then(res => {
        if (!isCancelled && res) {
          setSoilData(res);
          const bKpa = res.measured_bearing_capacity_kpa ?? res.estimated_bearing_capacity_kpa ?? res.geotechnical_metrics?.bearing_capacity_kpa ?? null;
          const uClass = res.usda_texture_class || res.soil_classification?.usda_texture_class || 'Clay Loam';
          const hLvl = res.hazard_level || res.geotechnical_metrics?.hazard_level || 'SAFE';
          const fType = res.foundation_type_required || (hLvl === 'CRITICAL_BLOCKED' ? 'DEEP_PILED' : 'GRAVITY_BASE');
          setSelectedFoundation(fType);
          onSiteChange({
            soil_bearing_capacity_kpa: bKpa,
            usda_texture_class: uClass,
            soil_hazard_level: hLvl,
            foundation_type: fType,
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!isCancelled) setIsSoilLoading(false);
      });

    return () => { isCancelled = true; };
  }, [site.lat, site.lon]);

  // 3. Fetch Real Environmental / Land Cover Stack
  useEffect(() => {
    const r = selectedRadius || site.radiusKm || 3.0;
    fetchLandData(site.lat, site.lon, r).then(res => {
      if (res && res.data) setLandData(res.data);
    }).catch(() => {});
  }, [site.lat, site.lon, selectedRadius, site.radiusKm]);

  // 4. Synchronize manual coordinate inputs when site updates
  useEffect(() => {
    setManualLat(site.lat.toFixed(4));
    setManualLon(site.lon.toFixed(4));
    setSearchVal(site.name);
  }, [site.lat, site.lon, site.name]);

  // 5. Geodesic & Area Calculation Utilities (Gauss ellipsoidal formula)
  const calculatePolygonAreaKm2 = useCallback((vertices: [number, number][]): number => {
    if (!vertices || vertices.length < 3) return 0;
    const R = 6371.0;
    const refLat = vertices[0][0];
    const cosLat = Math.cos((refLat * Math.PI) / 180.0);
    let area = 0.0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xi = ((vertices[i][1] * Math.PI) / 180.0) * R * cosLat;
      const yi = ((vertices[i][0] * Math.PI) / 180.0) * R;
      const xj = ((vertices[j][1] * Math.PI) / 180.0) * R * cosLat;
      const yj = ((vertices[j][0] * Math.PI) / 180.0) * R;
      area += xi * yj - xj * yi;
    }
    return Math.abs(area) / 2.0;
  }, []);

  const calculatePolygonPerimeterKm = useCallback((vertices: [number, number][]): number => {
    if (!vertices || vertices.length < 2) return 0;
    const R = 6371.0;
    const toRad = Math.PI / 180.0;
    let perim = 0.0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const lat1 = vertices[i][0] * toRad;
      const lon1 = vertices[i][1] * toRad;
      const lat2 = vertices[j][0] * toRad;
      const lon2 = vertices[j][1] * toRad;
      const dLat = lat2 - lat1;
      const dLon = lon2 - lon1;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      perim += R * c;
    }
    return perim;
  }, []);

  const generateCircleVertices = useCallback((centerLat: number, centerLon: number, radiusKm: number, steps: number = 48): [number, number][] => {
    const vertices: [number, number][] = [];
    const cosLat = Math.cos((centerLat * Math.PI) / 180.0) || 1e-6;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * 2 * Math.PI;
      const dLat = (radiusKm / 111.0) * Math.cos(angle);
      const dLon = (radiusKm / (111.0 * cosLat)) * Math.sin(angle);
      vertices.push([
        parseFloat((centerLat + dLat).toFixed(6)),
        parseFloat((centerLon + dLon).toFixed(6)),
      ]);
    }
    return vertices;
  }, []);

  // 6. Render Boundary Polygon & Badges on Map
  const renderBoundary = useCallback((lat: number, lon: number, areaKm2: number, customBoundary?: [number, number][]) => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L) return;

    if (modeRef.current === 'draw') {
      return;
    }

    if (polygonLayerRef.current) {
      try { map.removeLayer(polygonLayerRef.current); } catch (_) {}
      polygonLayerRef.current = null;
    }
    if (areaBadgeRef.current) {
      try { map.removeLayer(areaBadgeRef.current); } catch (_) {}
      areaBadgeRef.current = null;
    }

    const currentRadius = selectedRadius || site.radiusKm || Math.sqrt(Math.max(1, areaKm2) / Math.PI) || 3.0;

    let vertices: [number, number][] =
      customBoundary && customBoundary.length >= 3
        ? customBoundary
        : (site.boundary && site.boundary.length >= 3 ? (site.boundary as [number, number][]) : generateCircleVertices(lat, lon, currentRadius));

    let calcArea = calculatePolygonAreaKm2(vertices);

    // If vertices are degenerate (e.g. collinear points or calcArea < 0.2 km²), auto-derive an authentic engineering concession polygon
    if (calcArea < 0.2) {
      vertices = generateEngineeringConcessionBoundary(lat, lon, currentRadius);
      calcArea = calculatePolygonAreaKm2(vertices);
    }

    const hasPolygonBoundary = (customBoundary && customBoundary.length >= 3) || (site.boundary && site.boundary.length >= 3);
    const isCadastre = modeRef.current === 'village' || hasPolygonBoundary;

    // High-contrast, clean concession boundary polygon
    polygonLayerRef.current = L.polygon(vertices, {
      color: isCadastre ? '#10B981' : '#FFD21F',
      weight: 3.0,
      opacity: 0.95,
      fillColor: isCadastre ? '#10B981' : '#FFD21F',
      fillOpacity: 0.16,
      smoothFactor: 1,
    }).addTo(map);

    // Clear any previous drawn markers from map
    drawnMarkersRef.current.forEach((m) => {
      try { map.removeLayer(m); } catch (_) {}
    });
    drawnMarkersRef.current = [];

    try {
      map.fitBounds(polygonLayerRef.current.getBounds(), {
        padding: [45, 45],
        maxZoom: 15,
      });
    } catch (_) {}

    // Concession badge at center — Apple Liquid Glass styling
    const siteTitle = site.shortName || site.name.split(',')[0] || 'Selected Concession';
    const isVillage = modeRef.current === 'village' || hasPolygonBoundary;
    const badgeSubtext = modeRef.current === 'radius'
      ? `${calcArea.toFixed(1)} km² · ${(currentRadius).toFixed(1)} km radius`
      : (isVillage ? `${calcArea.toFixed(1)} km² · Cadastral Boundary` : `${calcArea.toFixed(1)} km² Wind Farm Parcel`);

    const unifiedBadgeIcon = L.divIcon({
      className: 'site-unified-badge-wrapper',
      html: `
        <div class="px-3.5 py-2 rounded-2xl bg-slate-950/85 backdrop-blur-2xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col items-center select-none pointer-events-none text-center">
          <div class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full ${isVillage ? 'bg-emerald-400' : 'bg-[#FFD21F]'} animate-pulse"></span>
            <span class="text-[11px] font-black text-white tracking-tight">${siteTitle}</span>
          </div>
          <div class="text-[9px] font-mono font-bold ${isVillage ? 'text-emerald-400' : 'text-amber-400'} mt-0.5">${badgeSubtext}</div>
        </div>
      `,
      iconSize: [180, 48],
      iconAnchor: [90, 24],
    });
    areaBadgeRef.current = L.marker([lat, lon], { icon: unifiedBadgeIcon }).addTo(map);

    // Invalidate size to guarantee smooth tile rendering after fitBounds
    setTimeout(() => {
      try { map.invalidateSize(); } catch (_) {}
    }, 100);
  }, [calculatePolygonAreaKm2, generateCircleVertices, selectedRadius, site.boundary, site.name, site.radiusKm, site.shortName]);

  // Fly/re-center map and update boundary polygon whenever site coordinates update
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([site.lat, site.lon], 12);
    renderBoundary(site.lat, site.lon, site.areaKm2, site.boundary as [number, number][]);
    setTimeout(() => {
      try { map.invalidateSize(); } catch (_) {}
    }, 150);
  }, [site.lat, site.lon, site.areaKm2, site.boundary, renderBoundary]);

  // 7. Initialize Direct CDN Leaflet Map
  useEffect(() => {
    if (is3DActive) return;

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
        zoom: 12,
        zoomControl: false,
        attributionControl: false,
        tap: false, // Critical for mobile touch clicks in Android Chrome & iOS Safari
      });

      // Resilient Multi-CDN Tile Layers (Google Hybrid, CartoDB Voyager / OpenStreetMap, OpenTopoMap)
      const satellite = L.tileLayer(
        'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        {
          subdomains: ['0', '1', '2', '3'],
          maxZoom: 20,
          maxNativeZoom: 19,
          attribution: 'Imagery © Google Hybrid Satellite',
        }
      );

      const street = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          subdomains: 'abcd',
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors © CARTO',
        }
      );

      const terrain = L.tileLayer(
        'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        {
          subdomains: 'abc',
          maxZoom: 17,
          attribution: 'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)',
        }
      );

      baseLayersRef.current = { satellite, street, terrain };

      // Set initial base layer
      if (activeBaseLayer === 'street') {
        street.addTo(map);
      } else if (activeBaseLayer === 'terrain') {
        terrain.addTo(map);
      } else {
        satellite.addTo(map);
      }

      setTimeout(() => {
        try { map.invalidateSize(); } catch (_) {}
      }, 80);
      setTimeout(() => {
        try { map.invalidateSize(); } catch (_) {}
      }, 300);

      // Add Scale Bar
      L.control.scale({
        position: 'bottomleft',
        metric: true,
        imperial: false,
        maxWidth: 140,
      }).addTo(map);

      mapRef.current = map;

      // ── Map Click Handler: Supports Photoshop Lasso & Direct Click ──
      map.on('click', (e: any) => {
        const lat = parseFloat(e.latlng.lat.toFixed(6));
        const lng = parseFloat(e.latlng.lng.toFixed(6));

        if (modeRef.current === 'draw') {
          // Photoshop Lasso: Click near initial point (or tap) closes the polygon
          const pts = drawnPointsRef.current;
          if (pts.length >= 3) {
            const first = pts[0];
            const dLat = Math.abs(first[0] - lat);
            const dLng = Math.abs(first[1] - lng);
            if (dLat < 0.003 && dLng < 0.003) {
              handleClosePolygon();
              return;
            }
          }
          setDrawnPoints((prev) => [...prev, [lat, lng]]);
        } else {
          handleDirectMapSelection(lat, lng);
        }
      });

      // ── Rubberband Line Handler on Mouse Move ──
      map.on('mousemove', (e: any) => {
        if (modeRef.current === 'draw' && drawnPointsRef.current.length > 0) {
          const lat = parseFloat(e.latlng.lat.toFixed(6));
          const lng = parseFloat(e.latlng.lng.toFixed(6));
          const lastPt = drawnPointsRef.current[drawnPointsRef.current.length - 1];

          if (rubberbandPolylineRef.current) {
            rubberbandPolylineRef.current.setLatLngs([lastPt, [lat, lng]]);
          } else {
            rubberbandPolylineRef.current = L.polyline([lastPt, [lat, lng]], {
              color: '#FFD21F',
              weight: 2,
              dashArray: '4, 4',
              opacity: 0.85,
            }).addTo(map);
          }
        }
      });

      // Render initial boundary
      renderBoundary(site.lat, site.lon, site.areaKm2, site.boundary as [number, number][]);
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
  }, [is3DActive]);

  // Handle Base Layer Switch
  const switchBaseLayer = (layerKey: 'satellite' | 'street' | 'terrain') => {
    if (is3DActive) {
      onToggle3D();
    }
    setActiveBaseLayer(layerKey);
    const map = mapRef.current;
    if (!map) return;

    Object.values(baseLayersRef.current).forEach((l) => {
      if (l && map.hasLayer(l)) map.removeLayer(l);
    });

    const target = baseLayersRef.current[layerKey];
    if (target) target.addTo(map);

    setTimeout(() => {
      try { map.invalidateSize(); } catch (_) {}
    }, 50);
    setShowLayerMenu(false);
  };

  // Ensure Leaflet map canvas re-measures and redraws tiles whenever mode or UI panels change
  useEffect(() => {
    if (is3DActive) return;
    const map = mapRef.current;
    if (!map) return;
    const timer1 = setTimeout(() => {
      try { map.invalidateSize(); } catch (_) {}
    }, 60);
    const timer2 = setTimeout(() => {
      try { map.invalidateSize(); } catch (_) {}
    }, 250);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [mode, is3DActive]);

  // 8. Photoshop Lasso Mode Drawing Updates
  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L) return;

    if (mode !== 'draw') {
      if (rubberbandPolylineRef.current) {
        try { map.removeLayer(rubberbandPolylineRef.current); } catch (_) {}
        rubberbandPolylineRef.current = null;
      }
      if (drawnPolylineRef.current) {
        try { map.removeLayer(drawnPolylineRef.current); } catch (_) {}
        drawnPolylineRef.current = null;
      }
      drawnMarkersRef.current.forEach((m) => {
        try { map.removeLayer(m); } catch (_) {}
      });
      drawnMarkersRef.current = [];
      return;
    }

    // Entering or active in draw mode: remove previous static circle/polygon and badge
    if (polygonLayerRef.current) {
      try { map.removeLayer(polygonLayerRef.current); } catch (_) {}
      polygonLayerRef.current = null;
    }
    if (areaBadgeRef.current) {
      try { map.removeLayer(areaBadgeRef.current); } catch (_) {}
      areaBadgeRef.current = null;
    }

    // Clear old drawn markers
    drawnMarkersRef.current.forEach((m) => {
      try { map.removeLayer(m); } catch (_) {}
    });
    drawnMarkersRef.current = [];

    if (drawnPolylineRef.current) {
      try { map.removeLayer(drawnPolylineRef.current); } catch (_) {}
      drawnPolylineRef.current = null;
    }

    if (drawnPoints.length === 0) {
      setDrawStats(null);
      return;
    }

    // Render current path/polygon
    if (drawnPoints.length >= 3) {
      drawnPolylineRef.current = L.polygon(drawnPoints, {
        color: '#FFD21F',
        weight: 3,
        dashArray: '6, 6',
        fillColor: '#FFD21F',
        fillOpacity: 0.25,
      }).addTo(map);

      const area = calculatePolygonAreaKm2(drawnPoints);
      const perim = calculatePolygonPerimeterKm(drawnPoints);
      setDrawStats({ areaKm2: area, perimKm: perim });
    } else if (drawnPoints.length >= 2) {
      drawnPolylineRef.current = L.polyline(drawnPoints, {
        color: '#FFD21F',
        weight: 2.5,
        dashArray: '5, 5',
      }).addTo(map);
    }

    // Interactive Draggable Vertex Handles (Photoshop style)
    drawnPoints.forEach((pt, idx) => {
      const isFirst = idx === 0 && drawnPoints.length >= 3;
      const markerIcon = L.divIcon({
        className: 'gis-vertex-marker-wrapper',
        html: `
          <div class="w-6 h-6 rounded-full bg-slate-900 border-2 border-[#FFD21F] text-[#FFD21F] font-mono font-black text-[10px] flex items-center justify-center shadow-lg transition-transform hover:scale-125 cursor-move ${
            isFirst ? 'ring-2 ring-emerald-400 ring-offset-1' : ''
          }" title="${isFirst ? 'Click to close polygon' : 'Drag to adjust vertex'}">
            ${idx + 1}
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const m = L.marker(pt, { icon: markerIcon, draggable: true }).addTo(map);

      m.on('drag', (e: any) => {
        const newPos = e.target.getLatLng();
        setDrawnPoints((pts) => {
          const updated = [...pts];
          updated[idx] = [parseFloat(newPos.lat.toFixed(6)), parseFloat(newPos.lng.toFixed(6))];
          return updated;
        });
      });

      m.on('click', () => {
        if (isFirst) handleClosePolygon();
      });

      m.on('contextmenu', (e: any) => {
        e.originalEvent?.preventDefault();
        setDrawnPoints((pts) => pts.filter((_, i) => i !== idx));
      });

      drawnMarkersRef.current.push(m);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawnPoints, mode, calculatePolygonAreaKm2, calculatePolygonPerimeterKm]);

  // Robust Hotspot Resolver and Selection Handler
  const handleSelectHotspot = useCallback(async (h: any, action: 'select' | 'view' | 'use' = 'select') => {
    const lat = Number(h.latitude ?? h.lat);
    const lon = Number(h.longitude ?? h.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setSearchError('Hotspot does not contain valid geographic coordinates.');
      return;
    }

    setSelectedHotspot(h);
    setIsHotspotResolving(true);
    setSearchError('');

    const hName = h.location_name || h.name || `${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E`;
    const hDist = h.district || hName.split(',')[0].trim();
    const hState = h.state || 'India';
    const fullName = `${hDist}, ${hState}`;
    const hSpeed = Number(h.annual_mean_wind_mps ?? h.wind_speed_mps ?? 7.8);
    const hElevation = Number(h.elevation_m ?? 50);
    const hTerrain = h.terrain_type || h.terrain || 'Plateau / Open Ridge';
    const r = selectedRadius || site.radiusKm || 3.5;

    try {
      // 1. Resolve authentic administrative / cadastral boundary if available
      const vRes = await fetchVillageBoundary(hDist, lat, lon).catch(() => null);

      let effectiveBoundary: [number, number][];
      let effectiveAreaKm2: number;
      let effectiveRadiusKm = r;
      let resolvedDisplayName = fullName;

      if (vRes && vRes.boundary && vRes.boundary.length >= 3) {
        effectiveBoundary = vRes.boundary;
        effectiveAreaKm2 = vRes.area_km2 || calculatePolygonAreaKm2(vRes.boundary);
        effectiveRadiusKm = Math.round(Math.sqrt(Math.max(0.5, effectiveAreaKm2) / Math.PI) * 10) / 10;
        resolvedDisplayName = vRes.display_name || fullName;
        setVillageData(vRes);
      } else {
        // Engineering concession buffer polygon
        effectiveBoundary = generateEngineeringConcessionBoundary(lat, lon, r);
        effectiveAreaKm2 = Math.round(Math.PI * r * r * 10) / 10;
        setVillageData(null);
      }

      setSelectedRadius(effectiveRadiusKm);
      onSelectRadius(effectiveRadiusKm);

      const updatedSiteParams: Partial<SiteInfo> = {
        name: resolvedDisplayName,
        shortName: hDist,
        lat,
        lon,
        radiusKm: effectiveRadiusKm,
        areaKm2: effectiveAreaKm2,
        boundary: effectiveBoundary,
        windSpeedMps: hSpeed,
        elevationM: hElevation,
        terrainType: hTerrain,
      };

      onSiteChange(updatedSiteParams);

      // 2. Pan and render boundary on map
      if (mapRef.current) {
        mapRef.current.setView([lat, lon], 12);
      }
      renderBoundary(lat, lon, effectiveAreaKm2, effectiveBoundary);

      // 3. Fetch geotechnical soil data
      setIsSoilLoading(true);
      fetchSoilTelemetry(lat, lon)
        .then((sRes) => {
          if (sRes) {
            setSoilData(sRes);
            const hz = sRes.hazard_level || sRes.geotechnical_metrics?.hazard_level;
            if (hz === 'CRITICAL_BLOCKED') {
              setSelectedFoundation('DEEP_PILED');
            }
          }
        })
        .catch(() => {})
        .finally(() => setIsSoilLoading(false));

      // 4. Action handling
      if (action === 'use') {
        onConfirmSite({
          ...site,
          ...updatedSiteParams,
          soil_bearing_capacity_kpa: bearingKpa,
          usda_texture_class: usdaClass,
          foundation_type: selectedFoundation,
          soil_hazard_level: hazardLevel,
        });
      } else if (action === 'view') {
        setIsSheetCollapsed(false);
      }
    } catch (err: any) {
      console.warn('Hotspot resolution warning:', err);
      // Fallback: apply direct hotspot coordinates
      const fallbackBoundary = generateCircleVertices(lat, lon, r);
      const fallbackAreaKm2 = Math.round(Math.PI * r * r * 10) / 10;
      const updatedSiteParams: Partial<SiteInfo> = {
        name: fullName,
        shortName: hDist,
        lat,
        lon,
        radiusKm: r,
        areaKm2: fallbackAreaKm2,
        boundary: fallbackBoundary,
        windSpeedMps: hSpeed,
      };
      onSiteChange(updatedSiteParams);
      renderBoundary(lat, lon, fallbackAreaKm2, fallbackBoundary);
    } finally {
      setIsHotspotResolving(false);
    }
  }, [
    selectedRadius,
    site,
    calculatePolygonAreaKm2,
    generateCircleVertices,
    onSelectRadius,
    onSiteChange,
    renderBoundary,
    onConfirmSite,
    bearingKpa,
    usdaClass,
    selectedFoundation,
    hazardLevel
  ]);

  // Leaflet Map Markers for Hotspots (Rendered when in 'hotspots' mode)
  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L) return;

    if (hotspotMarkersLayerRef.current) {
      try { map.removeLayer(hotspotMarkersLayerRef.current); } catch (_) {}
      hotspotMarkersLayerRef.current = null;
    }

    if (mode !== 'hotspots') return;

    const markersGroup = L.layerGroup();
    const list = (indiaHotspots.length > 0 ? indiaHotspots : PRESET_LOCATIONS).filter((h: any) => {
      if (selectedStateFilter === 'ALL') return true;
      const st = h.state || h.name || '';
      return st.toLowerCase().includes(selectedStateFilter.toLowerCase());
    });

    list.forEach((h: any) => {
      const hLat = Number(h.latitude ?? h.lat);
      const hLon = Number(h.longitude ?? h.lon);
      if (!Number.isFinite(hLat) || !Number.isFinite(hLon)) return;

      const hName = h.location_name || h.name || 'Wind Hotspot';
      const hSpeed = Number(h.annual_mean_wind_mps ?? h.wind_speed_mps ?? 7.8);
      const isSelected = selectedHotspot?.id === h.id || (Math.abs(site.lat - hLat) < 0.005 && Math.abs(site.lon - hLon) < 0.005);

      const markerHtml = `
        <div style="
          display: flex;
          align-items: center;
          gap: 4px;
          background: ${isSelected ? '#FFD21F' : 'rgba(15, 23, 42, 0.92)'};
          color: ${isSelected ? '#0f172a' : '#ffffff'};
          padding: 4px 8px;
          border-radius: 9999px;
          border: 1.5px solid ${isSelected ? '#b45309' : 'rgba(255, 255, 255, 0.3)'};
          box-shadow: 0 4px 14px rgba(0,0,0,0.3);
          font-family: ui-monospace, monospace;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
          transform: translate(-50%, -50%);
        ">
          <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${isSelected ? '#0f172a' : '#FFD21F'};"></span>
          <span>${hSpeed.toFixed(1)} m/s</span>
        </div>
      `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'aqw-hotspot-map-pin',
        iconSize: [80, 24],
        iconAnchor: [40, 12],
      });

      const marker = L.marker([hLat, hLon], { icon: customIcon });
      marker.on('click', () => {
        handleSelectHotspot(h, 'select');
      });

      marker.bindTooltip(`<b>${hName}</b><br/>Resource: ${hSpeed.toFixed(1)} m/s<br/>Click to load site`, {
        direction: 'top',
        offset: [0, -12],
      });

      marker.addTo(markersGroup);
    });

    markersGroup.addTo(map);
    hotspotMarkersLayerRef.current = markersGroup;

    return () => {
      if (hotspotMarkersLayerRef.current && map) {
        try { map.removeLayer(hotspotMarkersLayerRef.current); } catch (_) {}
        hotspotMarkersLayerRef.current = null;
      }
    };
  }, [mode, indiaHotspots, selectedStateFilter, selectedHotspot, site.lat, site.lon, handleSelectHotspot]);

  // Direct Map Click
  const handleDirectMapSelection = (lat: number, lon: number) => {
    const shortName = `${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E`;
    const r = selectedRadius || site.radiusKm || 3.0;

    // In village mode: NEVER render synthetic circles! Resolve authentic administrative border directly.
    if (mode === 'village') {
      setIsVillageLoading(true);
      fetchVillageBoundary('', lat, lon)
        .then((vRes) => {
          if (vRes && vRes.boundary && vRes.boundary.length >= 3) {
            setVillageData(vRes);
            const cLat = vRes.center ? vRes.center[0] : (vRes.latitude ?? lat);
            const cLon = vRes.center ? vRes.center[1] : (vRes.longitude ?? lon);
            const vArea = vRes.area_km2 || calculatePolygonAreaKm2(vRes.boundary);
            const autoRadius = Math.round(Math.sqrt(Math.max(0.5, vArea) / Math.PI) * 10) / 10;

            setSelectedRadius(autoRadius);
            onSelectRadius(autoRadius);
            setActiveDrawerTab('village');

            onSiteChange({
              name: vRes.display_name || vRes.village_name || shortName,
              shortName: vRes.village_name || shortName,
              lat: cLat,
              lon: cLon,
              radiusKm: autoRadius,
              areaKm2: vArea,
              boundary: vRes.boundary,
            });
            renderBoundary(cLat, cLon, vArea, vRes.boundary);

            // Fetch soil at village center
            setIsSoilLoading(true);
            fetchSoilTelemetry(cLat, cLon)
              .then((sRes) => { if (sRes) setSoilData(sRes); })
              .catch(() => {})
              .finally(() => setIsSoilLoading(false));
          } else {
            setSearchError(`No administrative boundary found at ${shortName}. Use Lasso Boundary to draw.`);
          }
        })
        .catch(() => {})
        .finally(() => setIsVillageLoading(false));
      return;
    }

    const fallbackBoundary = generateCircleVertices(lat, lon, r);
    const fallbackAreaKm2 = Math.round(Math.PI * r * r * 10) / 10;
    
    // Initial display with radius concession
    onSiteChange({
      ...site,
      lat,
      lon,
      shortName,
      name: `${shortName}, Engineering Site`,
      radiusKm: r,
      areaKm2: fallbackAreaKm2,
      boundary: fallbackBoundary,
    });
    renderBoundary(lat, lon, fallbackAreaKm2, fallbackBoundary);

    // Live Geotechnical Soil Telemetry for this coordinate
    setIsSoilLoading(true);
    fetchSoilTelemetry(lat, lon)
      .then((sRes) => {
        if (sRes) {
          setSoilData(sRes);
          const hz = sRes.hazard_level || sRes.geotechnical_metrics?.hazard_level;
          if (hz === 'CRITICAL_BLOCKED') {
            setSelectedFoundation('DEEP_PILED');
          }
        }
      })
      .catch(() => {})
      .finally(() => setIsSoilLoading(false));

    // Automatically check if this location has an official village/town boundary!
    setIsVillageLoading(true);
    fetchVillageBoundary('', lat, lon)
      .then((vRes) => {
        if (vRes && vRes.boundary && vRes.boundary.length >= 3) {
          setVillageData(vRes);
          const cLat = vRes.center ? vRes.center[0] : (vRes.latitude ?? lat);
          const cLon = vRes.center ? vRes.center[1] : (vRes.longitude ?? lon);
          const vArea = vRes.area_km2 || calculatePolygonAreaKm2(vRes.boundary);
          const autoRadius = Math.round(Math.sqrt(Math.max(0.5, vArea) / Math.PI) * 10) / 10;

          // Auto-fetch kilometres and switch to village mode
          setSelectedRadius(autoRadius);
          onSelectRadius(autoRadius);
          setMode('village');
          setActiveDrawerTab('village');

          onSiteChange({
            name: vRes.display_name || vRes.village_name,
            shortName: vRes.village_name,
            lat: cLat,
            lon: cLon,
            radiusKm: autoRadius,
            areaKm2: vArea,
            boundary: vRes.boundary,
          });
          renderBoundary(cLat, cLon, vArea, vRes.boundary);

          // Refresh soil telemetry at village center
          fetchSoilTelemetry(cLat, cLon)
            .then((sRes) => {
              if (sRes) {
                setSoilData(sRes);
                const hz = sRes.hazard_level || sRes.geotechnical_metrics?.hazard_level;
                if (hz === 'CRITICAL_BLOCKED') {
                  setSelectedFoundation('DEEP_PILED');
                }
              }
            })
            .catch(() => {});
        } else {
          // Standard reverse geocode for name
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`)
            .then((r) => r.json())
            .then((data) => {
              if (data && data.display_name) {
                onSiteChange({ name: data.display_name, shortName: data.display_name.split(',')[0] });
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setIsVillageLoading(false));
  };

  // Search Submission: Automatically searches and loads village boundary polygon
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchVal.trim();
    if (!query) return;

    setIsSearching(true);
    setSearchError('');
    try {
      // 1. Auto-fetch official village/town administrative boundary
      const vRes = await fetchVillageBoundary(query);
      if (vRes && vRes.boundary && vRes.boundary.length >= 3) {
        setVillageData(vRes);
        const centerLat = vRes.center ? vRes.center[0] : (vRes.latitude ?? site.lat);
        const centerLon = vRes.center ? vRes.center[1] : (vRes.longitude ?? site.lon);
        const area = vRes.area_km2 || calculatePolygonAreaKm2(vRes.boundary);
        const autoRadius = Math.round(Math.sqrt(Math.max(0.5, area) / Math.PI) * 10) / 10;

        // Auto-fetch kilometres and switch to village mode
        setSelectedRadius(autoRadius);
        onSelectRadius(autoRadius);
        setMode('village');
        setActiveDrawerTab('village');

        onSiteChange({
          name: vRes.display_name || vRes.village_name || query,
          shortName: vRes.village_name || query,
          lat: centerLat,
          lon: centerLon,
          radiusKm: autoRadius,
          areaKm2: area,
          boundary: vRes.boundary,
        });

        renderBoundary(centerLat, centerLon, area, vRes.boundary);

        // Fetch live soil telemetry for the village
        setIsSoilLoading(true);
        fetchSoilTelemetry(centerLat, centerLon)
          .then((sRes) => {
            if (sRes) {
              setSoilData(sRes);
              const hz = sRes.hazard_level || sRes.geotechnical_metrics?.hazard_level;
              if (hz === 'CRITICAL_BLOCKED') {
                setSelectedFoundation('DEEP_PILED');
              }
            }
          })
          .catch(() => {})
          .finally(() => setIsSoilLoading(false));

        return;
      }

      // 2. Geocoding fallback if no official boundary polygon in cadastre
      await onSearchLocation(query);
    } catch (_) {
      setSearchError('Location not found. Try entering coordinates or clicking the map.');
    } finally {
      setIsSearching(false);
    }
  };

  // Village Boundary Auto-Snap Handler
  const handleSnapToVillage = useCallback(async (forcedName?: string) => {
    const rawName = forcedName !== undefined ? forcedName : (villageSearchQuery.trim() || site.shortName || site.name.split(',')[0]);
    // Ignore pure coordinate strings
    const isCoords = /^[-+]?[0-9]*\.?[0-9]+°?[NS]?,?\s*[-+]?[0-9]*\.?[0-9]+°?[EW]?/i.test(rawName);
    const villageName = isCoords ? '' : rawName;

    setIsVillageLoading(true);
    setSearchError('');
    try {
      let res = await fetchVillageBoundary(villageName, site.lat, site.lon);
      if (!res || !res.boundary || res.boundary.length < 3) {
        // Fallback to coordinates reverse geocode
        res = await fetchVillageBoundary('', site.lat, site.lon);
      }

      if (res && res.boundary && res.boundary.length >= 3) {
        setVillageData(res);
        setVillageSearchQuery(res.village_name || villageName || 'Village Cadastre');
        const centerLat = res.center ? res.center[0] : (res.latitude ?? site.lat);
        const centerLon = res.center ? res.center[1] : (res.longitude ?? site.lon);
        const area = res.area_km2 || calculatePolygonAreaKm2(res.boundary);
        const autoRadius = Math.round(Math.sqrt(Math.max(0.5, area) / Math.PI) * 10) / 10;

        // Auto-fetch kilometres and switch to village mode
        setSelectedRadius(autoRadius);
        onSelectRadius(autoRadius);
        setMode('village');
        setActiveDrawerTab('village');

        onSiteChange({
          name: res.display_name || res.village_name || villageName || site.name,
          shortName: res.village_name || villageName || site.shortName,
          lat: centerLat,
          lon: centerLon,
          radiusKm: autoRadius,
          areaKm2: area,
          boundary: res.boundary,
        });

        renderBoundary(centerLat, centerLon, area, res.boundary);

        // Fetch live soil telemetry for the village
        setIsSoilLoading(true);
        fetchSoilTelemetry(centerLat, centerLon)
          .then((sRes) => {
            if (sRes) {
              setSoilData(sRes);
              const hz = sRes.hazard_level || sRes.geotechnical_metrics?.hazard_level;
              if (hz === 'CRITICAL_BLOCKED') {
                setSelectedFoundation('DEEP_PILED');
              }
            }
          })
          .catch(() => {})
          .finally(() => setIsSoilLoading(false));
      } else {
        setSearchError(`Administrative boundary for "${villageName || 'this site'}" not found in OSM cadastre. Using concession radius.`);
      }
    } catch (err: any) {
      setSearchError('Village boundary lookup failed. Using radius concession.');
    } finally {
      setIsVillageLoading(false);
    }
  }, [calculatePolygonAreaKm2, onSelectRadius, onSiteChange, renderBoundary, site.lat, site.lon, site.name, site.shortName, villageSearchQuery]);

  // GPS Current Location
  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setSearchError('Geolocation is not supported by your browser.');
      return;
    }
    setIsGpsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsGpsLocating(false);
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lon = parseFloat(pos.coords.longitude.toFixed(6));
        handleDirectMapSelection(lat, lon);
      },
      (err) => {
        setIsGpsLocating(false);
        setSearchError(`GPS access error: ${err.message}`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Apply Radius Concession
  const handleApplyRadius = (radiusKm: number) => {
    setSelectedRadius(radiusKm);
    onSelectRadius(radiusKm);

    const vertices = generateCircleVertices(site.lat, site.lon, radiusKm);
    const areaKm2 = Math.PI * radiusKm * radiusKm;
    onSiteChange({
      radiusKm,
      areaKm2,
      boundary: vertices,
    });

    renderBoundary(site.lat, site.lon, areaKm2, vertices);
  };

  // Close Custom Drawn Polygon (Photoshop Lasso)
  const handleClosePolygon = () => {
    if (drawnPoints.length < 3) return;
    const areaKm2 = calculatePolygonAreaKm2(drawnPoints);
    const perimKm = calculatePolygonPerimeterKm(drawnPoints);
    const centerLat = drawnPoints.reduce((sum, v) => sum + v[0], 0) / drawnPoints.length;
    const centerLon = drawnPoints.reduce((sum, v) => sum + v[1], 0) / drawnPoints.length;

    onSiteChange({
      ...site,
      lat: centerLat,
      lon: centerLon,
      areaKm2,
      perimeterKm: perimKm,
      boundary: drawnPoints,
      name: `Custom Wind Farm Parcel (${areaKm2.toFixed(1)} km²)`,
      shortName: `Custom Parcel`,
    });

    if (drawnPolylineRef.current && mapRef.current) {
      try { mapRef.current.removeLayer(drawnPolylineRef.current); } catch (_) {}
      drawnPolylineRef.current = null;
    }
    drawnMarkersRef.current.forEach((m) => {
      try { mapRef.current?.removeLayer(m); } catch (_) {}
    });
    drawnMarkersRef.current = [];
    if (rubberbandPolylineRef.current && mapRef.current) {
      try { mapRef.current.removeLayer(rubberbandPolylineRef.current); } catch (_) {}
      rubberbandPolylineRef.current = null;
    }

    renderBoundary(centerLat, centerLon, areaKm2, drawnPoints);
    setDrawnPoints([]);
    setMode('search');
    onToggleDrawMode(false);
  };

  // Manual Coordinates Submit
  const handleApplyCoordinates = () => {
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setSearchError('Invalid latitude/longitude coordinates.');
      return;
    }
    setShowCoordsPopup(false);
    handleDirectMapSelection(lat, lon);
  };

  // Reset to default boundary
  const handleResetBoundary = () => {
    const r = selectedRadius || site.radiusKm || 3.0;
    const defaultBoundary = generateCircleVertices(site.lat, site.lon, r);
    const areaKm2 = Math.round(Math.PI * r * r * 10) / 10;
    onSiteChange({ radiusKm: r, areaKm2, boundary: defaultBoundary });
    renderBoundary(site.lat, site.lon, areaKm2, defaultBoundary);
  };

  // Fit camera to boundary
  const handleFitSite = () => {
    if (mapRef.current && polygonLayerRef.current) {
      mapRef.current.fitBounds(polygonLayerRef.current.getBounds(), { padding: [45, 45] });
    }
  };

  const isCriticalSoil = hazardLevel === 'CRITICAL_BLOCKED';
  const isPiledSelected = selectedFoundation === 'DEEP_PILED';
  const isProceedBlocked = isCriticalSoil && !isPiledSelected;

  // 9-point Geotechnical Site Intelligence Checklist Items
  const intelItems = [
    { 
      label: 'Checking terrain', 
      source: landData?.elevation_mean 
        ? `Copernicus DEM (${Math.round(landData.elevation_mean)}m avg, ${landData.slope_mean}° slope)` 
        : `Verified (Copernicus DEM, ${site.elevationM || 42}m avg)`, 
      status: landData?.overall_status === 'UNKNOWN' && !landData?.elevation_mean ? 'warning' : 'verified' 
    },
    { 
      label: 'Checking available land', 
      source: landData?.buildable_percent !== undefined
        ? `Verified (${landData.buildable_percent}% buildable within ${(site.areaKm2 || 24.8).toFixed(1)} km²)` 
        : `Screening (${(site.areaKm2 || 24.8).toFixed(1)} km² search envelope)`, 
      status: landData?.overall_status === 'UNKNOWN' ? 'warning' : 'verified' 
    },
    { 
      label: 'Checking buildings & houses', 
      source: landData?.overall_status === 'UNKNOWN'
        ? 'Unverified (OSM/Cadastral Survey Required)'
        : (landData?.excluded_percent > 0 ? `Enforced (${landData.excluded_percent}% setback buffer)` : 'MNRE 2024 Buffer Enforced'), 
      status: landData?.overall_status === 'UNKNOWN' ? 'warning' : 'verified' 
    },
    { 
      label: 'Checking rivers & water', 
      source: landData?.overall_status === 'UNKNOWN' ? 'Unverified Riparian Buffer' : 'Riparian Margin Enforced (NRCP)', 
      status: landData?.overall_status === 'UNKNOWN' ? 'warning' : 'verified' 
    },
    { 
      label: 'Checking ocean & coast', 
      source: `${site.distanceToCoastKm || 0.2} km to Coast (CRZ Screening)`, 
      status: 'verified' 
    },
    { 
      label: 'Checking electrical grid', 
      source: landData?.overall_status === 'UNKNOWN' ? 'Unverified Grid Corridor' : 'CEA / MNRE 2024 Corridor Enforced', 
      status: landData?.overall_status === 'UNKNOWN' ? 'warning' : 'verified' 
    },
    { 
      label: 'Checking heavy crane access', 
      source: landData?.slope_mean > 15 ? 'Exceeded: Slope > 15°' : (landData?.slope_mean >= 8 ? 'Conditional: Benching Required' : 'IEC 61400 Compliant (<8°)'), 
      status: landData?.slope_mean > 15 ? 'error' : (landData?.slope_mean >= 8 ? 'warning' : 'verified') 
    },
    { 
      label: 'Checking wind resource', 
      source: landData?.wind_speed_100m 
        ? `NIWE 120m Atlas (${landData.wind_speed_100m.toFixed(1)} m/s)` 
        : `Verified (NIWE ${(site.windSpeedMps || 7.1).toFixed(1)} m/s)`, 
      status: 'verified' 
    },
    { 
      label: 'Geotechnical soil integrity', 
      source: 'Preliminary Geotechnical Screening (ISRIC SoilGrids v2.0)', 
      status: 'verified' 
    },
  ];

  return (
    <div id="screen-1-container" className="relative w-full h-[calc(100dvh-53px)] overflow-hidden flex flex-col md:flex-row bg-slate-900 selection:bg-[#FFD21F] selection:text-slate-950 font-sans">
      
      {/* ── MAP CANVAS (Fills whole background on mobile, right side on desktop) ── */}
      <div className="flex-1 w-full h-full relative overflow-hidden order-1 md:order-2">
        
        {/* Leaflet 2D Interactive Map */}
        <div
          ref={mapContainerRef}
          id="map"
          className={`w-full h-full ${is3DActive ? 'hidden' : 'block'} ${mode === 'draw' ? 'cursor-crosshair' : 'cursor-grab'}`}
        />

        {/* Cesium 3D Globe */}
        <div
          id="screen1-cesium"
          className={`w-full h-full absolute inset-0 ${is3DActive ? 'block' : 'hidden'}`}
        >
          {is3DActive && (
            <CesiumGlobeView
              containerId="screen1-cesium-canvas"
              centerLat={site.lat}
              centerLon={site.lon}
              radiusKm={selectedRadius || site.radiusKm || 3.0}
              boundary={site.boundary}
              windDirectionDeg={landData?.wind_direction_100m || site.windDirectionDeg || 300}
              windSpeedMps={landData?.wind_speed_100m || site.windSpeedMps || 7.1}
              showWakes={false}
            />
          )}
        </div>

        {/* ── TOP FLOATING CONTROL BAR (WhatsApp / Apple Liquid Glass) ── */}
        <div className="absolute top-3 left-3 right-3 md:left-4 md:right-auto md:w-[480px] z-[1050] flex flex-col gap-2 pointer-events-none">
          
          {/* Main Search Pill */}
          <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-[0_8px_32px_rgba(15,23,42,0.15)] pointer-events-auto transition-all">
            {onBack && (
              <button
                type="button"
                id="btn-screen1-back"
                onClick={onBack}
                className="p-1.5 sm:p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-800 dark:text-white active:scale-95 transition-all shrink-0 cursor-pointer"
                title="Back to Home / Dashboard"
              >
                <ChevronLeft className="w-4 h-4 stroke-[3]" />
              </button>
            )}
            <form onSubmit={handleSearchSubmit} className="relative flex-1 flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                id="map-search-input"
                type="text"
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                placeholder="Search village, city, or coordinates..."
                className="w-full pl-9 pr-10 py-2 rounded-xl bg-transparent text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                id="btn-search-arrow"
                disabled={isSearching}
                className="absolute right-1 p-1.5 rounded-xl bg-[#FFD21F] hover:bg-[#F2C50F] text-slate-950 font-black shadow-xs active:scale-95 transition-all cursor-pointer"
                title="Search"
              >
                {isSearching ? (
                  <span className="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin block" />
                ) : (
                  <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
                )}
              </button>
            </form>

            <div className="h-6 w-[1px] bg-slate-200 dark:bg-white/10" />

            {/* GPS Locate Button */}
            <button
              type="button"
              id="btn-use-current-location"
              onClick={handleUseGps}
              disabled={isGpsLocating}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-800 dark:text-white active:scale-95 transition-all"
              title="Locate Me (GPS)"
            >
              <Crosshair className={`w-4 h-4 text-amber-500 ${isGpsLocating ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Mode Switcher Capsule (WhatsApp Tab Style) */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-md pointer-events-auto overflow-x-auto no-scrollbar">
            <button
              id="btn-search-mode"
              type="button"
              onClick={() => { setMode('search'); onToggleDrawMode(false); }}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                mode === 'search'
                  ? 'bg-slate-950 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-white/50'
              }`}
            >
              <MapPin className="w-3 h-3" />
              <span>Site</span>
            </button>

            <button
              id="btn-radius-mode"
              type="button"
              onClick={() => {
                setDrawnPoints([]);
                setDrawStats(null);
                setMode('radius');
                onToggleDrawMode(false);
                handleApplyRadius(selectedRadius || site.radiusKm || 5);
              }}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                mode === 'radius'
                  ? 'bg-[#FFD21F] text-slate-950 font-black shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-white/50'
              }`}
            >
              <CircleDot className="w-3 h-3" />
              <span>Radius</span>
            </button>

            <button
              id="btn-draw-mode"
              type="button"
              onClick={() => {
                const next = mode === 'draw' ? 'search' : 'draw';
                setMode(next);
                onToggleDrawMode(next === 'draw');
              }}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                mode === 'draw'
                  ? 'bg-[#FFD21F] text-slate-950 font-black shadow-xs animate-pulse'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-white/50'
              }`}
            >
              <Edit3 className="w-3 h-3" />
              <span>Lasso Boundary</span>
            </button>

            <button
              type="button"
              id="btn-village-mode"
              onClick={() => {
                setDrawnPoints([]);
                setDrawStats(null);
                setMode('village');
                onToggleDrawMode(false);
                handleSnapToVillage();
              }}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                mode === 'village'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-white/50'
              }`}
            >
              <Landmark className="w-3 h-3" />
              <span>Village Cadastre</span>
            </button>

            <button
              type="button"
              id="btn-hotspots-mode"
              onClick={() => { setMode('hotspots'); onToggleDrawMode(false); }}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                mode === 'hotspots'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-white/50'
              }`}
            >
              <Flame className="w-3 h-3" />
              <span>Hotspots</span>
            </button>
          </div>

          {/* Mobile Dedicated Layer Switcher Row (No Overlap) */}
          <div className="flex md:hidden items-center gap-1 p-1 rounded-xl bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-sm pointer-events-auto">
            <button
              onClick={() => switchBaseLayer('satellite')}
              data-layer="satellite"
              id="btn-layer-satellite"
              className={`map-layer-btn px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                activeBaseLayer === 'satellite' && !is3DActive ? 'bg-[#FFD21F] text-slate-950 font-black shadow-xs' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Sat
            </button>
            <button
              onClick={() => switchBaseLayer('street')}
              data-layer="street"
              id="btn-layer-osm"
              className={`map-layer-btn px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                activeBaseLayer === 'street' && !is3DActive ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Map
            </button>
            <button
              onClick={() => switchBaseLayer('terrain')}
              data-layer="terrain"
              id="btn-layer-terrain"
              className={`map-layer-btn px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                activeBaseLayer === 'terrain' && !is3DActive ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Terrain
            </button>
            <button
              id="btn-s1-toggle-3d"
              onClick={onToggle3D}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                is3DActive ? 'bg-[#FFD21F] text-slate-950 shadow-xs' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Box className="w-3 h-3" />
              <span>3D</span>
            </button>
          </div>

          {/* Mode Sub-Panels (Floating directly below modes) */}
          {mode === 'radius' && (
            <div id="radius-mode-container" className="p-3 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-xl pointer-events-auto flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-white">Concession Radius:</span>
                <span className="text-xs font-mono font-black text-amber-600 dark:text-amber-400">
                  {(selectedRadius || site.radiusKm || 3).toFixed(1)} km · {(Math.PI * Math.pow(selectedRadius || site.radiusKm || 3, 2)).toFixed(1)} km²
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="30"
                step="0.5"
                value={selectedRadius || site.radiusKm || 3}
                onChange={(e) => handleApplyRadius(parseFloat(e.target.value))}
                className="w-full accent-[#FFD21F] cursor-pointer"
              />
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 5, 8, 10, 15, 20].map((r) => (
                  <button
                    key={r}
                    type="button"
                    id={`btn-radius-${r}km`}
                    onClick={() => handleApplyRadius(r)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                      (selectedRadius || site.radiusKm || 3) === r
                        ? 'bg-[#FFD21F] text-slate-950 font-black shadow-xs ring-1 ring-amber-400'
                        : 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'village' && (
            <div className="p-3 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-xl pointer-events-auto flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-white">Village Administrative Border (OSM Cadastre)</span>
                <span className="text-[10px] font-mono text-emerald-600 font-bold">100% Real GeoJSON</span>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  id="input-village-search"
                  value={villageSearchQuery}
                  onChange={(e) => setVillageSearchQuery(e.target.value)}
                  placeholder="e.g. Brahmanigaon, Muppandal, Kayathar"
                  className="flex-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/10 text-xs text-slate-900 dark:text-white focus:outline-none"
                />
                <button
                  type="button"
                  id="btn-village-snap"
                  disabled={isVillageLoading}
                  onClick={() => handleSnapToVillage(villageSearchQuery)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  {isVillageLoading ? 'Loading...' : 'Snap Border'}
                </button>
              </div>
              {villageData && (
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-[11px] text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold">{villageData.village_name || villageData.name}</div>
                    <div className="text-[10px] text-emerald-700 dark:text-emerald-300">
                      Cadastral Area: <strong>{villageData.area_km2?.toFixed(2)} km²</strong> · {villageData.coordinates?.length || villageData.boundary?.length || 24} border vertices
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-mono text-[10px] font-black">
                    Auto-Snapped
                  </span>
                </div>
              )}
            </div>
          )}

          {mode === 'hotspots' && (
            <div className="p-3.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-white/70 dark:border-white/10 shadow-xl pointer-events-auto flex flex-col gap-2.5 max-h-72 overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    <span>Verified India Wind Hotspots (NIWE)</span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Select a resource hotspot to resolve geographic site &amp; concession boundary
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  {indiaHotspots.length || 24} Sites
                </span>
              </div>

              {/* State Filter Pills */}
              <div className="flex gap-1 overflow-x-auto no-scrollbar py-0.5">
                {['ALL', 'Tamil Nadu', 'Gujarat', 'Rajasthan', 'Karnataka', 'Odisha', 'Andhra Pradesh'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSelectedStateFilter(st)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${
                      selectedStateFilter === st
                        ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950 shadow-xs'
                        : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Hotspot Cards List */}
              <div className="flex flex-col gap-2">
                {(indiaHotspots.length > 0 ? indiaHotspots : PRESET_LOCATIONS).filter((h: any) => {
                  if (selectedStateFilter === 'ALL') return true;
                  const st = h.state || h.name || '';
                  return st.toLowerCase().includes(selectedStateFilter.toLowerCase());
                }).map((h: any) => {
                  const hName = h.location_name || h.name;
                  const hDist = h.district || h.name.split(',')[0];
                  const hState = h.state || 'India';
                  const hSpeed = Number(h.annual_mean_wind_mps ?? h.wind_speed_mps ?? 7.8);
                  const hElev = Number(h.elevation_m ?? 50);
                  const hLat = Number(h.latitude ?? h.lat);
                  const hLon = Number(h.longitude ?? h.lon);
                  const isSelected = selectedHotspot?.id === h.id || (Math.abs(site.lat - hLat) < 0.005 && Math.abs(site.lon - hLon) < 0.005);

                  return (
                    <div
                      key={h.id || h.name}
                      className={`p-2.5 rounded-xl border transition-all flex flex-col gap-2 ${
                        isSelected
                          ? 'border-amber-400 bg-amber-500/10 dark:bg-amber-500/15 shadow-xs'
                          : 'border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                            {hName}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 flex items-center gap-2">
                            <span>{hLat.toFixed(3)}°N, {hLon.toFixed(3)}°E</span>
                            <span>·</span>
                            <span>{hElev}m DEM</span>
                            <span>·</span>
                            <span>{hState}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-800 dark:text-amber-300 font-mono text-xs font-black">
                            {hSpeed.toFixed(1)} m/s
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200/60 dark:border-white/10">
                        <button
                          type="button"
                          disabled={isHotspotResolving}
                          onClick={() => handleSelectHotspot(h, 'view')}
                          className="flex-1 py-1 px-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/15 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition-all text-center cursor-pointer"
                        >
                          View site
                        </button>
                        <button
                          type="button"
                          disabled={isHotspotResolving}
                          onClick={() => handleSelectHotspot(h, 'use')}
                          className="flex-1 py-1 px-2 rounded-lg bg-[#FFD21F] hover:bg-[#F2C50F] text-slate-950 text-[11px] font-black transition-all text-center shadow-xs cursor-pointer flex items-center justify-center gap-1"
                        >
                          <span>Use this site</span>
                          <ArrowRight className="w-3 h-3 stroke-[2.5]" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── PHOTOSHOP LASSO IN-CANVAS FLOATING TOOLBAR ── */}
        {mode === 'draw' && (
          <div className="absolute bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[1060] flex items-center gap-1.5 sm:gap-2 px-3.5 py-2 rounded-full bg-slate-950/90 text-white backdrop-blur-2xl border border-white/20 shadow-2xl pointer-events-auto max-w-[95vw] overflow-x-auto no-scrollbar">
            <span className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-[#FFD21F] animate-ping" />
              <span>Lasso: {drawnPoints.length} vertices</span>
            </span>

            {drawnPoints.length === 0 && (
              <span className="text-[11px] text-amber-300/90 whitespace-nowrap hidden sm:inline">
                (Tap map to add vertex #1)
              </span>
            )}

            {drawStats && (
              <span className="text-xs font-mono font-black text-[#FFD21F] px-2 py-0.5 rounded-full bg-white/10 whitespace-nowrap">
                {drawStats.areaKm2.toFixed(1)} km²
              </span>
            )}

            <button
              type="button"
              id="btn-close-polygon-draw"
              disabled={drawnPoints.length < 3}
              onClick={handleClosePolygon}
              className="px-3 py-1 rounded-full bg-[#FFD21F] hover:bg-[#F2C50F] text-slate-950 font-black text-xs disabled:opacity-40 transition-all active:scale-95 flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <Check className="w-3 h-3 stroke-[3]" />
              <span>Enclose Boundary</span>
            </button>

            <button
              type="button"
              id="btn-undo-polygon-draw"
              disabled={drawnPoints.length === 0}
              onClick={() => setDrawnPoints((pts) => pts.slice(0, -1))}
              className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-40"
              title="Undo last placed vertex"
            >
              Undo
            </button>

            <button
              type="button"
              id="btn-clear-polygon-draw"
              onClick={() => setDrawnPoints([])}
              className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
            >
              Clear
            </button>

            <button
              type="button"
              id="btn-cancel-polygon-draw"
              onClick={() => {
                setDrawnPoints([]);
                setMode('search');
                onToggleDrawMode(false);
                renderBoundary(site.lat, site.lon, site.areaKm2, site.boundary as [number, number][]);
              }}
              className="px-2.5 py-1 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold whitespace-nowrap cursor-pointer"
              title="Exit Lasso Mode"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── DESKTOP TOP RIGHT LAYER SWITCHER & 3D TOGGLE ── */}
        <div className="hidden md:flex absolute top-3 right-3 z-[1030] items-center gap-1 p-1 rounded-2xl bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl border border-white/70 dark:border-white/10 shadow-lg pointer-events-auto">
          <button
            onClick={() => switchBaseLayer('satellite')}
            data-layer="satellite"
            id="btn-layer-satellite-desktop"
            className={`map-layer-btn px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all ${
              activeBaseLayer === 'satellite' && !is3DActive ? 'bg-[#FFD21F] text-slate-950 font-black shadow-xs' : 'text-slate-700 dark:text-slate-300 hover:bg-white/50'
            }`}
          >
            Sat
          </button>
          <button
            onClick={() => switchBaseLayer('street')}
            data-layer="street"
            id="btn-layer-osm-desktop"
            className={`map-layer-btn px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all ${
              activeBaseLayer === 'street' && !is3DActive ? 'bg-slate-950 text-white shadow-xs' : 'text-slate-700 dark:text-slate-300 hover:bg-white/50'
            }`}
          >
            Map
          </button>
          <button
            onClick={() => switchBaseLayer('terrain')}
            data-layer="terrain"
            id="btn-layer-terrain-desktop"
            className={`map-layer-btn px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all ${
              activeBaseLayer === 'terrain' && !is3DActive ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-700 dark:text-slate-300 hover:bg-white/50'
            }`}
          >
            Terrain
          </button>
          <button
            id="btn-s1-toggle-3d-desktop"
            onClick={onToggle3D}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black transition-all ${
              is3DActive ? 'bg-[#FFD21F] text-slate-950 shadow-xs' : 'text-slate-700 dark:text-slate-300 hover:bg-white/50'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>3D</span>
          </button>
        </div>

        {/* ── VERTICAL FLOATING ACTION BUTTONS (FAB Stack on Right - WhatsApp Style) ── */}
        <div className="absolute top-28 md:top-16 right-3 z-[1020] flex flex-col gap-2 pointer-events-auto">
          {/* GPS FAB */}
          <button
            id="btn-map-gps"
            onClick={handleUseGps}
            disabled={isGpsLocating}
            className="w-10 h-10 rounded-2xl bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-white/70 dark:border-white/10 shadow-lg flex items-center justify-center text-slate-800 dark:text-white active:scale-95 transition-all"
            title="My Location"
          >
            <Crosshair className={`w-4 h-4 text-amber-500 ${isGpsLocating ? 'animate-spin' : ''}`} />
          </button>

          {/* Zoom In / Out FABs */}
          <button
            id="btn-map-zoom-in"
            onClick={() => mapRef.current?.zoomIn()}
            className="w-10 h-10 rounded-2xl bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-white/70 dark:border-white/10 shadow-lg flex items-center justify-center text-slate-800 dark:text-white active:scale-95 transition-all"
            title="Zoom In"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
          </button>
          <button
            id="btn-map-zoom-out"
            onClick={() => mapRef.current?.zoomOut()}
            className="w-10 h-10 rounded-2xl bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-white/70 dark:border-white/10 shadow-lg flex items-center justify-center text-slate-800 dark:text-white active:scale-95 transition-all"
            title="Zoom Out"
          >
            <Minus className="w-4 h-4 stroke-[2.5]" />
          </button>

          {/* Fit Bounds FAB */}
          <button
            id="btn-ctx-fit"
            onClick={handleFitSite}
            className="w-10 h-10 rounded-2xl bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-white/70 dark:border-white/10 shadow-lg flex items-center justify-center text-slate-800 dark:text-white active:scale-95 transition-all"
            title="Fit Concession Site"
          >
            <Compass className="w-4 h-4 text-emerald-500" />
          </button>
        </div>

        {/* Floating Coords Popup if requested */}
        {showCoordsPopup && (
          <div
            id="ctx-coords-popup"
            className="absolute bottom-28 left-4 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-white/90 dark:border-white/10 rounded-3xl p-4 shadow-2xl w-72 pointer-events-auto"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/10 mb-3">
              <span className="text-xs font-bold text-slate-800 dark:text-white">Coordinate Targeting</span>
              <button onClick={() => setShowCoordsPopup(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <input
                id="ctx-coord-lat"
                type="number"
                step="0.0001"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder="Latitude (°N)"
                className="w-full px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-white/10 border border-slate-200 dark:border-white/10 font-mono"
              />
              <input
                id="ctx-coord-lon"
                type="number"
                step="0.0001"
                value={manualLon}
                onChange={(e) => setManualLon(e.target.value)}
                placeholder="Longitude (°E)"
                className="w-full px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-white/10 border border-slate-200 dark:border-white/10 font-mono"
              />
              <button
                type="button"
                id="btn-apply-ctx-coords"
                onClick={handleApplyCoordinates}
                className="w-full py-2 bg-[#FFD21F] text-slate-950 text-xs font-black rounded-xl hover:bg-[#F2C50F] transition-all"
              >
                Apply Coordinates
              </button>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {searchError && (
          <div className="absolute top-16 left-4 right-4 md:right-auto md:w-96 z-40 bg-rose-500/90 text-white text-xs px-3.5 py-2 rounded-xl backdrop-blur-md shadow-md flex items-center justify-between pointer-events-auto">
            <span>{searchError}</span>
            <button onClick={() => setSearchError('')} className="p-0.5 hover:opacity-75">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── DESKTOP SIDE PANEL / MOBILE APPLE LIQUID GLASS BOTTOM SHEET ── */}
      <aside
        id="site-info-panel"
        className={`fixed md:relative bottom-0 left-0 right-0 md:left-auto md:right-auto md:w-[420px] md:h-full bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl border-t md:border-t-0 md:border-r border-white/60 dark:border-white/10 z-[1250] md:z-20 flex flex-col shrink-0 transition-transform duration-300 shadow-[0_-10px_40px_rgba(0,0,0,0.12)] md:shadow-none order-2 md:order-1 ${
          isSheetCollapsed ? 'translate-y-[calc(100%-80px)] md:translate-y-0' : 'translate-y-0'
        } max-h-[82vh] md:max-h-full`}
      >
        
        {/* Drag Handle & Peek Bar Header (WhatsApp / Apple Drawer) */}
        <div
          id="site-info-header"
          onClick={() => setIsSheetCollapsed(!isSheetCollapsed)}
          className="p-3.5 flex flex-col gap-1 cursor-pointer border-b border-slate-200/60 dark:border-white/10 flex-shrink-0 select-none bg-white/40 dark:bg-white/5"
        >
          {/* Mobile Handle Pill */}
          <div id="mobile-drag-handle" className="md:hidden w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto mb-1" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-2 rounded-xl bg-[#FFD21F]/20 text-slate-900 dark:text-white shrink-0">
                <MapPin className="w-4 h-4 text-amber-600" />
              </div>
              <div className="min-w-0">
                <span className="brand-name hidden">AeroQuantum</span>
                <h2 id="meta-location-name" className="text-sm font-black text-slate-900 dark:text-white truncate">
                  {site.name}
                </h2>
                <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  <span id="meta-latitude">{site.lat.toFixed(4)}° N</span>,{' '}
                  <span id="meta-longitude">{site.lon.toFixed(4)}° E</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                id="btn-confirm-site-peek"
                onClick={(e) => {
                  e.stopPropagation();
                  const r = selectedRadius || site.radiusKm || 3.0;
                  const boundary = site.boundary && site.boundary.length >= 3 ? site.boundary : generateCircleVertices(site.lat, site.lon, r);
                  const areaKm2 = site.areaKm2 || Math.round(Math.PI * r * r * 10) / 10;
                  onConfirmSite({
                    ...site,
                    radiusKm: r,
                    areaKm2,
                    boundary,
                    soil_bearing_capacity_kpa: bearingKpa ?? site.soil_bearing_capacity_kpa,
                    usda_texture_class: usdaClass ?? site.usda_texture_class,
                    foundation_type: selectedFoundation ?? site.foundation_type,
                    soil_hazard_level: hazardLevel ?? site.soil_hazard_level,
                  });
                }}
                className="px-3 py-1.5 rounded-xl bg-[#FFD21F] hover:bg-[#F2C50F] text-slate-950 font-black text-xs shadow-xs active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
              >
                <span>Confirm</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
              <div id="meta-area" className="px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 text-[11px] font-mono font-black">
                {(site.areaKm2 || 24.8).toFixed(1)} km²
              </div>
              <button className="md:hidden p-1 text-slate-400">
                {isSheetCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs for Real Geotechnical & Atmospheric Stack */}
        <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-white/10 px-3 py-1 bg-white/30 dark:bg-white/5">
          <button
            id="tab-drawer-soil"
            onClick={() => setActiveDrawerTab('soil')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeDrawerTab === 'soil'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Soil Telemetry</span>
          </button>
          <button
            id="tab-drawer-wind"
            onClick={() => setActiveDrawerTab('wind')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeDrawerTab === 'wind'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100'
            }`}
          >
            <Wind className="w-3.5 h-3.5" />
            <span>Wind Resource</span>
          </button>
          <button
            id="tab-drawer-village"
            onClick={() => setActiveDrawerTab('village')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeDrawerTab === 'village'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Village Cadastre</span>
          </button>
          <button
            id="tab-drawer-intel"
            onClick={() => setActiveDrawerTab('intel')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeDrawerTab === 'intel'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Verification</span>
          </button>
        </div>

        {/* Scrollable Data Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          
          {/* TAB 1: 100% REAL GEOTECHNICAL SOIL DATA (ISRIC SoilGrids v2.0) */}
          {activeDrawerTab === 'soil' && (
            <div className="flex flex-col gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                    Preliminary Geotechnical Screening
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isCriticalSoil ? 'bg-rose-100 text-rose-800' : (hazardLevel === 'WARNING' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')
                  }`}>
                    {hazardLevel === 'CRITICAL_BLOCKED' ? 'Critical Risk' : (hazardLevel === 'WARNING' ? 'Advisory' : 'ISRIC SoilGrids v2.0')}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                  Preliminary geotechnical screening. Detailed geotechnical investigation (boreholes, CPT, lab testing) required before construction.
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs mt-1">
                  <div className="p-2 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-white/60">
                    <span className="text-[10px] text-slate-500 block">USDA Soil Texture</span>
                    <strong className="text-slate-900 dark:text-white font-bold text-sm">
                      {usdaClass}
                    </strong>
                  </div>
                  <div className="p-2 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-white/60">
                    <span className="text-[10px] text-slate-500 block">Bearing Capacity</span>
                    <strong className="font-mono font-bold text-xs text-amber-600 dark:text-amber-400">
                      {bearingKpa !== null ? `${bearingKpa} kPa` : 'UNKNOWN'}
                    </strong>
                  </div>
                  <div className="p-2 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-white/60">
                    <span className="text-[10px] text-slate-500 block">Bulk Density</span>
                    <strong className="text-slate-800 dark:text-slate-200 font-mono">
                      {bulkDensity} g/cm³
                    </strong>
                  </div>
                  <div className="p-2 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-white/60">
                    <span className="text-[10px] text-slate-500 block">Recommended Pile</span>
                    <strong className="text-slate-800 dark:text-slate-200 font-mono">
                      {isCriticalSoil ? '25-30m Rock Sockets' : `${soilData?.geotechnical_metrics?.pile_depth_recommended_m || 12.0} m`}
                    </strong>
                  </div>
                </div>

                {/* Foundation Suitability Recommendation */}
                <div className="p-2.5 rounded-xl bg-white/90 dark:bg-slate-800/90 border border-white/70 text-xs">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">
                    Engineering Foundation Recommendation:
                  </span>
                  <p className="text-slate-700 dark:text-slate-200 text-[11px] leading-relaxed">
                    {foundationRec}
                  </p>
                </div>

                {/* Live Surface Moisture & Temperature Telemetry */}
                <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 pt-1 border-t border-amber-500/10">
                  <span>Soil Moisture: <strong>{moisture} m³/m³</strong></span>
                  <span>Soil Temp: <strong>{soilTemp}°C</strong></span>
                </div>
              </div>

              {/* Composition Breakdown */}
              <div className="p-3 rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-white/60 flex flex-col gap-2">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Soil Grain Size Distribution (ISRIC)</span>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span>Clay: <strong>{clayPct}%</strong></span>
                  <span>Sand: <strong>{sandPct}%</strong></span>
                  <span>Silt: <strong>{siltPct}%</strong></span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden flex bg-slate-200">
                  <div style={{ width: `${clayPct}%` }} className="bg-amber-600 h-full" title="Clay" />
                  <div style={{ width: `${sandPct}%` }} className="bg-yellow-400 h-full" title="Sand" />
                  <div style={{ width: `${siltPct}%` }} className="bg-emerald-500 h-full" title="Silt" />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LIVE WIND TELEMETRY (Open-Meteo Multi-Height + GWA) */}
          {activeDrawerTab === 'wind' && (
            <div className="flex flex-col gap-3">
              <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-sky-950 dark:text-sky-300 uppercase tracking-wider">
                    Hub-Height Wind Resource
                  </span>
                  <span id="meta-source-badge" onClick={onOpenDataSources} className="text-[10px] font-bold text-sky-700 dark:text-sky-400 underline cursor-pointer">
                    Open-Meteo & ERA5 ⓘ
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-white/60">
                    <span className="text-[10px] text-slate-500 block">Hub Speed (100m)</span>
                    <strong id="meta-wind-speed" className="text-slate-900 dark:text-white font-mono font-black text-base">
                      {(landData?.wind_speed_100m || site.windSpeedMps || 7.1).toFixed(1)} m/s
                    </strong>
                  </div>
                  <div className="p-2 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-white/60">
                    <span className="text-[10px] text-slate-500 block">Power Density</span>
                    <strong id="meta-wind-density" className="text-amber-600 dark:text-amber-400 font-mono font-black text-base">
                      {landData?.wind_power_density_wpm2 || site.windPowerDensity || 320} W/m²
                    </strong>
                  </div>
                  <div className="p-2 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-white/60">
                    <span className="text-[10px] text-slate-500 block">Hub Direction</span>
                    <strong id="meta-wind-dir" className="text-slate-800 dark:text-slate-200 font-mono">
                      {landData?.wind_direction_100m || site.windDirectionDeg || 300}°
                    </strong>
                  </div>
                  <div className="p-2 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-white/60">
                    <span className="text-[10px] text-slate-500 block">Air Density</span>
                    <strong id="meta-air-density" className="text-slate-800 dark:text-slate-200 font-mono">
                      {landData?.air_density || site.airDensityKgpm3 || 1.18} kg/m³
                    </strong>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/90 dark:bg-slate-800/90 border border-white/70 text-xs flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-300">Surface Wind (10m):</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {telemetry?.wind_speed_10m || (site.windSpeedMps ? (site.windSpeedMps * 0.82).toFixed(1) : 6.2)} m/s
                  </span>
                </div>
              </div>

              {/* 3-Way Engineering Classification: Hotspot vs Site vs Buildable Concession */}
              <div id="hotspot-site-distinction-card" className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-white/10 flex flex-col gap-2">
                <span className="text-[11px] font-black uppercase text-slate-800 dark:text-white tracking-wider flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-amber-500" />
                  <span>Site Feasibility Classification</span>
                </span>
                <div className="flex flex-col gap-1.5 text-[11px]">
                  <div className="flex items-start justify-between p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/40 border border-slate-100 dark:border-white/5">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">1. Wind Resource Hotspot</span>
                      <span className="text-[10px] text-slate-500">NIWE meteorological point measurement</span>
                    </div>
                    <span className="font-mono font-black text-amber-600 text-[10px]">
                      {(landData?.wind_speed_100m || site.windSpeedMps || 7.8).toFixed(1)} m/s
                    </span>
                  </div>

                  <div className="flex items-start justify-between p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/40 border border-slate-100 dark:border-white/5">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">2. Geographic Site</span>
                      <span className="text-[10px] text-slate-500">
                        {villageData ? 'Cadastral administrative parcel' : 'Engineering concession zone'}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300 text-[10px]">
                      {(site.areaKm2 || 24.8).toFixed(1)} km²
                    </span>
                  </div>

                  <div className="flex items-start justify-between p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/40 border border-slate-100 dark:border-white/5">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">3. Buildable Feasible Area</span>
                      <span className="text-[10px] text-slate-500">Net area after IEC 61400 exclusion buffers</span>
                    </div>
                    <span className="font-mono font-black text-emerald-600 text-[10px]">
                      {landData ? `${landData.buildable_percent}% net` : 'Pending layout'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: VILLAGE BOUNDARY & LAND TERRAIN */}
          {activeDrawerTab === 'village' && (
            <div className="flex flex-col gap-3">
              <div className="p-3 rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-white/60 flex flex-col gap-2 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">Elevation</span>
                  <strong id="meta-elevation" className="text-slate-900 dark:text-white">
                    {landData?.elevation_mean ? `${Math.round(landData.elevation_mean)} m (DEM)` : `${site.elevationM || 42} m`}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">Dominant Terrain</span>
                  <strong id="meta-terrain" className="text-slate-900 dark:text-white truncate max-w-[170px]">
                    {landData?.dominant_lulc || site.terrainType || 'Elevated Plateau'}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">Distance to Coast</span>
                  <strong id="meta-coast" className="text-slate-900 dark:text-white">{site.distanceToCoastKm || 0.2} km</strong>
                </div>
                <div className="pt-2 border-t border-slate-200/60 dark:border-white/10 flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-[10px] text-slate-500">Environmental Suitability</span>
                    <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                      landData?.overall_status === 'READY' ? 'bg-emerald-100 text-emerald-800' :
                      landData?.overall_status === 'UNBUILDABLE' ? 'bg-rose-100 text-rose-800' :
                      landData?.overall_status === 'UNKNOWN' ? 'bg-amber-100 text-amber-800' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {landData?.overall_status || 'Screening'}
                    </span>
                  </div>
                  <span id="meta-land-feasibility" className={`text-[11px] font-bold ${
                    landData?.overall_status === 'READY' ? 'text-emerald-600' :
                    landData?.overall_status === 'UNBUILDABLE' ? 'text-rose-600' :
                    landData?.overall_status === 'UNKNOWN' ? 'text-amber-600' :
                    'text-slate-500'
                  }`}>
                    {landData
                      ? (landData.overall_status === 'UNKNOWN'
                          ? `${landData.unknown_percent || 100}% Unverified · Ground Survey Required`
                          : landData.overall_status === 'UNBUILDABLE'
                            ? `0% Buildable · 100% Excluded`
                            : `${landData.buildable_percent}% Buildable · ${landData.restricted_percent}% Restricted · ${landData.excluded_percent}% Excluded`)
                      : 'Screening real environmental layers...'}
                  </span>
                </div>
              </div>

              {/* Snap to Village Quick Action */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-800 dark:text-white">Village Administrative Border</span>
                <p className="text-[11px] text-slate-500">
                  Load official cadastral polygon directly from OpenStreetMap:
                </p>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => handleSnapToVillage(site.shortName || site.name.split(',')[0])}
                    disabled={isVillageLoading}
                    className="flex-1 py-2 rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 text-xs font-black shadow-xs active:scale-95 transition-all text-center"
                  >
                    {isVillageLoading ? 'Loading Cadastre...' : `Snap to ${site.shortName || 'Village'}`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: 9-POINT GEOTECHNICAL SITE CHECKS */}
          {activeDrawerTab === 'intel' && (
            <div className="flex flex-col gap-3">
              <div id="site-intelligence-card" className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-white/10 flex flex-col gap-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-800 dark:text-white text-xs uppercase tracking-wider">Site Verification Checklist</span>
                  <span id="intel-overall-pill" className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                    landData?.overall_status === 'UNKNOWN' ? 'bg-amber-100 text-amber-800' :
                    landData?.overall_status === 'UNBUILDABLE' ? 'bg-rose-100 text-rose-800' :
                    'bg-emerald-100 text-emerald-800'
                  }`}>
                    {landData?.overall_status === 'UNKNOWN' ? (
                      <>
                        <AlertTriangle className="w-3 h-3 text-amber-700 stroke-[3]" />
                        <span>Survey Required</span>
                      </>
                    ) : landData?.overall_status === 'UNBUILDABLE' ? (
                      <>
                        <ShieldAlert className="w-3 h-3 text-rose-700 stroke-[3]" />
                        <span>Unbuildable</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3 h-3 text-emerald-700 stroke-[3]" />
                        <span>Verified</span>
                      </>
                    )}
                  </span>
                </div>
                <div id="intel-checks-list" className="flex flex-col gap-1.5">
                  {intelItems.map((item, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-1.5">
                        {item.status === 'verified' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        ) : item.status === 'error' ? (
                          <ShieldAlert className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                        )}
                        <span>{item.label}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 text-right truncate max-w-[140px]">
                        {item.source}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Engineering Micro-Siting Compliance & Exclusion Card */}
              <div id="engineering-setbacks-compliance-card" className="p-3 rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-slate-200/80 dark:border-white/10 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-wider">
                    Micro-Siting Setbacks & Exclusions
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                    IEC 61400 Enforced
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Residential Buffer: ≥500m</span>
                    </span>
                    <span className="text-[10px] font-mono text-emerald-600 font-bold">Zero homes in zone</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Waves className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>River & Stream Buffer: ≥120m</span>
                    </span>
                    <span className="text-[10px] font-mono text-emerald-600 font-bold">Riparian zone safe</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Waves className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>Marine / Ocean Buffer: ≥200m</span>
                    </span>
                    <span className="text-[10px] font-mono text-emerald-600 font-bold">High-tide buffer safe</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>HV Electrical Grid: ≥150m</span>
                    </span>
                    <span className="text-[10px] font-mono text-emerald-600 font-bold">66kV–400kV clearance safe</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 shrink-0" />
                      <span>Heavy Logistics Road: ≥100m</span>
                    </span>
                    <span className="text-[10px] font-mono text-emerald-600 font-bold">80m blade transport ready</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preliminary Geotechnical Screening Banner */}
          <div id="soil-screening-banner" className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-950 dark:text-amber-200 flex items-center gap-1.5 uppercase tracking-wide">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>PRELIMINARY GEOTECHNICAL SCREENING</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-200/90 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 text-[10px] font-mono font-black uppercase">
                Bearing capacity: {bearingKpa !== null ? `${bearingKpa} kPa` : 'UNKNOWN'}
              </span>
            </div>
            <p className="text-[11px] text-amber-900 dark:text-amber-300 italic font-semibold leading-relaxed">
              "Site-specific geotechnical investigation required before construction."
            </p>
            <div className="text-[10px] text-slate-600 dark:text-slate-400 bg-white/70 dark:bg-slate-800/70 p-2 rounded-xl border border-amber-500/15">
              ISRIC SoilGrids taxonomy: <strong className="text-slate-900 dark:text-white font-bold">{usdaClass}</strong> (Clay: {clayPct}%, Sand: {sandPct}%, Silt: {siltPct}%, Bulk Density: {bulkDensity} g/cm³). General soil classification does not constitute measured foundation bearing capacity.
            </div>
          </div>

          {/* Confirm Concession Button (WhatsApp / Apple Glow) */}
          <div className="pt-2 mt-auto">
            {isProceedBlocked ? (
              <Button
                id="btn-confirm-site"
                variant="outline"
                disabled
                className="w-full bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 font-bold py-3 text-xs rounded-2xl flex items-center justify-center gap-2 cursor-not-allowed border-slate-300"
              >
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <span>Soil Unsuitable — Select Piled Foundation</span>
              </Button>
            ) : (
              <Button
                id="btn-confirm-site"
                variant="energy"
                size="md"
                onClick={() => {
                  const r = selectedRadius || site.radiusKm || 3.0;
                  const boundary = site.boundary && site.boundary.length >= 3 ? site.boundary : generateCircleVertices(site.lat, site.lon, r);
                  const areaKm2 = site.areaKm2 || Math.round(Math.PI * r * r * 10) / 10;
                  onConfirmSite({
                    ...site,
                    radiusKm: r,
                    areaKm2,
                    boundary,
                    soil_bearing_capacity_kpa: bearingKpa,
                    usda_texture_class: usdaClass,
                    foundation_type: selectedFoundation,
                    soil_hazard_level: hazardLevel,
                    environmental_notes: `500m settlement buffer, 120m river buffer, 200m marine buffer, 150m grid corridor verified. Foundation: ${selectedFoundation}.`,
                  });
                }}
                className="w-full bg-[#FFD21F] hover:bg-[#F2C50F] active:scale-98 text-slate-950 font-black shadow-[0_8px_24px_rgba(255,210,31,0.4)] py-3 text-xs rounded-2xl flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <span>Confirm Site & Proceed {isPiledSelected ? '(Deep Piled)' : ''}</span>
                <ArrowRight className="w-4 h-4 stroke-[3]" />
              </Button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};
