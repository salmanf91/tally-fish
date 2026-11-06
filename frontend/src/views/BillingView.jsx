import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeDollarSign, ChevronLeft, ChevronRight, CheckCircle2, Edit3 } from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { api } from '../services/api';

export default function BillingView({ onEditRates }) {
  const { activeBranchId, activeBranch } = useBranch();

  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const { data: allEntries = [], isLoading } = useQuery({
    queryKey: ['entries', activeBranchId],
    queryFn: async () => {
      const res = await api.get('/entries');
      return res.data || [];
    },
    enabled: !!activeBranchId,
  });

  const dayEntries = allEntries.filter((e) => {
    const d = e.entry_date ? e.entry_date.split('T')[0] : '';
    return d === selectedDate;
  });

  const approvedEntries = dayEntries.filter((e) => e.status === 'LOCKED');
  const waitingCount = dayEntries.length - approvedEntries.length;

  const shiftDate = (days) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      {/* Top Header */}
      <div className="light-card p-4 rounded-2xl flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-slate-900">Billing Department</h2>
          <p className="text-xs text-slate-500">
            Branch: <strong className="text-slate-800">{activeBranch?.branch_name}</strong>
          </p>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200">
          Billing Role
        </span>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => shiftDate(-1)}
          className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 text-center shadow-sm"
        />
        <button
          onClick={() => shiftDate(1)}
          className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Workflow Status Banner */}
      <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-medium">
        Rates approved by owner appear here, and you can edit them.{' '}
        {waitingCount > 0 && <strong>{waitingCount} entry still waiting for admin.</strong>}
      </div>

      {/* Approved Entries List */}
      {isLoading ? (
        <div className="text-xs text-slate-400 p-8 text-center">Loading slips...</div>
      ) : approvedEntries.length === 0 ? (
        <div className="light-card p-8 rounded-2xl text-center text-slate-400 text-xs">
          No approved entries for this day.
        </div>
      ) : (
        <div className="space-y-3">
          {approvedEntries.map((entry) => (
            <div key={entry.id} className="light-card p-4 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-mono font-bold text-xs">
                    #{entry.daily_sl_no}
                  </span>
                  <h4 className="font-bold text-sm text-slate-900">{entry.party_name}</h4>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Admin Approved
                </span>
              </div>

              <p className="text-xs text-slate-600 font-mono">{entry.remarks}</p>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                <span className="text-slate-500 font-mono">
                  {entry.vehicle_no} · {Number(entry.net_kg).toLocaleString()} kg
                </span>
                <span className="font-mono font-bold text-amber-700">
                  ₹{Number(entry.total_amount || 0).toLocaleString()}
                </span>
              </div>

              {/* Edit Rates Button for Billing Admin */}
              <button
                type="button"
                onClick={() => onEditRates(entry.id)}
                className="w-full mt-2 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-500" /> Edit Rates
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

