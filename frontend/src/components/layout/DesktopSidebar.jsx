import React from 'react';
import {
  Scale,
  FileSpreadsheet,
  BadgeDollarSign,
  Users,
  Bell,
  LogOut,
  ChevronDown,
  Wifi,
  WifiOff,
  UserCheck,
  PlusCircle,
  Clock,
  Layers,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';

export default function DesktopSidebar({ activeTab, onSelectTab, isOnline = true }) {
  const { user, logout } = useAuth();
  const { activeBranchId, activeBranch, availableBranches, setActiveBranchId } = useBranch();

  const role = activeBranch?.role || 'staffAdmin';

  const roleTitle = {
    owner: 'Owner / Administrator',
    billingAdmin: 'Billing Department',
    staffAdmin: 'Weighbridge Staff',
  }[role] || 'Operator';

  const roleBadgeStyle = {
    owner: 'bg-amber-50 text-amber-800 border-amber-300',
    billingAdmin: 'bg-blue-50 text-blue-800 border-blue-300',
    staffAdmin: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  }[role] || 'bg-slate-100 text-slate-700 border-slate-300';

  // Navigation Items tailored per role matching the workflow prototype
  const navItems = [
    // Staff Admin: Today & New Entry + Statement
    {
      id: 'today',
      label: 'Today',
      icon: Clock,
      roles: ['staffAdmin'],
    },
    {
      id: 'new',
      label: 'New entry',
      icon: PlusCircle,
      roles: ['staffAdmin'],
    },
    {
      id: 'statement',
      label: 'Statement',
      icon: FileSpreadsheet,
      roles: ['owner', 'billingAdmin', 'staffAdmin'],
    },

    // Owner: Set rate, Accounts
    {
      id: 'rates',
      label: 'Set rate',
      icon: BadgeDollarSign,
      roles: ['owner'],
      badge: 'Queue',
    },
    {
      id: 'accounts',
      label: 'Accounts',
      icon: UserCheck,
      roles: ['owner'],
    },

    // Billing Admin: Billing, Masters
    {
      id: 'billing',
      label: 'Billing',
      icon: Layers,
      roles: ['billingAdmin'],
      badge: 'Approved',
    },
    {
      id: 'masters',
      label: 'Masters',
      icon: Users,
      roles: ['billingAdmin'],
    },

    // Global: Alerts
    {
      id: 'notifications',
      label: 'Alerts',
      icon: Bell,
      roles: ['owner', 'billingAdmin'],
    },
  ];

  const filteredNavItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside className="hidden desktop:flex flex-col w-64 h-full bg-white border-r border-slate-200 text-slate-800 select-none shrink-0 shadow-sm z-30">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shadow-md shrink-0">
            <Scale className="w-5 h-5 text-white stroke-[2.5]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-black tracking-tight text-slate-900 flex items-center gap-1.5 leading-none">
              Daily Statement
            </h1>
            <p className="text-[11px] text-slate-500 font-medium tracking-wide truncate max-w-[150px] mt-0.5">
              Indo Fish Meal &amp; Oil
            </p>
          </div>
        </div>

        {/* Operating Branch Switcher */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            <span>Branch</span>
            <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
              {isOnline ? (
                <>
                  <Wifi className="w-3 h-3 text-emerald-600" /> Online
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-rose-500" /> Offline
                </>
              )}
            </span>
          </div>
          <div className="relative">
            <select
              value={activeBranchId || ''}
              onChange={(e) => setActiveBranchId(e.target.value)}
              disabled={availableBranches.length <= 1}
              className="w-full appearance-none bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500 pr-7 transition-colors cursor-pointer disabled:cursor-default"
            >
              {availableBranches.map((b) => (
                <option key={b.branch_id} value={b.branch_id} className="text-slate-800">
                  {b.branch_name} ({b.branch_code})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Main Navigation Items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto min-h-0">
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Menu
        </div>
        {filteredNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all group ${
                isActive
                  ? 'bg-amber-50 text-amber-900 border border-amber-300 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-amber-600' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold border border-slate-200">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Session Profile & Sign Out - Permanently pinned at the bottom */}
      <div className="p-3.5 border-t border-slate-200 bg-slate-50/70 shrink-0 mt-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center font-bold text-amber-800 text-xs shrink-0">
              {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="truncate">
              <div className="text-xs font-bold text-slate-900 truncate">
                {user?.username || 'Operator'}
              </div>
              <div
                className={`inline-block text-[9px] px-1.5 py-0.2 rounded-md font-bold border mt-0.5 ${roleBadgeStyle}`}
              >
                {roleTitle}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            title="Log Out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
