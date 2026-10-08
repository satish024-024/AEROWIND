import React from 'react';
import { Search, Bell, Sun, Moon, Wind, ChevronLeft, MessageSquare, Settings } from 'lucide-react';
import { TelemetryData } from '../../types';
import { DesktopNavigation } from './DesktopNavigation';
import { AeroQuantumLogo } from '../ui/AeroQuantumLogo';

interface AppHeaderProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  telemetry: TelemetryData | null;
  onSearch?: (q: string) => void;
  onNewProject?: () => void;
  onOpenAuth?: () => void;
  user?: { username: string; email: string } | null;
  canGoBack?: boolean;
  onBack?: () => void;
  onOpenQuantumCredentials?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  currentTab,
  onTabChange,
  telemetry,
  onSearch,
  onNewProject,
  onOpenAuth,
  user,
  canGoBack = false,
  onBack,
  onOpenQuantumCredentials,
}) => {
  return (
    <header className="sticky top-0 z-[1300] w-full bg-white/35 hover:bg-white/45 backdrop-blur-2xl border-b border-white/35 shadow-[0_4px_24px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] px-3 sm:px-4 md:px-6 py-2.5 flex items-center justify-between gap-3 sm:gap-4 transition-all">
      {/* Brand & Wordmark with Back Button */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {canGoBack && onBack && (
          <button
            id="btn-header-back"
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full bg-white/70 hover:bg-white active:scale-95 border border-white/80 text-slate-950 font-black text-xs shadow-xs backdrop-blur-md transition-all cursor-pointer select-none shrink-0"
            title="Go back to previous screen"
          >
            <ChevronLeft className="w-4 h-4 stroke-[3]" />
            <span className="text-[11px] font-black uppercase tracking-wider">Back</span>
          </button>
        )}
        <button
          onClick={() => onTabChange('home')}
          className="flex items-center gap-2 sm:gap-2.5 text-left focus:outline-none group select-none active:scale-98 transition-transform"
          title="Return to Home"
        >
          <AeroQuantumLogo size={36} />
          <div className="flex flex-col leading-none">
            <div className="text-xl sm:text-2xl font-black tracking-tight text-slate-950 flex items-center">
              AeroQuantum<span className="text-[#FFD21F] font-black drop-shadow-xs">Wind</span>
            </div>
            <span className="hidden sm:block text-[10px] text-slate-500 font-bold tracking-wide uppercase mt-0.5">
              Quantum GIS Wind Farm Micro-Siting
            </span>
          </div>
        </button>
      </div>

      {/* Center Nav Tabs (Desktop) */}
      <DesktopNavigation
        currentTab={currentTab}
        onTabChange={onTabChange}
        onNewProject={onNewProject}
      />

      {/* Right Section: Search & Live Telemetry & Avatar */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="hidden md:flex items-center relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            placeholder="Search locations, projects..."
            className="pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-100/90 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 focus:outline-none w-48 lg:w-60 transition-all text-slate-800 placeholder-slate-400"
            onChange={(e) => onSearch?.(e.target.value)}
          />
        </div>

        {/* Live Weather Widget */}
        {telemetry && (
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-white/80 border border-slate-200 text-xs shadow-subtle backdrop-blur-sm">
            <div className="flex items-center gap-1 text-slate-700">
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-semibold">{telemetry.temperature_c}°C</span>
              <span className="text-slate-400 text-[11px]">{telemetry.condition}</span>
            </div>
            <div className="w-[1px] h-3 bg-slate-200" />
            <div className="flex items-center gap-1 text-slate-700">
              <Wind className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-semibold">{telemetry.wind_speed_120m} m/s</span>
              <span className="text-slate-400 text-[11px]">NE ({telemetry.wind_direction_deg}°)</span>
            </div>
          </div>
        )}

        {/* Chat / Message Button */}
        <button
          className="hidden lg:flex w-8 h-8 rounded-full bg-white/70 hover:bg-white backdrop-blur-md border border-white/80 shadow-xs items-center justify-center text-slate-700 hover:text-slate-950 active:scale-95 transition-all"
          aria-label="Messages"
          title="Team & AI Messages"
        >
          <MessageSquare className="w-3.5 h-3.5" />
        </button>

        {/* Quantum Settings Button */}
        <button
          id="btn-quantum-settings"
          type="button"
          onClick={onOpenQuantumCredentials}
          className="flex w-8 h-8 rounded-full bg-white/70 hover:bg-white backdrop-blur-md border border-white/80 shadow-xs items-center justify-center text-slate-700 hover:text-slate-950 active:scale-95 transition-all cursor-pointer"
          aria-label="Quantum Settings"
          title="IBM Quantum Credentials & Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Sun / Moon Toggle */}
        <button
          className="hidden lg:flex w-8 h-8 rounded-full bg-white/70 hover:bg-white backdrop-blur-md border border-white/80 shadow-xs items-center justify-center text-slate-700 hover:text-slate-950 active:scale-95 transition-all"
          aria-label="Toggle Theme"
          title="Theme"
        >
          <Moon className="w-3.5 h-3.5" />
        </button>

        {/* Notification Bell */}
        <button
          className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/80 backdrop-blur-md border border-white/80 shadow-xs flex items-center justify-center text-slate-700 hover:text-slate-950 hover:bg-white active:scale-95 transition-all"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
        </button>

        {/* User Sign In / Avatar Button */}
        <button
          id="btn-open-auth"
          onClick={onOpenAuth}
          className="flex items-center gap-2 p-0.5 sm:px-2.5 sm:py-1 rounded-full bg-white/80 hover:bg-white border border-white/80 shadow-xs active:scale-95 transition-all select-none cursor-pointer"
          title={user ? `Signed in as ${user.username}` : 'Sign In / Account'}
        >
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center p-0.5">
            <AeroQuantumLogo size={20} />
          </div>
          <span className="hidden sm:inline text-xs font-bold text-slate-800 pr-1" id="header-user-label">
            {user ? user.username : 'Sign In'}
          </span>
        </button>
      </div>
    </header>
  );
};
