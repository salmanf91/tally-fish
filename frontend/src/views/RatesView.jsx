import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeDollarSign, Lock, Check, AlertCircle, ArrowRight, SkipForward } from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { api } from '../services/api';
import NumericKeypad from '../components/common/NumericKeypad';

const LAST_KNOWN_RATES = {
  CHAMBAN: 36,
  SARDINE: 40,
  AILE: 30,
  DISCO: 35,
  MIX: 30,
  THAKATTE: 28,
  THONDE: 34,
  PAMBOL: 34,
  KODANDE: 33,
};

export default function RatesView({ initialEntryId = null, onDone }) {
  const { activeBranchId, activeBranch } = useBranch();
  const queryClient = useQueryClient();

  // Fetch all entries for branch
  const { data: entries = [], isLoading, refetch } = useQuery({
    queryKey: ['entries', activeBranchId],
    queryFn: async () => {
      const res = await api.get('/entries');
      return res.data || [];
    },
    enabled: !!activeBranchId,
  });

  // Pending queue of entry IDs
  const [queue, setQueue] = useState([]);
  const [activePartKey, setActivePartKey] = useState('0'); // index of active fish part
  const [ratesMap, setRatesMap] = useState({});
  const [toastMessage, setToastMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Initialize queue
  useEffect(() => {
    if (entries.length > 0) {
      if (initialEntryId) {
        setQueue([initialEntryId]);
      } else {
        const pending = entries.filter((e) => e.status === 'RATE_PENDING').map((e) => e.id);
        setQueue(pending);
      }
    }
  }, [entries, initialEntryId]);

  // Current entry
  const currentEntry = useMemo(() => {
    if (queue.length === 0) return null;
    return entries.find((e) => e.id === queue[0]) || null;
  }, [queue, entries]);

  // Extract fish lines / parts for current entry
  const parts = useMemo(() => {
    if (!currentEntry) return [];
    if (Array.isArray(currentEntry.boxes) && currentEntry.boxes.length > 0) {
      return currentEntry.boxes.map((b, idx) => ({
        key: String(idx),
        fish: b.fish_name,
        box_count: b.box_count,
        pct: parseFloat(b.mix_percentage) || 100,
        lastRate: LAST_KNOWN_RATES[b.fish_name] || 35,
      }));
    }
    return [
      { key: '0', fish: 'CHAMBAN', box_count: 10, pct: 100, lastRate: 36 },
    ];
  }, [currentEntry]);

  // Initialize rates inputs when current entry changes
  useEffect(() => {
    if (currentEntry && parts.length > 0) {
      const initial = {};
      parts.forEach((p) => {
        // Pre-fill existing rate if already rated
        const existing = Array.isArray(currentEntry.rates)
          ? currentEntry.rates.find((r) => r.fish_name === p.fish)?.rate_per_kg
          : null;
        initial[p.key] = existing ? String(existing) : '';
      });
      setRatesMap(initial);
      setActivePartKey('0');
      setErrorMessage('');
    }
  }, [currentEntry, parts]);

  // Mutation to save rates & lock entry
  const fixRatesMutation = useMutation({
    mutationFn: async ({ entryId, rates }) => {
      const res = await api.post(`/entries/${entryId}/rates`, { rates });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries', activeBranchId] });
      setToastMessage(`Rate saved for Entry #${currentEntry?.daily_sl_no}! Entry locked.`);
      // Advance queue
      setQueue((prev) => prev.slice(1));
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Failed to fix rates');
    },
  });

  const handleKeypadChange = (newVal) => {
    setRatesMap((prev) => ({
      ...prev,
      [activePartKey]: newVal,
    }));
  };

  const handleAdjust = (delta) => {
    const curVal = parseFloat(ratesMap[activePartKey]) || parts.find((p) => p.key === activePartKey)?.lastRate || 35;
    const nextVal = Math.max(1, curVal + delta);
    setRatesMap((prev) => ({
      ...prev,
      [activePartKey]: String(nextVal),
    }));
  };

  const handleApplySameToAll = () => {
    const curVal = ratesMap[activePartKey];
    if (!curVal) return;
    const next = {};
    parts.forEach((p) => {
      next[p.key] = curVal;
    });
    setRatesMap(next);
  };

  const handleApplyLastRate = (rate) => {
    setRatesMap((prev) => ({
      ...prev,
      [activePartKey]: String(rate),
    }));
  };

  const handleSkip = () => {
    setQueue((prev) => {
      if (prev.length <= 1) return prev;
      const [first, ...rest] = prev;
      return [...rest, first];
    });
  };

  const handleSaveAndNext = () => {
    if (!currentEntry) return;

    // Validate that every part has a rate > 0
    const rates = parts.map((p) => ({
      fish_name: p.fish,
      rate_per_kg: parseFloat(ratesMap[p.key]) || 0,
    }));

    if (rates.some((r) => !(r.rate_per_kg > 0))) {
      setErrorMessage('Please enter a rate for every fish species');
      return;
    }

    setErrorMessage('');
    fixRatesMutation.mutate({ entryId: currentEntry.id, rates });
  };

  const activePart = parts.find((p) => p.key === activePartKey) || parts[0];

  // Calculate box average for mixed parts if fractional
  const isMixedLot = parts.some((p) => p.pct < 100);
  const mixAverageRate = useMemo(() => {
    if (!isMixedLot) return null;
    let sum = 0;
    let totalPct = 0;
    parts.forEach((p) => {
      const r = parseFloat(ratesMap[p.key]) || 0;
      sum += r * p.pct;
      totalPct += p.pct;
    });
    return totalPct > 0 ? (sum / totalPct).toFixed(2) : null;
  }, [parts, ratesMap, isMixedLot]);

  // If no entries waiting for rate
  if (!isLoading && (!currentEntry || queue.length === 0)) {
    return (
      <div className="space-y-4 max-w-xl mx-auto">
        <div className="light-card p-4 rounded-2xl flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
            <BadgeDollarSign className="w-5 h-5 text-amber-600" />
            Set Rate
          </h2>
          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
            0 Waiting
          </span>
        </div>

        <div className="light-card p-10 rounded-2xl text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-2">
            <Check className="w-6 h-6 stroke-[2.5]" />
          </div>
          <h3 className="font-bold text-sm text-slate-900">All Caught Up</h3>
          <p className="text-xs text-slate-500">
            Every entry for this branch has its rates set and is forwarded to billing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 max-w-xl mx-auto">
      {/* Header */}
      <div className="light-card p-4 rounded-2xl flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-slate-900">
            {currentEntry?.status === 'LOCKED' ? 'Edit Rates' : 'Set Rate'}
          </h2>
          <p className="text-xs text-slate-500">
            {queue.length} slip{queue.length > 1 ? 's' : ''} in queue · {activeBranch?.branch_name}
          </p>
        </div>
        <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
          Queue #{queue.length}
        </span>
      </div>

      {toastMessage && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Slip Overview Card */}
      <div className="light-card p-4 rounded-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center font-mono font-bold text-slate-800 text-xs">
              <span className="text-[8px] text-slate-400 uppercase leading-none">SL</span>
              <span>#{currentEntry?.daily_sl_no}</span>
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">{currentEntry?.party_name}</h3>
              <p className="text-xs text-slate-500 font-mono">
                {currentEntry?.vehicle_no} · {Number(currentEntry?.net_kg).toLocaleString()} kg net
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">Rate per kg</span>
        </div>
      </div>

      {/* Fish Parts / Species Rate Rows */}
      <div className="space-y-2">
        {parts.map((p) => {
          const isFocused = activePartKey === p.key;
          const currentVal = ratesMap[p.key];

          return (
            <div
              key={p.key}
              onClick={() => setActivePartKey(p.key)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none flex items-center justify-between ${
                isFocused
                  ? 'bg-amber-50/60 border-amber-400 ring-2 ring-amber-100 shadow-sm'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <h4 className="font-bold text-sm text-slate-900">{p.fish}</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {p.box_count} boxes {p.pct < 100 ? `· ${p.pct}% mix` : ''}{' '}
                  {p.lastRate ? `· last ₹${p.lastRate}` : ''}
                </p>
              </div>

              <div className="text-right">
                <span className="text-lg font-mono font-black text-slate-900">
                  ₹ {currentVal || <span className="text-slate-300">0</span>}
                </span>
              </div>
            </div>
          );
        })}

        {/* Mixed Box Lot Weighted Average Banner (if mixed lot) */}
        {isMixedLot && mixAverageRate && (
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between text-xs">
            <span className="text-blue-900 font-semibold">Average rate for mixed box:</span>
            <strong className="text-blue-900 font-mono font-bold text-sm">₹{mixAverageRate} / kg</strong>
          </div>
        )}
      </div>

      {/* Quick Adjustments: -1, +1, Same as last, Apply to all */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => handleAdjust(-1)}
          className="touch-key py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs shadow-sm hover:bg-slate-50"
        >
          − 1
        </button>

        <button
          type="button"
          onClick={() => handleAdjust(1)}
          className="touch-key py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs shadow-sm hover:bg-slate-50"
        >
          + 1
        </button>

        {activePart?.lastRate && (
          <button
            type="button"
            onClick={() => handleApplyLastRate(activePart.lastRate)}
            className="touch-key py-2.5 rounded-xl bg-white border border-slate-200 text-amber-800 font-bold text-xs shadow-sm hover:bg-slate-50"
          >
            Last ₹{activePart.lastRate}
          </button>
        )}
      </div>

      {parts.length > 1 && (
        <button
          type="button"
          onClick={handleApplySameToAll}
          className="touch-key w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold text-xs"
        >
          Apply ₹{ratesMap[activePartKey] || '0'} to all fish
        </button>
      )}

      {/* On-Screen Keypad for Rate */}
      <div className="light-card p-3 rounded-2xl">
        <NumericKeypad
          value={ratesMap[activePartKey] || ''}
          onChange={handleKeypadChange}
          onDone={handleSaveAndNext}
          onClear={() => handleKeypadChange('')}
          allowDecimal={true}
          maxDecimals={2}
          quickChips={[
            { label: '30', value: 30 },
            { label: '35', value: 35 },
            { label: '40', value: 40 },
            { label: '45', value: 45 },
          ]}
        />
      </div>

      {/* Bottom Action Row: Skip & Save */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleSkip}
          disabled={queue.length <= 1}
          className="touch-key py-3.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <SkipForward className="w-4 h-4 text-slate-400" /> Skip Slip
        </button>

        <button
          type="button"
          onClick={handleSaveAndNext}
          disabled={fixRatesMutation.isPending}
          className="touch-key py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Lock className="w-4 h-4 stroke-[2.5]" />
          {fixRatesMutation.isPending ? 'Saving...' : queue.length > 1 ? 'Save & Next →' : 'Save Rates'}
        </button>
      </div>
    </div>
  );
}
