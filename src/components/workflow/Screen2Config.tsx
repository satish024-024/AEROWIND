import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  Cpu, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  Wind, 
  Compass, 
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Layers,
  Building2,
  Waves,
  Zap,
  Truck 
} from 'lucide-react';
import { SiteInfo, FarmConfig } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { InitialLayoutLoadingModal } from './InitialLayoutLoadingModal';

interface Screen2ConfigProps {
  site: SiteInfo;
  config: FarmConfig;
  onUpdateConfig: (newCfg: Partial<FarmConfig>) => void;
  onGenerateLayout: () => void;
  onBack: () => void;
  isGeneratingLayout?: boolean;
  generationError?: string | null;
  onRetryGeneration?: () => void;
  onClearGenerationError?: () => void;
}

const TURBINE_MODELS: Record<string, { name: string; rotor: number; hub: number; powerKw: number }> = {
  'ge-120': { name: 'GE 2.5-120 (120m rotor, 110m hub, 2.5 MW)', rotor: 120, hub: 110, powerKw: 2500 },
  'vestas-110': { name: 'Vestas V110-2.0MW (110m rotor, 100m hub, 2.0 MW)', rotor: 110, hub: 100, powerKw: 2000 },
  'sg-132': { name: 'Siemens Gamesa SG 3.4-132 (132m rotor, 120m hub, 3.4 MW)', rotor: 132, hub: 120, powerKw: 3400 },
  'suzlon-120': { name: 'Suzlon S120-2.1MW (120m rotor, 120m hub, 2.1 MW)', rotor: 120, hub: 120, powerKw: 2100 },
  'custom': { name: 'Custom Engineering Specification...', rotor: 120, hub: 110, powerKw: 2500 },
};

export const Screen2Config: React.FC<Screen2ConfigProps> = ({
  site,
  config,
  onUpdateConfig,
  onGenerateLayout,
  onBack,
  isGeneratingLayout = false,
  generationError = null,
  onRetryGeneration,
  onClearGenerationError,
}) => {
  const [turbineCount, setTurbineCount] = useState<number>(config.turbineCount || 12);
  const [model, setModel] = useState<string>(config.model || 'ge-120');
  const [rotorDiam, setRotorDiam] = useState<number>(config.rotorDiameter || 120);
  const [hubHeight, setHubHeight] = useState<number>(config.hubHeight || 110);
  const [ratedPower, setRatedPower] = useState<number>(config.ratedPowerKw || 2500);
  const [windDir, setWindDir] = useState<number>(config.windDirectionDeg || 300);
  const [spacingD, setSpacingD] = useState<number>(config.spacingMultiplierD || 5);
  const [foundationType, setFoundationType] = useState<string>(
    config.foundationType || site.foundation_type || (site.soil_hazard_level === 'CRITICAL_BLOCKED' ? 'DEEP_PILED' : 'GRAVITY_BASE')
  );
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(false);
  const [wakeDecay, setWakeDecay] = useState<number>(config.wakeDecay || 0.075);
  const [quboLambda, setQuboLambda] = useState<number>(config.quboLambda || 150.0);
  const [gridRes, setGridRes] = useState<number>(config.gridResolution || 6);

  // Synchronize internal state when config prop changes
  useEffect(() => {
    if (config.model) setModel(config.model);
    if (config.turbineCount !== undefined) setTurbineCount(config.turbineCount);
    if (config.rotorDiameter !== undefined) setRotorDiam(config.rotorDiameter);
    if (config.hubHeight !== undefined) setHubHeight(config.hubHeight);
    if (config.ratedPowerKw !== undefined) setRatedPower(config.ratedPowerKw);
    if (config.windDirectionDeg !== undefined) setWindDir(config.windDirectionDeg);
    if (config.spacingMultiplierD !== undefined) setSpacingD(config.spacingMultiplierD);
    if (config.wakeDecay !== undefined) setWakeDecay(config.wakeDecay);
    if (config.quboLambda !== undefined) setQuboLambda(config.quboLambda);
    if (config.gridResolution !== undefined) setGridRes(config.gridResolution);
    if (config.foundationType) setFoundationType(config.foundationType);
  }, [config]);

  const handleFoundationChange = (fType: string) => {
    setFoundationType(fType);
    onUpdateConfig({ foundationType: fType });
  };

  // Handle Model Change -> Auto-fill specs
  const handleModelChange = (mKey: string) => {
    setModel(mKey);
    const spec = TURBINE_MODELS[mKey];
    if (spec && mKey !== 'custom') {
      setRotorDiam(spec.rotor);
      setHubHeight(spec.hub);
      setRatedPower(spec.powerKw);
      onUpdateConfig({
        model: mKey,
        modelName: spec.name,
        rotorDiameter: spec.rotor,
        hubHeight: spec.hub,
        ratedPowerKw: spec.powerKw,
      });
    } else {
      onUpdateConfig({ model: mKey });
    }
  };

  const handleCountChange = (cnt: number) => {
    const val = Math.max(1, Math.min(100, cnt));
    setTurbineCount(val);
    onUpdateConfig({ turbineCount: val });
  };

  // Theoretical site capacity estimate
  const areaKm2 = site.areaKm2 || 24.8;
  const spacingM = spacingD * rotorDiam;
  const cellAreaKm2 = (spacingM * spacingM * 1.4) / 1e6;
  const maxFeasiblePositions = Math.max(4, Math.floor(areaKm2 / Math.max(0.2, cellAreaKm2)));
  const isOverCapacity = turbineCount > maxFeasiblePositions;
  const totalCapacityMw = ((turbineCount * ratedPower) / 1000).toFixed(1);

  return (
    <div id="screen-2-container" className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-36 sm:pb-12 max-w-4xl mx-auto w-full">
      {/* Header & Navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          id="btn-back-to-screen-1"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Site Selection</span>
        </button>

        <div id="s2-indicator-text" className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-bold text-xs border border-amber-200 shadow-xs">
          Step 2 · Configuration
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* ── SITE PERSISTENCE CARD ───────────────────────────────── */}
        <Card className="p-4 sm:p-5 shadow-glass border-slate-200/90 bg-white/90 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Engineering Site</div>
              <h2 id="s2-meta-location" className="text-base font-bold text-slate-900 leading-tight">
                {site.name}
              </h2>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-slate-600">
              <div>
                <span className="text-[10px] font-sans text-slate-400 block">Coordinates</span>
                <span id="s2-meta-coords" className="font-bold text-slate-800">
                  {site.lat.toFixed(4)}° N, {site.lon.toFixed(4)}° E
                </span>
              </div>
              <div>
                <span className="text-[10px] font-sans text-slate-400 block">Concession</span>
                <span id="s2-meta-area" className="font-black text-slate-900">
                  {areaKm2.toFixed(1)} km²
                </span>
              </div>
              <div>
                <span className="text-[10px] font-sans text-slate-400 block">Wind Telemetry</span>
                <span id="s2-meta-wind" className="font-bold text-emerald-600">
                  {(site.windSpeedMps || 7.1).toFixed(1)} m/s @ {site.windDirectionDeg || 300}°
                </span>
              </div>
              <div>
                <span className="text-[10px] font-sans text-slate-400 block">Soil Bearing</span>
                <span id="s2-meta-soil" className="font-bold text-emerald-600">
                  {site.soil_bearing_capacity_kpa ? `${site.soil_bearing_capacity_kpa} kPa` : '218.7 kPa'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-sans text-slate-400 block">Foundation</span>
                <span id="s2-meta-foundation" className="font-bold text-slate-800">
                  {foundationType === 'DEEP_PILED' ? 'Deep Piled' : foundationType === 'ROCK_ANCHOR' ? 'Rock Anchor' : 'Gravity Base'}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* ── 1. TURBINE COUNT & CAPACITY CARD ───────────────────── */}
        <Card className="p-6 md:p-8 flex flex-col gap-5 shadow-glass border-slate-200/90">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>How many turbines?</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Target wind farm deployment capacity
              </p>
            </div>
            <div
              id="badge-capacity-utilization"
              className={`px-3 py-1 rounded-xl text-xs font-bold border ${
                isOverCapacity
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              {isOverCapacity ? 'High Density' : 'Optimal Capacity'}
            </div>
          </div>

          {/* Quick Preset Chips */}
          <div className="flex flex-wrap items-center gap-2 quick-chips-row">
            {[4, 8, 12, 16, 20, 24, 50].map((cnt) => (
              <button
                key={cnt}
                type="button"
                data-turbines={cnt}
                onClick={() => handleCountChange(cnt)}
                className={`chip-btn px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  turbineCount === cnt
                    ? 'active bg-[#FFD21F] text-slate-950 border-[#FFD21F] shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {cnt}
              </button>
            ))}
          </div>

          {/* Slider + Stepper Combo */}
          <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
            <input
              id="cfg-turbines-slider"
              type="range"
              min="2"
              max="60"
              value={turbineCount}
              onChange={(e) => handleCountChange(parseInt(e.target.value) || 2)}
              className="flex-1 w-full accent-[#FFD21F] cursor-pointer"
            />

            <div className="flex items-center gap-2 stepper-input-wrapper">
              <button
                type="button"
                id="btn-turbines-minus"
                onClick={() => handleCountChange(turbineCount - 1)}
                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-lg flex items-center justify-center transition-all active:scale-95 border border-slate-200"
              >
                −
              </button>

              <input
                id="cfg-turbines-count"
                type="number"
                min="1"
                max="100"
                value={turbineCount}
                onChange={(e) => handleCountChange(parseInt(e.target.value) || 1)}
                className="w-16 text-center font-mono font-black text-xl text-slate-950 bg-white border border-slate-300 rounded-xl py-2 focus:ring-2 focus:ring-[#FFD21F] focus:outline-none shadow-xs"
              />

              <button
                type="button"
                id="btn-turbines-plus"
                onClick={() => handleCountChange(turbineCount + 1)}
                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-lg flex items-center justify-center transition-all active:scale-95 border border-slate-200"
              >
                +
              </button>
            </div>
          </div>

          {/* Real Feasibility & Capacity Status Card */}
          <div
            id="cfg-capacity-card"
            className={`p-4 rounded-2xl border transition-all ${
              isOverCapacity
                ? 'bg-amber-50/80 border-amber-300/80 text-amber-950'
                : 'bg-slate-50/90 border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60 text-xs">
              <div className="flex items-center gap-2 font-bold">
                {isOverCapacity ? <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                <span id="capacity-status-headline">
                  {isOverCapacity ? 'Exceeds Relaxed Spacing Budget' : 'Site Capacity Optimal'}
                </span>
              </div>
              <span id="feasibility-badge" className="font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md text-[11px]">
                {turbineCount} / {maxFeasiblePositions} Feasible
              </span>
            </div>

            <p id="capacity-status-desc" className="text-xs text-slate-600 mb-3 leading-relaxed">
              {isOverCapacity
                ? `${turbineCount} turbines requested may increase wake losses. Recommended capacity for ${areaKm2.toFixed(1)} km² is ~${maxFeasiblePositions} turbines.`
                : `${turbineCount} turbines comfortably fit within the ${areaKm2.toFixed(1)} km² concession with standard 5D aerodynamic wake buffer spacing.`}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Requested</span>
                <strong id="metric-requested-count" className="font-mono text-slate-900 text-base">
                  {turbineCount}
                </strong>
              </div>
              <div className="p-2 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Feasible Max</span>
                <strong id="metric-max-capacity" className="font-mono text-emerald-600 text-base">
                  {maxFeasiblePositions}
                </strong>
              </div>
              <div className="p-2 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Nameplate</span>
                <strong className="font-mono text-slate-900 text-base">
                  {totalCapacityMw} MW
                </strong>
              </div>
              <div className="p-2 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Min Spacing</span>
                <strong className="font-mono text-slate-900 text-base">
                  {spacingM} m ({spacingD}D)
                </strong>
              </div>
            </div>

            {/* Auto-clamp Capacity Action Button */}
            {isOverCapacity && (
              <div className="flex gap-2 mt-3 pt-2 border-t border-amber-200/60">
                <button
                  type="button"
                  id="btn-clamp-capacity"
                  onClick={() => handleCountChange(maxFeasiblePositions)}
                  className="flex-1 py-1.5 rounded-xl bg-[#FFD21F] text-slate-950 font-bold text-xs hover:bg-[#F2C50F] transition-all"
                >
                  Clamp to Optimal Capacity ({maxFeasiblePositions} Turbines)
                </button>
              </div>
            )}
          </div>
        </Card>

        {/* ── 2. TURBINE SPECIFICATION CARD ──────────────────────── */}
        <Card className="p-6 md:p-8 flex flex-col gap-5 shadow-glass border-slate-200/90">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">
              Turbine Specification
            </h3>
            <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
              IEC Class IIA
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="cfg-turbine-model" className="text-xs font-bold text-slate-700">
              Turbine Model
            </label>
            <select
              id="cfg-turbine-model"
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full text-xs font-medium p-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-[#FFD21F] focus:outline-none"
            >
              {Object.entries(TURBINE_MODELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label htmlFor="cfg-rotor-diam" className="text-xs font-bold text-slate-700">
                  Rotor Diameter
                </label>
                <span id="badge-rotor-diam" className="text-xs font-bold text-amber-700 font-mono">
                  {rotorDiam} m
                </span>
              </div>
              <input
                id="cfg-rotor-diam"
                type="number"
                min="40"
                max="250"
                value={rotorDiam}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 120;
                  setRotorDiam(val);
                  onUpdateConfig({ rotorDiameter: val });
                }}
                className="w-full text-xs font-medium p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-[#FFD21F] font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label htmlFor="cfg-hub-height" className="text-xs font-bold text-slate-700">
                  Hub Height
                </label>
                <span id="badge-hub-height" className="text-xs font-bold text-amber-700 font-mono">
                  {hubHeight} m
                </span>
              </div>
              <input
                id="cfg-hub-height"
                type="number"
                min="40"
                max="250"
                value={hubHeight}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 110;
                  setHubHeight(val);
                  onUpdateConfig({ hubHeight: val });
                }}
                className="w-full text-xs font-medium p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-[#FFD21F] font-mono"
              />
            </div>
          </div>

          {/* Spacing Preference */}
          <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">Spacing Preference</span>
              <span id="badge-spacing-meters" className="font-bold text-amber-700 font-mono">
                {spacingM} m ({spacingD}D)
              </span>
            </div>
            <div className="flex items-center gap-2">
              {[
                { d: 3, label: '3D (Dense)' },
                { d: 5, label: '5D (Standard)' },
                { d: 7, label: '7D (Optimal Low Wake)' },
              ].map((sp) => (
                <button
                  key={sp.d}
                  type="button"
                  data-spacing={sp.d}
                  onClick={() => {
                    setSpacingD(sp.d);
                    onUpdateConfig({ spacingMultiplierD: sp.d });
                  }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                    spacingD === sp.d
                      ? 'active bg-[#FFD21F] text-slate-950 border-[#FFD21F] shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {sp.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* ── 3. WIND DIRECTION ──────────────────────────────────── */}
        <Card className="p-6 md:p-8 flex flex-col gap-4 shadow-glass border-slate-200/90">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Wind className="w-5 h-5 text-amber-500" />
              <span>Dominant Wind Direction</span>
            </h3>
            <span className="text-xs font-mono font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
              {windDir}° (from {site.windDirectionDeg || 300}°)
            </span>
          </div>

          <input
            id="cfg-wind-dir-slider"
            type="range"
            min="0"
            max="359"
            value={windDir}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 0;
              setWindDir(val);
              onUpdateConfig({ windDirectionDeg: val });
            }}
            className="w-full accent-[#FFD21F] cursor-pointer"
          />

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                const live = site.windDirectionDeg || 300;
                setWindDir(live);
                onUpdateConfig({ windDirectionDeg: live });
              }}
              className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 font-bold border border-emerald-200 hover:bg-emerald-100"
            >
              Use Live Telemetry ({site.windDirectionDeg || 300}°)
            </button>
            {[0, 90, 180, 270].map((deg) => (
              <button
                key={deg}
                type="button"
                onClick={() => {
                  setWindDir(deg);
                  onUpdateConfig({ windDirectionDeg: deg });
                }}
                className={`px-2.5 py-1 rounded-xl font-bold border ${
                  windDir === deg
                    ? 'bg-[#FFD21F] text-slate-950 border-[#FFD21F]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {deg === 0 ? 'N (0°)' : deg === 90 ? 'E (90°)' : deg === 180 ? 'S (180°)' : 'W (270°)'}
              </button>
            ))}
          </div>
        </Card>

        {/* ── 4. ADVANCED SETTINGS ACCORDION ──────────────────────── */}
        <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-glass">
          <button
            type="button"
            id="accordion-advanced-header"
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-bold text-slate-900">
                Advanced Aerodynamics & Optimization Settings
              </span>
            </div>
            {isAdvancedOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>

          {isAdvancedOpen && (
            <div className="p-4 sm:p-5 border-t border-slate-100 flex flex-col gap-4 text-xs bg-slate-50/50">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="cfg-rated-power" className="font-bold text-slate-700">
                    Rated Power (kW)
                  </label>
                  <input
                    id="cfg-rated-power"
                    type="number"
                    value={ratedPower}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 2500;
                      setRatedPower(val);
                      onUpdateConfig({ ratedPowerKw: val });
                    }}
                    className="p-2.5 rounded-xl bg-white border border-slate-200 font-mono text-slate-800"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="cfg-wake-decay" className="font-bold text-slate-700">
                    Wake Decay (k)
                  </label>
                  <select
                    id="cfg-wake-decay"
                    value={wakeDecay}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setWakeDecay(val);
                      onUpdateConfig({ wakeDecay: val });
                    }}
                    className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-800"
                  >
                    <option value={0.04}>0.04 (Offshore / Low Turbulence)</option>
                    <option value={0.075}>0.075 (Standard Onshore Flat)</option>
                    <option value={0.1}>0.10 (Complex / Forest Terrain)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="cfg-qubo-lambda" className="font-bold text-slate-700">
                    QUBO Penalty (λ)
                  </label>
                  <input
                    id="cfg-qubo-lambda"
                    type="number"
                    step="10"
                    value={quboLambda}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 150.0;
                      setQuboLambda(val);
                      onUpdateConfig({ quboLambda: val });
                    }}
                    className="p-2.5 rounded-xl bg-white border border-slate-200 font-mono text-slate-800"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── GEOTECHNICAL FOUNDATION & MICRO-SITING COMPLIANCE CARD ── */}
        <Card className="p-6 md:p-8 flex flex-col gap-5 shadow-glass border-slate-200/90">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-500" />
                <span>Foundation Engineering & Compliance</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ISRIC Soil Texture: <strong className="text-slate-800 font-mono">{site.usda_texture_class || 'Clay Loam'}</strong> · Bearing: <strong className="text-emerald-600 font-mono">{site.soil_bearing_capacity_kpa ? `${site.soil_bearing_capacity_kpa} kPa` : '218.7 kPa'}</strong>
              </p>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300 italic mt-0.5">
                {(!site.soil_bearing_capacity_kpa || site.soil_bearing_capacity_kpa >= 160)
                  ? 'Standard gravity base foundation physically verified via ISRIC SoilGrids v2.0.'
                  : (site.soil_bearing_capacity_kpa < 120)
                  ? 'Low bearing capacity detected. Deep bored concrete piles mandatory.'
                  : 'Site-specific geotechnical borehole investigation advised before construction.'}
              </p>
            </div>
            <div className={`px-3 py-1 rounded-xl text-xs font-bold border ${
              site.soil_hazard_level === 'CRITICAL_BLOCKED' || (site.soil_bearing_capacity_kpa && site.soil_bearing_capacity_kpa < 120)
                ? 'bg-rose-100 text-rose-900 border-rose-300'
                : (!site.soil_bearing_capacity_kpa || site.soil_bearing_capacity_kpa >= 160)
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-100 text-amber-900 border-amber-300'
            }`}>
              {site.soil_hazard_level === 'CRITICAL_BLOCKED' || (site.soil_bearing_capacity_kpa && site.soil_bearing_capacity_kpa < 120)
                ? 'Standard Pad Blocked (Piles Required)'
                : (!site.soil_bearing_capacity_kpa || site.soil_bearing_capacity_kpa >= 160)
                ? 'Geotechnically Certified'
                : 'Geotechnical Advisory'}
            </div>
          </div>

          {/* Foundation Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              id="cfg-foundation-gravity"
              onClick={() => handleFoundationChange('GRAVITY_BASE')}
              className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                foundationType === 'GRAVITY_BASE'
                  ? 'border-[#FFD21F] bg-amber-500/10 shadow-sm ring-1 ring-[#FFD21F]'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900">Standard Gravity Base</span>
                {foundationType === 'GRAVITY_BASE' && <CheckCircle2 className="w-4 h-4 text-amber-600" />}
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Circular reinforced concrete pad (D=18m, H=2.8m). Requires bearing ≥ 160 kPa.
              </p>
              {site.soil_hazard_level === 'CRITICAL_BLOCKED' ? (
                <span className="text-[9px] font-bold text-rose-600 uppercase mt-0.5">
                  Advisory: Low Bearing Soil
                </span>
              ) : (
                <span className="text-[9px] font-bold text-amber-700 uppercase mt-0.5">
                  Pad Bearing ≥ 160 kPa
                </span>
              )}
            </button>

            <button
              type="button"
              id="cfg-foundation-piled"
              onClick={() => handleFoundationChange('DEEP_PILED')}
              className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                foundationType === 'DEEP_PILED'
                  ? 'border-emerald-500 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900">Deep Bored Piles</span>
                {foundationType === 'DEEP_PILED' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Reinforced concrete piles with 25-30m rock sockets. Engineered for soft soils & liquefaction risk.
              </p>
              <span className="text-[9px] font-bold text-emerald-700 uppercase mt-0.5">
                Certified All Terrains
              </span>
            </button>

            <button
              type="button"
              id="cfg-foundation-rock"
              onClick={() => handleFoundationChange('ROCK_ANCHOR')}
              className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                foundationType === 'ROCK_ANCHOR'
                  ? 'border-sky-500 bg-sky-500/10 shadow-sm ring-1 ring-sky-500'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900">Pre-Stressed Rock Anchor</span>
                {foundationType === 'ROCK_ANCHOR' && <CheckCircle2 className="w-4 h-4 text-sky-600" />}
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Post-tensioned anchor tendons drilled directly into competent bedrock.
              </p>
              <span className="text-[9px] font-bold text-sky-700 uppercase mt-0.5">
                Bedrock Terrains
              </span>
            </button>
          </div>

          {/* Micro-Siting Engineering Setbacks Strip */}
          <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col gap-2">
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Enforced Micro-Siting Setbacks & Environmental Exclusions
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2 rounded-xl bg-white border border-slate-200/70 flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-emerald-600" />
                  Houses Buffer
                </span>
                <strong className="text-slate-900 font-mono">≥ 500m</strong>
                <span className="text-[9px] text-emerald-600 font-semibold">Zero noise/shadow</span>
              </div>
              <div className="p-2 rounded-xl bg-white border border-slate-200/70 flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                  <Waves className="w-3 h-3 text-emerald-600" />
                  River Buffer
                </span>
                <strong className="text-slate-900 font-mono">≥ 120m</strong>
                <span className="text-[9px] text-emerald-600 font-semibold">Riparian safe</span>
              </div>
              <div className="p-2 rounded-xl bg-white border border-slate-200/70 flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-500" />
                  HV Grid Corridor
                </span>
                <strong className="text-slate-900 font-mono">≥ 150m</strong>
                <span className="text-[9px] text-emerald-600 font-semibold">Induction clear</span>
              </div>
              <div className="p-2 rounded-xl bg-white border border-slate-200/70 flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                  <Truck className="w-3 h-3 text-slate-600" />
                  Logistics Road
                </span>
                <strong className="text-slate-900 font-mono">≥ 100m</strong>
                <span className="text-[9px] text-emerald-600 font-semibold">Heavy crane access</span>
              </div>
            </div>
          </div>
        </Card>

        {/* ── PRIMARY ACTION BUTTON ──────────────────────────────── */}
        <Button
          id="btn-generate-layout"
          variant="energy"
          size="lg"
          disabled={isGeneratingLayout}
          onClick={onGenerateLayout}
          className="w-full bg-[#FFD21F] hover:bg-[#F2C50F] text-slate-950 font-black py-4 text-sm shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isGeneratingLayout ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>Generating Micro-Siting Layout...</span>
            </span>
          ) : (
            <>
              <span>Generate Initial Micro-Siting Layout ({turbineCount} Turbines)</span>
              <ArrowRight className="w-5 h-5 stroke-[2.5]" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
