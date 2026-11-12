import React from 'react';
import {
  FileSpreadsheet,
  BadgeDollarSign,
  Users,
  PlusCircle,
  Clock,
  Layers,
  UserCheck,
} from 'lucide-react';
import { useBranch } from '../../context/BranchContext';

export default function MobileTouchNav({ activeTab, onSelectTab }) {
  const { currentRole, hasPermission } = useBranch();

  let tabs = [];

  if (currentRole === 'owner') {
    tabs = [
      { id: 'statement', label: 'Statement', icon: FileSpreadsheet },
      { id: 'rates', label: 'Set rate', icon: BadgeDollarSign },
      { id: 'new', label: 'New entry', icon: PlusCircle },
      { id: 'accounts', label: 'Accounts', icon: UserCheck },
    ];
  } else if (currentRole === 'billingAdmin') {
    tabs = [
      { id: 'billing', label: 'Billing', icon: Layers },
      { id: 'statement', label: 'Statement', icon: FileSpreadsheet },
      { id: 'new', label: 'New entry', icon: PlusCircle },
      { id: 'masters', label: 'Masters', icon: Users },
    ];
  } else if (currentRole === 'staffAdmin') {
    tabs = [
      { id: 'today', label: 'Today', icon: Clock },
      { id: 'new', label: 'New entry', icon: PlusCircle },
    ];
  } else {
    // Custom Enterprise Roles: Dynamically build tabs from granted permissions
    const candidateTabs = [
      {
        id: 'today',
        label: 'Today',
        icon: Clock,
        visible:
          hasPermission &&
          hasPermission('slips:view') &&
          !hasPermission('statement:view') &&
          !hasPermission('billing:view'),
      },
      {
        id: 'billing',
        label: 'Billing',
        icon: Layers,
        visible: hasPermission && hasPermission('billing:view'),
      },
      {
        id: 'statement',
        label: 'Statement',
        icon: FileSpreadsheet,
        visible: hasPermission && hasPermission('statement:view'),
      },
      {
        id: 'rates',
        label: 'Set rate',
        icon: BadgeDollarSign,
        visible: hasPermission && hasPermission('rates:set'),
      },
      {
        id: 'new',
        label: 'New entry',
        icon: PlusCircle,
        visible: hasPermission && hasPermission('slips:create'),
      },
      {
        id: 'masters',
        label: 'Masters',
        icon: Users,
        visible: hasPermission && hasPermission('masters:view'),
      },
      {
        id: 'accounts',
        label: 'Accounts',
        icon: UserCheck,
        visible:
          hasPermission &&
          (hasPermission('accounts:manage') || hasPermission('roles:manage')),
      },
    ];

    tabs = candidateTabs.filter((t) => t.visible);
    if (tabs.length === 0) {
      tabs = [
        { id: 'today', label: 'Today', icon: Clock },
        { id: 'new', label: 'New entry', icon: PlusCircle },
      ];
    }
  }

  return (
    <nav className="desktop:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 px-3 py-1.5 select-none pb-[env(safe-area-inset-bottom,8px)] shadow-lg">
      <div className="grid grid-flow-col auto-cols-fr gap-1 items-center">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`touch-key flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all relative ${
                isActive
                  ? 'bg-amber-50 text-amber-900 font-bold'
                  : 'text-slate-500 font-medium active:text-slate-900'
              }`}
            >
              <Icon
                className={`w-5 h-5 mb-0.5 transition-colors ${
                  isActive ? 'text-amber-600 stroke-[2.4]' : 'text-slate-400'
                }`}
              />
              <span className="text-[11px] leading-tight tracking-tight">{tab.label}</span>
              {isActive && (
                <div className="absolute -bottom-1 w-4 h-1 rounded-full bg-amber-500" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
