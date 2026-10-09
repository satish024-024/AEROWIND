export type WorkflowScreen = 
  | 'home'
  | 'dashboard'
  | 's1_site'
  | 's2_config'
  | 's3_analysis'
  | 's4_optimize'
  | 's5_inspect'
  | 's6_blueprint';

export type ProjectStatus = 'draft' | 'configured' | 'analyzing' | 'simulated' | 'optimized' | 'blueprint_ready';

export interface ProjectSummary {
  id: string;
  name: string;
  location_name: string;
  latitude: number;
  longitude: number;
  area_km2?: number;
  turbine_count: number;
  turbine_model: string;
  suitability?: string;
  soil_bearing_capacity_kpa?: number;
  usda_texture_class?: string;
  foundation_type?: string;
  soil_hazard_level?: string;
  environmental_notes?: string | string[];
  net_aep?: number;
  wake_loss_percent?: number;
  status: string;
  updated_at: string;
  thumbnail_url?: string;
}

export const isDraftProject = (p: ProjectSummary): boolean => {
  const norm = (p.status || '').toLowerCase().trim();
  // Completed, optimized, or blueprint ready wind farms are not drafts
  if (
    norm.includes('opt') ||
    norm.includes('done') ||
    norm.includes('blue') ||
    norm.includes('ready')
  ) {
    return false;
  }
  // Any preliminary, unfinalized, configured, or explicitly draft project is a draft
  return true;
};

export interface ProjectDetail extends ProjectSummary {
  rotor_diameter: number;
  hub_height: number;
  spacing_d: number;
  wind_speed: number;
  wind_direction: number;
  gross_aep?: number;
  turbines: Turbine[];
  boundary: number[][]; // [lat, lon][]
  created_at: string;
}

export interface Turbine {
  id: string;
  label?: string;
  displayLabel?: string;
  lat: number;
  lon: number;
  x_m?: number;
  y_m?: number;
  elevation_m?: number;
  effective_mps?: number;
  wake_deficit_pct?: number;
  power_kw?: number;
  is_conflicted?: boolean;
  conflict_desc?: string | null;
}

export interface SoilTelemetry {
  usda_texture_class?: string;
  clay_percentage?: number;
  sand_percentage?: number;
  silt_percentage?: number;
  bulk_density_kg_dm3?: number;
  estimated_bearing_capacity_kpa?: number;
  measured_bearing_capacity_kpa?: number;
  bearing_status?: string;
  foundation_recommendation?: string;
  foundation_type_required?: string;
  is_suitable_standard_foundation?: boolean;
  is_suitable_piled_foundation?: boolean;
  is_suitable_for_turbines?: boolean;
  hazard_level?: 'SAFE' | 'WARNING' | 'CRITICAL_BLOCKED';
  hazard_title?: string;
  hazard_details?: string[];
  live_soil_moisture_m3_m3?: number;
  live_soil_temperature_c?: number;
  drainage_status?: string;
  geotechnical_metrics?: {
    bearing_capacity_kpa?: number;
    hazard_level?: string;
    hazard_title?: string;
    hazard_details?: string[];
    foundation_recommendation?: string;
    foundation_suitability?: string;
    pile_depth_recommended_m?: number;
  };
  soil_classification?: {
    usda_texture_class?: string;
    clay_pct?: number;
    sand_pct?: number;
    silt_pct?: number;
    bulk_density_g_cm3?: number;
  };
  live_telemetry?: {
    soil_moisture_0_to_1cm_m3pm3?: number;
    soil_temperature_0cm_c?: number;
  };
}

export interface SiteInfo {
  name: string;
  shortName: string;
  lat: number;
  lon: number;
  areaKm2: number;
  radiusKm?: number;
  perimeterKm?: number;
  elevationM: number;
  terrainType: string;
  distanceToCoastKm?: number;
  landUse?: string;
  windSpeedMps: number;
  windPowerDensity?: number;
  windDirectionDeg?: number;
  airDensityKgpm3?: number;
  pressureHpa?: number;
  temperatureC?: number;
  boundary?: number[][];
  soilData?: SoilTelemetry;
  foundationType?: string;
  foundation_type?: string;
  soil_bearing_capacity_kpa?: number;
  usda_texture_class?: string;
  soil_hazard_level?: string;
  environmental_notes?: string;
  environmentalNotes?: string[];
  feasibilityStats?: {
    count_preferred?: number;
    count_buildable?: number;
    count_excluded?: number;
    count_unknown?: number;
  };
}

export interface FarmConfig {
  turbineCount: number;
  model: string;
  modelName: string;
  rotorDiameter: number;
  hubHeight: number;
  ratedPowerKw: number;
  windDirectionDeg: number;
  spacingMultiplierD: number;
  wakeDecay: number;
  quboLambda: number;
  gridResolution: number;
  foundationType?: string;
}

export interface FeasibilityMask {
  preferred: number;
  buildable: number;
  restricted: number;
  excluded: number;
  unknown: number;
  reasons: string[];
}

export interface LayoutAnalysisData {
  turbines: Turbine[];
  candidates?: any[];
  candidate_positions?: any[];
  feasible_count?: number;
  requested_count?: number;
  gross_aep_gwh: number;
  net_aep_gwh: number;
  wake_loss_percent: number;
  min_spacing_m: number;
  conflicts_count: number;
  wake_conflicts_count?: number;
  wind_speed_mps: number;
  wind_direction_deg: number;
  wind_direction_label?: string;
  feasibility_mask?: FeasibilityMask;
  site_unsuitable?: boolean;
  status_headline?: string;
  status_description?: string;
  pipeline_stats?: any;
  residential_screening?: string;
  main_exclusion_reason?: string;
  dominant_constraints?: string[];
  overpass_telemetry?: {
    latitude: number;
    longitude: number;
    duration_seconds: number;
    buildings: number;
    powerlines: number;
    highways: number;
    waterways: number;
    total_features: number;
    source: string;
  };
  boundary?: [number, number][] | number[][];
}

export type OptimizationEngineType = 'classical' | 'aer_qaoa' | 'ibm_quantum';

export interface OptimizationData {
  problem_name: string;
  variables_count: number;
  qubits_count: number;
  iterations_total: number;
  current_iteration: number;
  initial_aep_gwh: number;
  best_aep_gwh: number;
  initial_wake_loss_pct: number;
  best_wake_loss_pct: number;
  improvement_pct: number;
  turbine_count_target: number;
  turbine_count_actual: number;
  minimum_spacing_required_m: number;
  minimum_spacing_actual_m: number;
  optimized_turbines: Turbine[];
  status_headline: string;
  status_description: string;
  blueprint_url?: string;
  history?: Array<{
    iteration: number;
    aep: number;
    wake_loss: number;
    best_aep: number;
  }>;
  optimality_scope?: string;
  declared_engineering_optimum?: any;
  physical_reevaluation?: any;
  qubo_problem?: any;
  candidate_positions?: any[];
  initial_turbines?: Turbine[];
  turbine_model?: string;
  rotor_diameter_m?: number;
  hub_height_m?: number;
  rated_power_kw?: number;
  exact_net_cf_pct?: number;
  installed_capacity_mw?: number;
  exact_net_aep_gwh?: number;
  gross_aep_gwh?: number;
  exact_wake_loss_pct?: number;
  selected_candidate_ids?: string[];
  pipeline_provenance?: any;
  hardware_execution?: any;
  solver_mode?: OptimizationEngineType;
  solver_label?: string;
  provenance?: {
    solver?: string;
    quantum_layer?: string;
    physical_layer?: string;
    loss_accounting?: string;
    source_status?: string;
    engineering_suitability?: string;
  };
}

export interface TelemetryData {
  temperature_c: number;
  wind_speed_10m: number;
  wind_speed_80m: number;
  wind_speed_120m: number;
  wind_direction_deg: number;
  pressure_hpa: number;
  humidity_pct: number;
  condition: string;
  timestamp: string;
  elevation_m?: number;
  distance_to_coast_km?: number;
  terrain_type?: string;
  land_use?: string;
  wind_power_density?: number;
  air_density?: number;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  token?: string;
}
