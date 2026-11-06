import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Scale,
  Lock,
  Clock,
  Plus,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CloudOff,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { api } from '../services/api';
import { getOfflineEntries } from '../services/db';
import { flushOfflineQueue } from '../services/syncManager';

const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function TodayView({ onNewEntry, onEditEntry, onViewLockedEntry }) {
  const { activeBranchId, activeBranch } = useBranch();
  const queryClient = useQueryClient();

  // Selected date (local timezone)
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());
  const [filter, setFilter] = useState('All'); // 'All' | 'Rate' | 'Done'

  // Offline entries state from IndexedDB
  const [offlineList, setOfflineList] = useState([]);
  const [isSyncingOffline, setIsSyncingOffline] = useState(false);

  const loadOfflineEntries = async () => {
    try {
      const list = await getOfflineEntries();
      setOfflineList(list || []);
    } catch (err) {
      console.warn('[TodayView] Failed to load offline entries:', err);
    }
  };

  const { data: allEntries = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['entries', activeBranchId],
    queryFn: async () => {
      const res = await api.get('/entries');
      return res.data || [];
    },
    enabled: !!activeBranchId,
    refetchOnMount: 'always',
  });

  // Listen for sync completion and online/offline changes
  useEffect(() => {
    loadOfflineEntries();
    const handleSyncComplete = () => {
      loadOfflineEntries();
      refetch();
    };
    window.addEventListener('tally:sync-complete', handleSyncComplete);
    window.addEventListener('online', handleSyncComplete);
    window.addEventListener('offline', loadOfflineEntries);
    return () => {
      window.removeEventListener('tally:sync-complete', handleSyncComplete);
      window.removeEventListener('online', handleSyncComplete);
      window.removeEventListener('offline', loadOfflineEntries);
    };
  }, []);

  // Filter offline entries
  const queuedSyncList = offlineList.filter(
    (e) => e.status === 'QUEUED_SYNC' || e.status === 'OFFLINE_PENDING'
  );
  const holdReviewOfflineList = offlineList.filter((e) => e.status === 'HOLD_REVIEW');

  // Format offline entries matching selected date
  const offlineForDay = offlineList
    .filter((oe) => {
      const d = oe.entry_date ? oe.entry_date.split('T')[0] : '';
      return d === selectedDate && (!oe.branchId || oe.branchId === activeBranchId);
    })
    .map((oe) => {
      const loaded = Number(oe.gross_loaded_kg) || 0;
      const empty = Number(oe.empty_tare_kg) || 0;
      const ice = Number(oe.ice_water_kg) || 0;
      return {
        ...oe,
        id: oe.tempId,
        isOffline: true,
        daily_sl_no: '—',
        net_kg: loaded - empty - ice,
      };
    });

  // Filter server entries by selected date
  const serverDayEntries = allEntries.filter((e) => {
    const d = e.entry_date ? e.entry_date.split('T')[0] : '';
    return d === selectedDate;
  });

  // Combine offline items and server items for comprehensive view
  const combinedDayEntries = [...offlineForDay, ...serverDayEntries];

  const needRateEntries = combinedDayEntries.filter(
    (e) => e.status === 'RATE_PENDING' || e.status === 'QUEUED_SYNC' || e.status === 'OFFLINE_PENDING'
  );
  const lockedEntries = combinedDayEntries.filter((e) => e.status === 'LOCKED');
  const holdReviewEntries = combinedDayEntries.filter((e) => e.status === 'HOLD_REVIEW');

  const filteredList = combinedDayEntries.filter((e) => {
    if (filter === 'Rate') {
      return (
        e.status === 'RATE_PENDING' ||
        e.status === 'QUEUED_SYNC' ||
        e.status === 'OFFLINE_PENDING' ||
        e.status === 'HOLD_REVIEW'
      );
    }
    if (filter === 'Done') return e.status === 'LOCKED';
    return true;
  });

  const shiftDate = (days) => {
    const parts = selectedDate.split('-');
    const current = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    current.setDate(current.getDate() + days);
    setSelectedDate(getLocalDateString(current));
  };

  const handleManualSync = async () => {
    setIsSyncingOffline(true);
    try {
      await flushOfflineQueue(queryClient);
      await loadOfflineEntries();
      await refetch();
    } finally {
      setIsSyncingOffline(false);
    }
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
            onClick={() => {
              refetch();
              loadOfflineEntries();
            }}
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

      {/* Offline Sync Banner when entries are buffered */}
      {queuedSyncList.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <CloudOff className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <h4 className="text-xs font-bold">
                {queuedSyncList.length} Slip{queuedSyncList.length > 1 ? 's' : ''} Buffered Locally
              </h4>
              <p className="text-[11px] text-blue-700">
                Saved offline in IndexedDB. Will sync when online.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSyncingOffline}
            onClick={handleManualSync}
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all disabled:opacity-50"
          >
            {isSyncingOffline ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      )}

      {/* Held for Admin Review Banner if conflict occurred */}
      {holdReviewList.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 flex items-center gap-2.5 shadow-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="flex-1">
            <h4 className="text-xs font-bold">
              {holdReviewList.length} Entry Held for Admin Review
            </h4>
            <p className="text-[11px] text-amber-800">
              Admin assigned rates while this slip was offline. Diverted to admin review.
            </p>
          </div>
        </div>
      )}

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
          <span className="text-xl font-black font-mono text-slate-900 block">
            {combinedDayEntries.length}
          </span>
          <span className="text-[11px] text-slate-500">Total Entries</span>
        </div>
        <div className="light-card p-3 rounded-xl text-center">
          <span className="text-xl font-black font-mono text-amber-600 block">
            {needRateEntries.length}
          </span>
          <span className="text-[11px] text-slate-500">Need Rate</span>
        </div>
        <div className="light-card p-3 rounded-xl text-center">
          <span className="text-xl font-black font-mono text-emerald-600 block">
            {lockedEntries.length}
          </span>
          <span className="text-[11px] text-slate-500">Locked</span>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-1.5">
        {[
          ['All', combinedDayEntries.length],
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
            const isHoldReview = entry.status === 'HOLD_REVIEW';
            const isOfflineQueued =
              entry.isOffline || entry.status === 'QUEUED_SYNC' || entry.status === 'OFFLINE_PENDING';

            return (
              <div
                key={entry.id || entry.tempId}
                onClick={() => {
                  if (isLocked) {
                    onViewLockedEntry(entry);
                  } else if (isHoldReview) {
                    onViewLockedEntry({
                      ...entry,
                      lockReason:
                        entry.conflictMessage ||
                        'Held for Admin Review: Admin set rates while entry was offline.',
                    });
                  } else {
                    onEditEntry(entry);
                  }
                }}
                className="light-card p-3.5 rounded-2xl hover:border-slate-300 cursor-pointer transition-all flex items-start gap-3 select-none"
              >
                <div
                  className={`w-10 h-10 rounded-xl border flex flex-col items-center justify-center font-mono font-bold shrink-0 text-xs ${
                    isOfflineQueued
                      ? 'bg-blue-50 border-blue-200 text-blue-800'
                      : isHoldReview
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-slate-100 border-slate-200 text-slate-800'
                  }`}
                >
                  <span className="text-[8px] opacity-60 uppercase leading-none">
                    {isOfflineQueued ? 'SYNC' : 'SL'}
                  </span>
                  <span>{entry.daily_sl_no !== '—' ? `#${entry.daily_sl_no}` : '⌛'}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-900 truncate">
                      {entry.party_name || 'Unknown Vendor'}
                    </h4>
                    <span className="text-xs font-mono font-bold text-slate-700">
                      {Number(entry.net_kg || 0).toLocaleString()} kg
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
                    ) : isHoldReview ? (
                      <>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300">
                          <AlertTriangle className="w-3 h-3 text-amber-600" /> Held for Admin Review
                        </span>
                        <span className="text-[10px] text-amber-700 font-medium">Conflict locked</span>
                      </>
                    ) : isOfflineQueued ? (
                      <>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                          <CloudOff className="w-3 h-3 text-blue-600" /> Queued for Sync
                        </span>
                        <span className="text-[10px] text-blue-700 font-medium">Local buffer</span>
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
