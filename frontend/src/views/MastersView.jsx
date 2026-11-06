import React, { useState } from 'react';
import { Users, Truck, Fish, GitMerge, Check } from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { useAuth } from '../context/AuthContext';
import { useParties, useVehicles, useFishTypes } from '../hooks/useMasters';
import { api } from '../services/api';

export default function MastersView() {
  const { activeBranchId, activeBranch } = useBranch();
  const { isOwner, isBillingAdmin } = useAuth();
  const canCurate = isBillingAdmin(activeBranchId) || isOwner;

  const [activeTab, setActiveTab] = useState('parties');

  const { data: parties = [], refetch: refetchParties } = useParties(activeBranchId);
  const { data: vehicles = [], refetch: refetchVehicles } = useVehicles(activeBranchId);
  const { data: fishTypes = [], refetch: refetchFishTypes } = useFishTypes(activeBranchId);

  // Merge modal state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [sourcePartyId, setSourcePartyId] = useState('');
  const [targetPartyId, setTargetPartyId] = useState('');
  const [mergeStatus, setMergeStatus] = useState(null);

  const handleMergeParties = async () => {
    if (!sourcePartyId || !targetPartyId || sourcePartyId === targetPartyId) {
      setMergeStatus({ error: 'Please select two different vendors to merge' });
      return;
    }

    try {
      await api.post('/masters/parties/merge', {
        sourcePartyId,
        targetPartyId,
      });
      setMergeStatus({ success: 'Vendors merged successfully! Historical slips reassigned.' });
      refetchParties();
      setShowMergeModal(false);
    } catch (err) {
      setMergeStatus({ error: err.message || 'Failed to merge vendors' });
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="light-card p-4 rounded-2xl flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-600" />
            Master Curation & Database Records
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Branch: <span className="font-bold text-slate-800">{activeBranch?.branch_name}</span> | Curate vendor records and merge duplicates
          </p>
        </div>

        {canCurate && activeTab === 'parties' && (
          <button
            onClick={() => setShowMergeModal(true)}
            className="text-xs font-bold px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-center gap-1.5 hover:bg-amber-100 transition-all shadow-sm"
          >
            <GitMerge className="w-4 h-4 text-amber-700" />
            Merge Duplicate Vendors
          </button>
        )}
      </div>

      {mergeStatus?.success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{mergeStatus.success}</span>
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('parties')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'parties'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
          }`}
        >
          Vendors / Parties ({parties.length})
        </button>
        <button
          onClick={() => setActiveTab('vehicles')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'vehicles'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
          }`}
        >
          Vehicles ({vehicles.length})
        </button>
        <button
          onClick={() => setActiveTab('fish')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'fish'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
          }`}
        >
          Fish Species ({fishTypes.length})
        </button>
      </div>

      {/* Tab Contents */}
      <div className="grid grid-cols-1 md:grid-cols-2 desktop:grid-cols-3 gap-3">
        {activeTab === 'parties' &&
          parties.map((p) => (
            <div key={p.id} className="light-card p-4 rounded-2xl flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-900">{p.name}</h4>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{p.code || 'CODE: CCL'}</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                Active
              </span>
            </div>
          ))}

        {activeTab === 'vehicles' &&
          vehicles.map((v) => (
            <div key={v.id} className="light-card p-4 rounded-2xl flex items-center justify-between">
              <div>
                <h4 className="font-mono font-bold text-sm text-blue-700">{v.vehicle_no}</h4>
                <p className="text-xs text-slate-400 mt-0.5">{v.party_name || 'Generic / Freelance'}</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
                Transport
              </span>
            </div>
          ))}

        {activeTab === 'fish' &&
          fishTypes.map((f) => (
            <div key={f.id} className="light-card p-4 rounded-2xl flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-emerald-800">{f.name}</h4>
                <p className="text-xs text-slate-500 font-mono mt-0.5">Default: ₹{f.default_rate || '35.00'}/kg</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                Species
              </span>
            </div>
          ))}
      </div>

      {/* Vendor Merge Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full p-6 rounded-3xl border border-slate-200 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
              <GitMerge className="w-5 h-5 text-amber-600" />
              Merge Duplicate Vendors
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              All historical slips from the duplicate vendor will be reassigned to the primary vendor.
            </p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Duplicate Vendor (will be deactivated):
                </label>
                <select
                  value={sourcePartyId}
                  onChange={(e) => setSourcePartyId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                >
                  <option value="">-- Select Duplicate --</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Primary Clean Vendor (to keep):
                </label>
                <select
                  value={targetPartyId}
                  onChange={(e) => setTargetPartyId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                >
                  <option value="">-- Select Target --</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMergeModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMergeParties}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
              >
                Execute Merge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
