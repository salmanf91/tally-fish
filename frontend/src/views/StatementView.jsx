import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileSpreadsheet,
  RefreshCw,
  Share2,
  FileText,
  FileCheck,
  Send,
  X,
  AlertCircle,
} from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

const CLIENT_PHONES = {
  AMR: '+91 98450 10001',
  RMS: '+91 98450 10002',
  'M RISHAN': '+91 98450 10003',
  PAM: '+91 98450 10004',
  AG: '+91 98450 10005',
  SUFAID: '+91 98450 10006',
  'M HANEEF': '+91 98450 10007',
};

export default function StatementView({ onNavigateToRates }) {
  const { activeBranchId, activeBranch, availableBranches, setActiveBranchId } = useBranch();
  const { user } = useAuth();

  const isBilling = activeBranch?.role === 'billingAdmin';
  const isOwner = activeBranch?.role === 'owner';

  const getLocalDateString = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const TODAY = getLocalDateString();

  // Filters
  const [fromDate, setFromDate] = useState(TODAY);
  const [toDate, setToDate] = useState(TODAY);
  const [selectedParty, setSelectedParty] = useState('');
  const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'Rate pending' | 'Rate set'
  const [searchQuery, setSearchQuery] = useState('');

  // WhatsApp Share Modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareParty, setShareParty] = useState('');
  const [shareFormat, setShareFormat] = useState('Excel');
  const [sharePhone, setSharePhone] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // Fetch entries
  const { data: allEntries = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['entries', activeBranchId],
    queryFn: async () => {
      const res = await api.get('/entries');
      return res.data || [];
    },
    enabled: !!activeBranchId,
    refetchOnMount: 'always',
  });

  // Filter entries
  const filteredEntries = useMemo(() => {
    return allEntries.filter((e) => {
      const d = e.entry_date ? e.entry_date.split('T')[0] : '';
      if (d < fromDate || d > toDate) return false;
      if (selectedParty && e.party_name !== selectedParty) return false;
      if (statusFilter === 'Rate pending' && e.status !== 'RATE_PENDING') return false;
      if (statusFilter === 'Rate set' && e.status !== 'LOCKED') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const str = `${e.party_name} ${e.vehicle_no || ''} ${e.remarks || ''}`.toLowerCase();
        if (!str.includes(q)) return false;
      }
      return true;
    });
  }, [allEntries, fromDate, toDate, selectedParty, statusFilter, searchQuery]);

  // Statistics
  const totalNetKg = useMemo(() => {
    return filteredEntries.reduce((sum, e) => sum + (parseFloat(e.net_kg) || 0), 0);
  }, [filteredEntries]);

  const pendingRateCount = useMemo(() => {
    return filteredEntries.filter((e) => e.status === 'RATE_PENDING').length;
  }, [filteredEntries]);

  // Unique parties for filter
  const partiesInEntries = useMemo(() => {
    const set = new Set(allEntries.map((e) => e.party_name).filter(Boolean));
    return Array.from(set).sort();
  }, [allEntries]);

  const setDatePreset = (preset) => {
    const today = new Date();
    if (preset === 'today') {
      const str = today.toISOString().split('T')[0];
      setFromDate(str);
      setToDate(str);
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const str = y.toISOString().split('T')[0];
      setFromDate(str);
      setToDate(str);
    } else if (preset === '7days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 6);
      setFromDate(past.toISOString().split('T')[0]);
      setToDate(today.toISOString().split('T')[0]);
    }
  };

  // WhatsApp Message generation
  const whatsappMessage = useMemo(() => {
    if (!shareParty) return '';
    const partyEntries = allEntries.filter(
      (e) => e.party_name === shareParty && e.entry_date?.split('T')[0] === toDate
    );
    let msg = `Indo Fish Meal & Oil Co. Pvt. Ltd.\nDaily rate statement · ${toDate}\nParty: ${shareParty}\n\n`;
    let partyTotalNet = 0;

    partyEntries.forEach((e, idx) => {
      partyTotalNet += parseFloat(e.net_kg) || 0;
      msg += `${idx + 1}) ${e.vehicle_no} · ${Number(e.net_kg).toLocaleString()} kg\n`;
      msg += `   ${e.remarks || 'Raw catch'}`;
      if (e.rates && e.rates.length > 0) {
        msg += ` → ₹${e.rates.map((r) => `${r.fish_name} ₹${r.rate_per_kg}`).join(', ')}`;
      } else {
        msg += ` → Rate Pending`;
      }
      msg += '\n\n';
    });

    msg += `Total net: ${Number(partyTotalNet).toLocaleString()} kg\nReport attached (${shareFormat}).`;
    return msg;
  }, [shareParty, toDate, allEntries, shareFormat]);

  const handleOpenShare = () => {
    const defaultParty = selectedParty || partiesInEntries[0] || '';
    setShareParty(defaultParty);
    setSharePhone(CLIENT_PHONES[defaultParty] || '');
    setShareModalOpen(true);
  };

  const handleSendWhatsApp = () => {
    const cleanedPhone = sharePhone.replace(/\D/g, '');
    const url = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(whatsappMessage)}`;
    window.open(url, '_blank');
    setShareModalOpen(false);
    setToastMessage(`WhatsApp opened for ${shareParty}`);
    setTimeout(() => setToastMessage(''), 4000);
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="light-card p-4 rounded-2xl flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-amber-600" />
            Daily Procurement Statement
          </h2>
          <p className="text-xs text-slate-500">
            {fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`} · {activeBranch?.branch_name}
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-amber-600' : ''}`} />
        </button>
      </div>

      {toastMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold">
          {toastMessage}
        </div>
      )}

      {/* Filter Control Box */}
      <div className="light-card p-4 rounded-2xl space-y-3">
        {/* Preset chips */}
        <div className="flex gap-1.5 overflow-x-auto">
          {[
            ['today', 'Today'],
            ['yesterday', 'Yesterday'],
            ['7days', 'Last 7 days'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDatePreset(key)}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              {label}
            </button>
          ))}
        </div>

        {/* From - To date inputs */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800"
            />
          </div>
        </div>

        {/* Party dropdown and search query */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={selectedParty}
            onChange={(e) => setSelectedParty(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
          >
            <option value="">All Parties</option>
            {partiesInEntries.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search vehicle, remarks"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
          />
        </div>

        {/* Status filter chips */}
        <div className="flex gap-1.5 pt-1">
          {['All', 'Rate pending', 'Rate set'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${
                statusFilter === s
                  ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setDatePreset('today');
              setSelectedParty('');
              setStatusFilter('All');
              setSearchQuery('');
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl text-slate-500 hover:text-slate-800 ml-auto"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Summary Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="light-card p-3 rounded-xl text-center">
          <span className="text-xl font-black font-mono text-slate-900 block">
            {filteredEntries.length}
          </span>
          <span className="text-[11px] text-slate-500">Entries</span>
        </div>
        <div className="light-card p-3 rounded-xl text-center">
          <span className="text-xl font-black font-mono text-blue-700 block">
            {filteredEntries.length} / {filteredEntries.length}
          </span>
          <span className="text-[11px] text-slate-500">Weighed</span>
        </div>
        <div className="light-card p-3 rounded-xl text-center">
          <span className="text-xl font-black font-mono text-slate-900 block">
            {Number(totalNetKg).toLocaleString()}
          </span>
          <span className="text-[11px] text-slate-500">Net kg</span>
        </div>
      </div>

      {/* Pending Rate Warning Banner */}
      {pendingRateCount > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold flex items-center justify-between">
          <span>{pendingRateCount} entries still need a rate.</span>
          {isOwner ? (
            <button
              onClick={() => onNavigateToRates && onNavigateToRates()}
              className="underline font-bold text-amber-900 hover:text-amber-950"
            >
              Set Rates →
            </button>
          ) : (
            <span className="text-slate-500 font-normal">Waiting for owner</span>
          )}
        </div>
      )}

      {/* Procurement Slips Table */}
      <div className="light-card rounded-2xl overflow-hidden">
        {filteredEntries.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-slate-500 text-xs font-medium">
              No entries found for {activeBranch?.branch_name} on {fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}.
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
                      className="text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl px-3.5 py-2 transition-all shadow-sm"
                    >
                      Switch to {other.branch_name} ({other.branch_code}) →
                    </button>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 px-3">SL</th>
                <th className="py-2.5 px-3">Party / Vehicle</th>
                <th className="py-2.5 px-3 text-right">Net kg</th>
                <th className="py-2.5 px-3 text-right">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredEntries.map((e, idx) => {
                const needsRate = e.status === 'RATE_PENDING';
                return (
                  <tr key={e.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-mono font-bold text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3">
                      <strong className="text-slate-900 block text-sm">{e.party_name}</strong>
                      <span className="text-slate-500 font-mono text-[11px]">
                        {e.vehicle_no || 'Weights pending'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                      {Number(e.net_kg).toLocaleString()}
                    </td>
                    <td
                      onClick={() => {
                        if (isOwner && onNavigateToRates) {
                          onNavigateToRates(e.id);
                        }
                      }}
                      className={`py-3 px-3 text-right font-mono font-bold ${
                        needsRate ? 'text-amber-600' : 'text-slate-900'
                      } ${isOwner ? 'cursor-pointer hover:underline' : ''}`}
                    >
                      {needsRate ? (
                        '—'
                      ) : e.rates && e.rates.length > 0 ? (
                        e.rates.map((r, i) => (
                          <div key={i}>
                            {r.fish_name} ₹{r.rate_per_kg}
                          </div>
                        ))
                      ) : (
                        `₹${e.total_amount ? (e.total_amount / e.net_kg).toFixed(2) : '35.00'}`
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Actions */}
      {isBilling ? (
        <div className="light-card p-4 rounded-2xl space-y-3">
          <button
            type="button"
            onClick={handleOpenShare}
            className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all"
          >
            <Send className="w-4 h-4" /> Send to client on WhatsApp
          </button>
          <p className="text-[11px] text-slate-500 text-center">
            {selectedParty ? `Client: ${selectedParty}` : 'Choose a client in the filter or pick in the next step.'}
          </p>

          <div className="pt-2 border-t border-slate-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
              Daily Report · All Clients
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setToastMessage('Excel report ready for download');
                  setTimeout(() => setToastMessage(''), 3000);
                }}
                className="py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                Excel Export
              </button>
              <button
                type="button"
                onClick={() => {
                  setToastMessage('PDF report ready for download');
                  setTimeout(() => setToastMessage(''), 3000);
                }}
                className="py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                PDF Export
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => {
              setToastMessage('Statement shared');
              setTimeout(() => setToastMessage(''), 3000);
            }}
            className="py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            Share
          </button>
          <button
            type="button"
            onClick={() => {
              setToastMessage('PDF ready to download');
              setTimeout(() => setToastMessage(''), 3000);
            }}
            className="py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            PDF
          </button>
          <button
            type="button"
            onClick={() => {
              setToastMessage('Excel ready to download');
              setTimeout(() => setToastMessage(''), 3000);
            }}
            className="py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            Excel
          </button>
        </div>
      )}

      {/* WhatsApp Share Modal Sheet */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl p-5 border border-slate-200 shadow-xl space-y-3.5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-base text-slate-900">Send Statement on WhatsApp</h3>
              <button
                onClick={() => setShareModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Client / Vendor
              </label>
              <select
                value={shareParty}
                onChange={(e) => {
                  setShareParty(e.target.value);
                  setSharePhone(CLIENT_PHONES[e.target.value] || '');
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
              >
                {partiesInEntries.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Client WhatsApp Number
              </label>
              <input
                type="text"
                value={sharePhone}
                onChange={(e) => setSharePhone(e.target.value)}
                placeholder="+91 ..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Report Format
              </label>
              <div className="flex gap-2">
                {['Excel', 'PDF'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setShareFormat(f)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                      shareFormat === f
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Message Preview
              </label>
              <textarea
                readOnly
                value={whatsappMessage}
                className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-700 resize-none"
              />
            </div>

            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" /> Open WhatsApp Web / App
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
