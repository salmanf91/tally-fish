import React from 'react';
import { Scale, Wifi, WifiOff, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';

export default function MobileTouchHeader({ isOnline = true }) {
  const { user, logout } = useAuth();
  const { activeBranch, availableBranches, activeBranchId, setActiveBranchId } = useBranch();

  return (
    <header className="desktop:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 select-none shadow-sm">
      <div className="flex items-center justify-between">
        {/* Brand & Scale Icon */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shadow-sm">
            <Scale className="w-4 h-4 text-white stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight text-slate-900 flex items-center gap-1 leading-none">
              TALLY FISH
            </h1>
            <span className="text-[10px] text-amber-600 font-bold tracking-wide">
              {activeBranch?.role === 'owner' ? 'OWNER PORTAL' : 'PROCUREMENT'}
            </span>
          </div>
        </div>

        {/* Center: Active Branch Pill & Switcher */}
        <div className="flex items-center gap-2">
          {availableBranches.length > 1 ? (
            <div className="relative">
              <select
                value={activeBranchId || ''}
                onChange={(e) => setActiveBranchId(e.target.value)}
                className="appearance-none bg-slate-50 border border-slate-300 text-slate-800 text-[11px] font-bold rounded-lg pl-2.5 pr-6 py-1.5 focus:outline-none focus:border-amber-500 shadow-sm"
              >
                {availableBranches.map((b) => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {b.branch_code}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-2.5 pointer-events-none" />
            </div>
          ) : (
            <div className="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-300 text-[11px] font-bold text-slate-800">
              {activeBranch?.branch_code || 'MAIN'}
            </div>
          )}

          {/* Online / Offline Status Badge */}
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border ${
              isOnline
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-rose-50 text-rose-800 border-rose-300 animate-pulse'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3 h-3 text-emerald-600" />
                <span>ON</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-rose-600" />
                <span>OFFLINE</span>
              </>
            )}
          </div>

          {/* Quick Sign Out */}
          <button
            onClick={logout}
            className="p-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 hover:text-rose-600 transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
