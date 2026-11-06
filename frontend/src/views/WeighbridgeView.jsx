import React, { useState, useMemo } from 'react';
import {
  Scale,
  Truck,
  Users,
  Fish,
  Plus,
  Trash2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { useParties, useVehicles, useFishTypes } from '../hooks/useMasters';
import { api } from '../services/api';
import { saveOfflineEntry } from '../services/db';
import NumericKeypad from '../components/common/NumericKeypad';

const FISH_CHIPS = ['CHAMBAN', 'SARDINE', 'KODANDE', 'MURU HEAD', 'GOLAI', 'THONDE', 'AILE', 'DISCO', 'MIX', 'PAMBOL', 'THAKATTE'];
const RECENT_VEHICLES = ['KL 59Z 5206', 'KA 19D 7628', 'KA 19AE 6136', 'KA 09C 8942'];

export default function WeighbridgeView({ onEntryCreated, editEntry = null, onCancel }) {
  const { activeBranchId, activeBranch } = useBranch();

  // Master Data hooks
  const { data: partiesList = [], refetch: refetchParties } = useParties(activeBranchId);
  const { data: vehiclesList = [] } = useVehicles(activeBranchId);

  // Workflow Step: 'fish' (Step 1: Fish & Remarks) | 'weights' (Step 2: Vehicle & Weights)
  const [step, setStep] = useState('fish');

  // Step 1 State: Fish & Remarks
  const [entryDate, setEntryDate] = useState(() => {
    return editEntry?.entry_date || new Date().toISOString().split('T')[0];
  });
  const [partySearch, setPartySearch] = useState(() => editEntry?.party_name || '');
  const [selectedParty, setSelectedParty] = useState(() => {
    if (editEntry?.party_id) {
      return { id: editEntry.party_id, name: editEntry.party_name };
    }
    return null;
  });

  // Lines: [{ boxes: '64', parts: [{ fish: 'CHAMBAN', pct: '100', c: '20' }] }]
  const [lines, setLines] = useState(() => {
    if (editEntry && Array.isArray(editEntry.boxes) && editEntry.boxes.length > 0) {
      return editEntry.boxes.map((b) => ({
        boxes: String(b.box_count || 1),
        parts: [{ fish: b.fish_name, pct: String(b.mix_percentage || 100), c: '' }],
      }));
    }
    return [{ boxes: '', parts: [{ fish: 'CHAMBAN', pct: '100', c: '' }] }];
  });

  const [mixTargetIndex, setMixTargetIndex] = useState(null);
  const [otherFishInput, setOtherFishInput] = useState('');
  const [showOtherInput, setShowOtherInput] = useState(false);

  // Step 2 State: Vehicle & Weights
  const [slipNo, setSlipNo] = useState(() => editEntry?.slip_no || '');
  const [vehicleNo, setVehicleNo] = useState(() => editEntry?.vehicle_no || '');
  const [grossLoaded, setGrossLoaded] = useState(() => String(editEntry?.gross_loaded_kg || ''));
  const [emptyTare, setEmptyTare] = useState(() => String(editEntry?.empty_tare_kg || ''));
  const [iceWater, setIceWater] = useState(() => String(editEntry?.ice_water_kg || '0'));
  const [weightField, setWeightField] = useState('loaded'); // 'slip' | 'loaded' | 'empty' | 'ice'

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-computed Net Weight
  const loadedVal = parseFloat(grossLoaded) || 0;
  const emptyVal = parseFloat(emptyTare) || 0;
  const iceVal = parseFloat(iceWater) || 0;
  const netWeight = loadedVal - emptyVal - iceVal;
  const weightsValid = loadedVal > 0 && emptyVal > 0 && emptyVal < loadedVal && netWeight >= 0;

  // Filter parties by search
  const filteredParties = useMemo(() => {
    const q = partySearch.trim().toUpperCase();
    if (!q) return partiesList.map((p) => p.name);
    return partiesList
      .map((p) => p.name)
      .filter((name) => name.toUpperCase().includes(q));
  }, [partySearch, partiesList]);

  // Compute live Remarks text
  const previewRemarks = useMemo(() => {
    return lines
      .filter((l) => l.boxes && l.parts.length > 0)
      .map((l) => {
        if (l.parts.length === 1 && parseFloat(l.parts[0].pct) >= 100) {
          return [l.boxes, l.parts[0].fish, l.parts[0].c ? `${l.parts[0].c}C` : ''].filter(Boolean).join(' ');
        }
        return `${l.boxes} ` + l.parts.map((p) => [p.fish, `${p.pct}%`, p.c ? `${p.c}C` : ''].filter(Boolean).join(' ')).join(' + ');
      })
      .join(', ');
  }, [lines]);

  // Handle adding fish species to lines
  const handleAddFish = (fishName) => {
    if (mixTargetIndex !== null) {
      // Mix into target line
      setLines((prev) => {
        const next = [...prev];
        next[mixTargetIndex].parts.push({ fish: fishName, pct: '50', c: '' });
        // adjust first part to 50%
        if (next[mixTargetIndex].parts[0]) {
          next[mixTargetIndex].parts[0].pct = '50';
        }
        return next;
      });
      setMixTargetIndex(null);
    } else {
      // Add as standalone box line
      setLines((prev) => [
        ...prev,
        { boxes: '', parts: [{ fish: fishName, pct: '100', c: '' }] },
      ]);
    }
  };

  const handleUpdateBoxCount = (lineIdx, count) => {
    setLines((prev) => {
      const next = [...prev];
      next[lineIdx].boxes = count.replace(/\D/g, '');
      return next;
    });
  };

  const handleUpdatePartPct = (lineIdx, partIdx, pct) => {
    setLines((prev) => {
      const next = [...prev];
      next[lineIdx].parts[partIdx].pct = pct.replace(/\D/g, '');
      return next;
    });
  };

  const handleUpdatePartCount = (lineIdx, partIdx, count) => {
    setLines((prev) => {
      const next = [...prev];
      next[lineIdx].parts[partIdx].c = count.replace(/\D/g, '');
      return next;
    });
  };

  const handleRemovePart = (lineIdx, partIdx) => {
    setLines((prev) => {
      const next = [...prev];
      next[lineIdx].parts.splice(partIdx, 1);
      if (next[lineIdx].parts.length === 0) {
        next.splice(lineIdx, 1);
      }
      return next;
    });
  };

  // Step 1 Validation
  const canProceedToWeights = useMemo(() => {
    if (!partySearch.trim()) return false;
    if (lines.length === 0) return false;
    return lines.every((l) => {
      const bCount = parseInt(l.boxes, 10);
      if (!(bCount > 0)) return false;
      const totalPct = l.parts.reduce((sum, p) => sum + (parseFloat(p.pct) || 0), 0);
      return totalPct === 100;
    });
  }, [partySearch, lines]);

  // Keypad handler for Step 2
  const handleKeypadInput = (val) => {
    if (weightField === 'slip') setSlipNo(val);
    else if (weightField === 'loaded') setGrossLoaded(val);
    else if (weightField === 'empty') setEmptyTare(val);
    else if (weightField === 'ice') setIceWater(val);
  };

  const getActiveWeightValue = () => {
    if (weightField === 'slip') return slipNo;
    if (weightField === 'loaded') return grossLoaded;
    if (weightField === 'empty') return emptyTare;
    if (weightField === 'ice') return iceWater;
    return '';
  };

  const handleKeypadDone = () => {
    if (weightField === 'slip') setWeightField('loaded');
    else if (weightField === 'loaded') setWeightField('empty');
    else if (weightField === 'empty') setWeightField('ice');
  };

  // Submit Weighbridge Entry
  const handleSaveAndSend = async () => {
    if (!vehicleNo.trim()) {
      setErrorMessage('Vehicle number is required');
      return;
    }
    if (!weightsValid) {
      setErrorMessage('Please verify weights: Loaded and Empty must be positive, and Empty must be less than Loaded.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    // Flatten box lot lines for backend schema
    const boxesPayload = [];
    lines.forEach((l) => {
      const bCount = parseInt(l.boxes, 10) || 1;
      l.parts.forEach((p) => {
        boxesPayload.push({
          fish_name: p.fish,
          box_count: bCount,
          mix_percentage: parseFloat(p.pct) || 100,
        });
      });
    });

    const payload = {
      entry_date: entryDate,
      party_name: partySearch.trim(),
      vehicle_no: vehicleNo.trim().toUpperCase(),
      gross_loaded_kg: loadedVal,
      empty_tare_kg: emptyVal,
      ice_water_kg: iceVal,
      remarks: previewRemarks,
      boxes: boxesPayload,
    };

    try {
      if (navigator.onLine) {
        const res = await api.post('/entries', payload);
        if (onEntryCreated) onEntryCreated(res.data);
      } else {
        const offlineEntry = {
          ...payload,
          tempId: `offline_${Date.now()}`,
          branchId: activeBranchId,
          createdAt: new Date().toISOString(),
          status: 'OFFLINE_PENDING',
        };
        await saveOfflineEntry(offlineEntry);
        if (onEntryCreated) onEntryCreated(offlineEntry);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to save weighbridge entry');
    } finally {
      setSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // STEP 1: FISH & REMARKS
  // --------------------------------------------------------------------------
  if (step === 'fish') {
    return (
      <div className="space-y-4 max-w-xl mx-auto">
        {/* Step Header */}
        <div className="light-card p-4 rounded-2xl flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900">
              {editEntry ? 'Edit Intake Slip' : 'New Weighbridge Entry'}
            </h2>
            <p className="text-xs text-slate-500">Step 1: Fish &amp; Remarks</p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
            Step 1 of 2
          </span>
        </div>

        {/* Date Selector */}
        <div className="light-card p-4 rounded-2xl">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            Date
          </label>
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Party / Vendor Search & Quick Chips */}
        <div className="light-card p-4 rounded-2xl space-y-2.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            Party / Vendor · Required
          </label>
          <input
            type="text"
            placeholder="Search or type vendor name"
            value={partySearch}
            onChange={(e) => setPartySearch(e.target.value.toUpperCase())}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-amber-500"
          />

          {/* Chips */}
          <div className="flex flex-wrap gap-1.5 pt-1 max-h-32 overflow-y-auto">
            {filteredParties.map((pName) => {
              const isSelected = partySearch === pName;
              return (
                <button
                  key={pName}
                  type="button"
                  onClick={() => setPartySearch(pName)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  {pName}
                </button>
              );
            })}
            {partySearch.trim() && !filteredParties.includes(partySearch.trim()) && (
              <button
                type="button"
                onClick={() => setPartySearch(partySearch.trim())}
                className="text-xs font-bold px-3 py-1.5 rounded-xl border border-dashed border-amber-400 bg-amber-50 text-amber-800"
              >
                + Add "{partySearch.trim()}"
              </button>
            )}
          </div>
        </div>

        {/* Remarks: Fish Box Lines */}
        <div className="light-card p-4 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Remarks: What's Loaded · Required
            </label>
            <span className="text-[11px] text-slate-400">Boxes &amp; Mix %</span>
          </div>

          {/* Box Header columns */}
          {lines.length > 0 && (
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2">
              <span className="flex-1">Fish</span>
              <span className="w-14 text-center">Boxes</span>
              <span className="w-12 text-center">%</span>
              <span className="w-14 text-center">Count</span>
              <span className="w-6"></span>
            </div>
          )}

          {/* Lines */}
          <div className="space-y-2">
            {lines.map((line, li) => {
              const totalPct = line.parts.reduce((acc, p) => acc + (parseFloat(p.pct) || 0), 0);
              const pctWarn = line.parts.length > 1 && totalPct !== 100;

              return (
                <div key={li} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  {line.parts.map((part, pi) => (
                    <div key={pi} className="flex items-center gap-2">
                      <span className="flex-1 text-xs font-bold text-slate-900 truncate">
                        {part.fish}
                      </span>

                      {/* Boxes count (only first part displays box count) */}
                      {pi === 0 ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="0"
                          value={line.boxes}
                          onChange={(e) => handleUpdateBoxCount(li, e.target.value)}
                          className="w-14 bg-white border border-slate-300 rounded-lg py-1.5 text-center font-mono font-bold text-xs text-slate-900"
                        />
                      ) : (
                        <span className="w-14 text-center text-[10px] text-slate-400 font-medium">
                          same box
                        </span>
                      )}

                      {/* Mix % */}
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="%"
                        value={part.pct}
                        onChange={(e) => handleUpdatePartPct(li, pi, e.target.value)}
                        className="w-12 bg-white border border-slate-300 rounded-lg py-1.5 text-center font-mono font-bold text-xs text-slate-900"
                      />

                      {/* Count / C value */}
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={part.c}
                        onChange={(e) => handleUpdatePartCount(li, pi, e.target.value)}
                        className="w-14 bg-white border border-slate-300 rounded-lg py-1.5 text-center font-mono font-bold text-xs text-slate-900"
                      />

                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={() => handleRemovePart(li, pi)}
                        className="w-6 text-slate-400 hover:text-rose-600 text-sm font-bold"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <div className="flex items-center justify-between pt-1 text-[11px]">
                    {pctWarn ? (
                      <span className="text-amber-700 font-bold">
                        Mix must total 100% (now {totalPct}%)
                      </span>
                    ) : (
                      <span></span>
                    )}
                    <button
                      type="button"
                      onClick={() => setMixTargetIndex(mixTargetIndex === li ? null : li)}
                      className="text-amber-700 hover:text-amber-800 font-semibold underline"
                    >
                      {mixTargetIndex === li ? 'Cancel mix' : '+ Mix another fish in this box'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mix prompt if active */}
          {mixTargetIndex !== null && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium">
              Tap a fish below to mix into Box #{mixTargetIndex + 1}
            </div>
          )}

          {/* Add Fish Species Chips */}
          <div className="pt-2">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Tap to Add Fish
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FISH_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleAddFish(chip)}
                  className="touch-key text-xs font-bold px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 active:bg-slate-100 shadow-sm"
                >
                  {chip}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowOtherInput(!showOtherInput)}
                className="touch-key text-xs font-semibold px-3 py-1.5 rounded-xl border border-dashed border-slate-300 text-slate-600"
              >
                Other…
              </button>
            </div>

            {showOtherInput && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  placeholder="Fish name"
                  value={otherFishInput}
                  onChange={(e) => setOtherFishInput(e.target.value.toUpperCase())}
                  className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (otherFishInput.trim()) {
                      handleAddFish(otherFishInput.trim());
                      setOtherFishInput('');
                      setShowOtherInput(false);
                    }
                  }}
                  className="px-4 py-1.5 bg-amber-500 text-white rounded-xl text-xs font-bold"
                >
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Remarks Preview Card */}
          <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 mt-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              Remarks as it will appear
            </span>
            <p className="font-mono text-xs font-bold text-slate-800">
              {previewRemarks || 'Nothing specified yet'}
            </p>
          </div>
        </div>

        {/* Step 1 Next Button */}
        <button
          type="button"
          onClick={() => setStep('weights')}
          disabled={!canProceedToWeights}
          className="touch-key w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <span>Next: Vehicle and weights</span>
          <ArrowRight className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // STEP 2: VEHICLE AND WEIGHTS
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-4 max-w-xl mx-auto">
      {/* Header with Back to Step 1 */}
      <div className="light-card p-4 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setStep('fish')}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-base font-black text-slate-900">Vehicle &amp; Weights</h2>
            <p className="text-xs text-slate-500">Step 2: Gate Scale Capture</p>
          </div>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
          Step 2 of 2
        </span>
      </div>

      {/* Slip Overview */}
      <div className="light-card p-3 rounded-xl flex items-center justify-between text-xs">
        <div>
          <span className="text-slate-400 font-medium">Party: </span>
          <strong className="text-slate-900 font-bold">{partySearch}</strong>
        </div>
        <div className="text-slate-500 font-mono font-semibold truncate max-w-[200px]">
          {previewRemarks}
        </div>
      </div>

      {/* Slip No & Vehicle No Input */}
      <div className="light-card p-4 rounded-2xl space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {/* Optional Slip No */}
          <div
            onClick={() => setWeightField('slip')}
            className={`p-2.5 rounded-xl border cursor-pointer ${
              weightField === 'slip' ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-100' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Slip No</span>
            <span className="font-mono font-bold text-sm text-slate-800">{slipNo || '—'}</span>
          </div>

          {/* Vehicle No */}
          <div className="col-span-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Vehicle No · Required
            </span>
            <input
              type="text"
              placeholder="e.g. KL 59Z 5206"
              value={vehicleNo}
              onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold uppercase text-slate-900 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Quick Recent Vehicles */}
        <div className="flex gap-1.5 overflow-x-auto pt-1">
          {RECENT_VEHICLES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVehicleNo(v)}
              className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg border whitespace-nowrap ${
                vehicleNo === v
                  ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Gross, Tare, Ice/Water Cards */}
      <div className="grid grid-cols-3 gap-2">
        {/* Loaded */}
        <div
          onClick={() => setWeightField('loaded')}
          className={`p-3 rounded-2xl border cursor-pointer select-none transition-all touch-key ${
            weightField === 'loaded'
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-100 shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Loaded (kg)
          </div>
          <div className="text-xl font-mono font-black text-slate-900 truncate mt-1">
            {grossLoaded ? Number(grossLoaded).toLocaleString() : '0'}
          </div>
        </div>

        {/* Empty */}
        <div
          onClick={() => setWeightField('empty')}
          className={`p-3 rounded-2xl border cursor-pointer select-none transition-all touch-key ${
            weightField === 'empty'
              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-100 shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Empty (kg)
          </div>
          <div className="text-xl font-mono font-black text-slate-900 truncate mt-1">
            {emptyTare ? Number(emptyTare).toLocaleString() : '0'}
          </div>
        </div>

        {/* Ice / Water */}
        <div
          onClick={() => setWeightField('ice')}
          className={`p-3 rounded-2xl border cursor-pointer select-none transition-all touch-key ${
            weightField === 'ice'
              ? 'bg-slate-100 border-slate-400 ring-2 ring-slate-200 shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Ice / Water
          </div>
          <div className="text-xl font-mono font-black text-slate-900 truncate mt-1">
            {iceWater ? Number(iceWater).toLocaleString() : '0'}
          </div>
        </div>
      </div>

      {/* Calculated Net Weight Card */}
      <div
        className={`p-4 rounded-2xl border ${
          weightsValid
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
            : loadedVal > 0 && emptyVal > 0 && emptyVal >= loadedVal
            ? 'bg-rose-50 border-rose-300 text-rose-900'
            : 'bg-slate-100 border-slate-200 text-slate-700'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider opacity-80">
              Net Weight (Calculated)
            </div>
            <div className="font-mono text-xs opacity-75 mt-0.5">
              {Number(loadedVal).toLocaleString()} − {Number(emptyVal).toLocaleString()} − {Number(iceVal).toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <span className="font-mono font-black text-2xl">{weightsValid ? Number(netWeight).toLocaleString() : '0'}</span>
            <span className="text-xs font-semibold ml-1">kg</span>
          </div>
        </div>

        {/* Validation message */}
        <div className="text-[11px] font-semibold mt-2 pt-2 border-t border-slate-200/50">
          {emptyVal >= loadedVal && loadedVal > 0 ? (
            <span className="text-rose-700">✗ Empty weight cannot be greater than or equal to loaded weight</span>
          ) : weightsValid ? (
            <span className="text-emerald-700">✓ Empty is less than loaded</span>
          ) : (
            <span>Enter loaded and empty weights</span>
          )}
        </div>
      </div>

      {/* On-screen Keypad */}
      <div className="light-card p-3 rounded-2xl">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Keypad Field: <strong className="text-slate-800">{weightField.toUpperCase()}</strong>
          </span>
          <span className="text-xs font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            {getActiveWeightValue() || '0'}
          </span>
        </div>

        <NumericKeypad
          value={getActiveWeightValue()}
          onChange={handleKeypadInput}
          onDone={handleKeypadDone}
          onClear={() => handleKeypadInput('')}
          allowDecimal={false}
          quickChips={[
            { label: '50', value: 50 },
            { label: '100', value: 100 },
            { label: '500', value: 500 },
            { label: '1000', value: 1000 },
          ]}
        />
      </div>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Action Submit Button */}
      <button
        type="button"
        onClick={handleSaveAndSend}
        disabled={submitting || !weightsValid || !vehicleNo.trim()}
        className="touch-key w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-40"
      >
        <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
        {submitting ? 'Sending to Admin...' : 'Send to admin for rate →'}
      </button>
    </div>
  );
}
