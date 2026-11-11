import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeDollarSign, ChevronLeft, ChevronRight, CheckCircle2, Edit3, RefreshCw, Plus } from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { api } from '../services/api';

const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function getRateSummary(entry) {
  if (!Array.isArray(entry.rates) || entry.rates.length === 0) {
    return {
      rateLabel: 'Rate pending',
      breakdown: '',
      avgRate: 0,
      totalAmount: 0,
    };
  }

  const ratesMap = {};
  entry.rates.forEach((r) => {
    ratesMap[r.fish_name.trim().toUpperCase()] = Number(r.rate_per_kg) || 0;
  });

  const boxes = Array.isArray(entry.boxes) ? entry.boxes : [];
  let totalFactor = 0;
  let weightedSum = 0;

  if (boxes.length > 0) {
    boxes.forEach((b) => {
      const bCount = Number(b.box_count) || 1;
      const pct = Number(b.mix_percentage) || 100;
      const factor = bCount * (pct / 100);
      const fish = (b.fish_name || '').trim().toUpperCase();
      const rate = ratesMap[fish] || 0;
      totalFactor += factor;
      weightedSum += factor * rate;
    });
  }

  const avgRate =
    entry.average_rate !== undefined
      ? Number(entry.average_rate)
      : totalFactor > 0
      ? Math.round((weightedSum / totalFactor) * 100) / 100
      : Number(entry.rates[0]?.rate_per_kg) || 0;

  const netKg = Number(entry.net_kg) || 0;
  const totalAmount =
    entry.total_amount !== undefined
      ? Number(entry.total_amount)
      : Math.round(netKg * avgRate * 100) / 100;

  const breakdown = entry.rates
    .map((r) => `${r.fish_name} ₹${r.rate_per_kg}`)
    .join(' + ');

  const rateLabel =
    entry.rates.length === 1
      ? `₹${entry.rates[0].rate_per_kg} / kg`
      : `Avg ₹${avgRate.toFixed(2)} / kg`;

  return {
    rateLabel,
    breakdown,
    avgRate,
    totalAmount,
  };
}

export default function BillingView({ onEditRates, onNewEntry, onEditEntry }) {
  const { activeBranchId, activeBranch, availableBranches, setActiveBranchId } = useBranch();

  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());

  const { data: allEntries = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['entries', activeBranchId],
    queryFn: async () => {
      const res = await api.get('/entries');
      return res.data || [];
    },
    enabled: !!activeBranchId,
    refetchOnMount: 'always',
  });

  const dayEntries = allEntries.filter((e) => {
    const d = e.entry_date ? e.entry_date.split('T')[0] : '';
    return d === selectedDate;
  });

  const approvedEntries = dayEntries.filter((e) => e.status === 'LOCKED');
  const waitingCount = dayEntries.length - approvedEntries.length;

  const shiftDate = (days) => {
    const parts = selectedDate.split('-');
    const current = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    current.setDate(current.getDate() + days);
    setSelectedDate(getLocalDateString(current));
  };

  return (
    <div className="space-y-4 w-full">
      {/* Top Header */}
      <div className="light-card p-4 rounded-2xl flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-slate-900">Billing Department</h2>
          <p className="text-xs text-slate-500">
            Branch: <strong className="text-slate-800">{activeBranch?.branch_name}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onNewEntry && (
            <button
              onClick={onNewEntry}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1 shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>New Entry</span>
            </button>
          )}
          <button
            onClick={() => refetch()}
            title="Refresh"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-amber-600' : ''}`} />
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
            className="px-2.5 py-2 rounded-xl border border-blue-300 bg-blue-50 text-blue-800 font-bold text-xs"
          >
            Today
          </button>
        )}
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
        <div className="light-card p-8 rounded-2xl text-center space-y-3">
          <p className="text-slate-500 text-xs font-medium">
            No approved entries found for {activeBranch?.branch_name} on {selectedDate}.
          </p>
          {availableBranches && availableBranches.length > 1 && (
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {availableBranches
                .filter((b) => b.branch_id !== activeBranchId)
                .map((other) => (
                  <button
                    key={other.branch_id}
                    type="button"
                    onClick={() => setActiveBranchId(other.branch_id)}
                    className="text-xs font-bold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded-xl px-3.5 py-2 transition-all shadow-sm"
                  >
                    Switch to {other.branch_name} ({other.branch_code}) →
                  </button>
                ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 desktop:grid-cols-2 gap-3">
          {approvedEntries.map((entry) => {
            const rateInfo = getRateSummary(entry);

            return (
              <div key={entry.id} className="light-card p-4 rounded-2xl space-y-2.5">
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

                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 font-mono">
                  <span className="text-slate-500">
                    {entry.vehicle_no} · {Number(entry.net_kg).toLocaleString()} kg
                  </span>
                  <span className="font-bold text-amber-700 text-sm">
                    {rateInfo.rateLabel}
                  </span>
                </div>

                {/* Rate Breakdown and Slip Value */}
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono space-y-1">
                  {rateInfo.breakdown && (
                    <div className="text-[11px] text-slate-600 truncate">
                      {rateInfo.breakdown}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/60">
                    <span className="text-slate-500 font-medium">Total Slip Value:</span>
                    <span className="font-bold text-slate-900">
                      ₹{rateInfo.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Action Buttons for Billing Admin */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {onEditEntry && (
                    <button
                      type="button"
                      onClick={() => onEditEntry(entry)}
                      className="py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-500" /> Edit Slip
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onEditRates(entry.id)}
                    className={`py-2 rounded-xl bg-white border border-amber-300 text-amber-900 font-bold text-xs hover:bg-amber-50 flex items-center justify-center gap-1.5 shadow-2xs transition-colors ${
                      !onEditEntry ? 'col-span-2' : ''
                    }`}
                  >
                    <BadgeDollarSign className="w-3.5 h-3.5 text-amber-600" /> Edit Rates
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
