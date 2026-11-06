import React from 'react';
import { Lock, X } from 'lucide-react';

export default function LockedSlipModal({ entry, onClose }) {
  if (!entry) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-3xl p-5 border border-slate-200 shadow-xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                Entry #{entry.daily_sl_no}
              </h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                <Lock className="w-3 h-3 text-emerald-600" /> Locked
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {new Date(entry.entry_date).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lock Alert Banner */}
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium">
          Rate set by admin, so this entry is locked for staff. Ask admin if something needs changing.
        </div>

        {/* Party & Remarks */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Vendor / Party
          </span>
          <h4 className="text-sm font-bold text-slate-900">{entry.party_name}</h4>
          <p className="text-xs text-slate-600 font-mono mt-1">{entry.remarks}</p>
        </div>

        {/* Vehicle & Weight Formula */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Weighbridge Weights
          </span>
          <p className="text-xs text-slate-600">
            Vehicle: <strong className="font-mono text-slate-800">{entry.vehicle_no}</strong>
          </p>
          <div className="font-mono text-xs font-bold text-slate-800 pt-1">
            {Number(entry.gross_loaded_kg).toLocaleString()} − {Number(entry.empty_tare_kg).toLocaleString()} − {Number(entry.ice_water_kg || 0).toLocaleString()} ={' '}
            <span className="text-emerald-700 text-sm font-black">{Number(entry.net_kg).toLocaleString()} kg</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

