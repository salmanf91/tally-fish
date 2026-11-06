import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Scale, Lock, Clock, Plus, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { api } from '../services/api';

const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function TodayView({ onNewEntry, onEditEntry, onViewLockedEntry }) {
  const { activeBranchId, activeBranch } = useBranch();

  // Selected date (local timezone)
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());

  const [filter, setFilter] = useState('All'); // 'All' | 'Rate' | 'Done'

  const { data: allEntries = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['entries', activeBranchId],
    queryFn: async () => {
      const res = await api.get('/entries');
      return res.data || [];
    },
    enabled: !!activeBranchId,
    refetchOnMount: 'always',
  });

  // Filter entries by selected date
  const dayEntries = allEntries.filter((e) => {
    const d = e.entry_date ? e.entry_date.split('T')[0] : '';
    return d === selectedDate;
  });

  const needRateEntries = dayEntries.filter((e) => e.status === 'RATE_PENDING');
  const lockedEntries = dayEntries.filter((e) => e.status === 'LOCKED');

  const filteredList = dayEntries.filter((e) => {
    if (filter === 'Rate') return e.status === 'RATE_PENDING';
    if (filter === 'Done') return e.status === 'LOCKED';
    return true;
  });

  const shiftDate = (days) => {
    const parts = selectedDate.split('-');
    const current = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    current.setDate(current.getDate() + days);
    setSelectedDate(getLocalDateString(current));
  };

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      {/* Header */}
      <div className="light-card p-4 rounded-2xl flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-slate-900">Today's Intake Slips</h2>
          <p className="text-xs text-slate-500">
            Branch: <strong className="text-slate-800">{activeBranch?.branch_name}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            title="Refresh entries"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-amber-600' : ''}`} />
          </button>
          <button
            onClick={onNewEntry}
            className="text-xs font-bold px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" /> New Entry
          </button>
        </div>
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
        {selectedDate !== getLocalDateString() && (
          <button
            onClick={() => setSelectedDate(getLocalDateString())}
            className="px-2.5 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 font-bold text-xs"
          >
            Today
          </button>
        )}
      </div>

      {/* Quick Stats Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="light-card p-3 rounded-xl text-center">
          <span className="text-xl font-black font-mono text-slate-900 block">{dayEntries.length}</span>
          <span className="text-[11px] text-slate-500">Total Entries</span>
        </div>
        <div className="light-card p-3 rounded-xl text-center">
          <span className="text-xl font-black font-mono text-amber-600 block">{needRateEntries.length}</span>
          <span className="text-[11px] text-slate-500">Need Rate</span>
        </div>
        <div className="light-card p-3 rounded-xl text-center">
          <span className="text-xl font-black font-mono text-emerald-600 block">{lockedEntries.length}</span>
          <span className="text-[11px] text-slate-500">Locked</span>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-1.5">
        {[
          ['All', dayEntries.length],
          ['Rate', needRateEntries.length],
          ['Done', lockedEntries.length],
        ].map(([label, count]) => (
          <button
            key={label}
            onClick={() => setFilter(label)}
            className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${
              filter === label
                ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Slips List */}
      {isLoading ? (
        <div className="text-xs text-slate-400 p-8 text-center">Loading slips...</div>
      ) : filteredList.length === 0 ? (
        <div className="light-card p-8 rounded-2xl text-center space-y-2">
          <p className="text-slate-500 text-xs font-medium">
            No slips found for {selectedDate}.
          </p>
          <button
            onClick={onNewEntry}
            className="text-xs font-bold text-amber-600 hover:text-amber-700 underline"
          >
            + Create New Weighbridge Entry
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredList.map((entry) => {
            const isLocked = entry.status === 'LOCKED';
            return (
              <div
                key={entry.id}
                onClick={() => {
                  if (isLocked) {
                    onViewLockedEntry(entry);
                  } else {
                    onEditEntry(entry);
                  }
                }}
                className="light-card p-3.5 rounded-2xl hover:border-slate-300 cursor-pointer transition-all flex items-start gap-3 select-none"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center font-mono font-bold text-slate-800 shrink-0 text-xs">
                  <span className="text-[8px] text-slate-400 uppercase leading-none">SL</span>
                  <span>#{entry.daily_sl_no}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-900 truncate">{entry.party_name}</h4>
                    <span className="text-xs font-mono font-bold text-slate-700">
                      {Number(entry.net_kg).toLocaleString()} kg
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {entry.remarks || `Truck: ${entry.vehicle_no}`}
                  </p>

                  <div className="flex items-center gap-2 mt-2">
                    {isLocked ? (
                      <>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <Lock className="w-3 h-3 text-emerald-600" /> Rate Set
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">🔒 Locked</span>
                      </>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" /> Rate Pending
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">Editable by staff</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
