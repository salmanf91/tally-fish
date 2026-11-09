import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import {
  useParties,
  useVehicles,
  useFishTypes,
  useCreateQuickParty,
  useCreateQuickVehicle,
  useCreateQuickFishType,
} from '../hooks/useMasters';
import { api } from '../services/api';
import { saveOfflineEntry } from '../services/db';
import { registerBackgroundSync } from '../services/syncManager';
import NumericKeypad from '../components/common/NumericKeypad';

const DEFAULT_FISH_SPECIES = ['CHAMBAN', 'SARDINE', 'KODANDE', 'MURU HEAD', 'GOLAI', 'THONDE', 'AILE', 'DISCO', 'MIX', 'PAMBOL', 'THAKATTE'];
const DEFAULT_VEHICLES = ['KL 59Z 5206', 'KA 19D 7628', 'KA 19AE 6136', 'KA 09C 8942'];

const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function WeighbridgeView({ onEntryCreated, editEntry = null, onCancel }) {
  const { activeBranchId, activeBranch } = useBranch();
  const queryClient = useQueryClient();

  // Master Data hooks (dynamic from PostgreSQL & cached in IndexedDB)
  const { data: partiesList = [], refetch: refetchParties } = useParties(activeBranchId);
  const { data: vehiclesList = [] } = useVehicles(activeBranchId);
  const { data: fishTypesList = [] } = useFishTypes(activeBranchId);

  // Quick-creation mutations on the fly
  const createPartyMutation = useCreateQuickParty(activeBranchId);
  const createFishTypeMutation = useCreateQuickFishType(activeBranchId);
  const createVehicleMutation = useCreateQuickVehicle(activeBranchId);

  // Dynamic quick-pick fish chips combining DB masters & defaults
  const dynamicFishChips = useMemo(() => {
    const fromDb = fishTypesList.map((f) => f.name.toUpperCase());
    const combined = new Set([...fromDb, ...DEFAULT_FISH_SPECIES]);
    return Array.from(combined);
  }, [fishTypesList]);

  // Dynamic quick-pick vehicle chips combining DB masters & defaults
  const dynamicVehicleChips = useMemo(() => {
    const fromDb = vehiclesList.map((v) => v.vehicle_no.toUpperCase());
    const combined = new Set([...fromDb, ...DEFAULT_VEHICLES]);
    return Array.from(combined).slice(0, 10);
  }, [vehiclesList]);

  // Workflow Step: 'fish' (Step 1: Fish & Remarks) | 'weights' (Step 2: Vehicle & Weights)
  const [step, setStep] = useState('fish');

  // Step 1 State: Fish & Remarks
  const [entryDate, setEntryDate] = useState(() => {
    return editEntry?.entry_date ? editEntry.entry_date.split('T')[0] : getLocalDateString();
  });
  const [partySearch, setPartySearch] = useState(() => editEntry?.party_name || '');
  const [selectedParty, setSelectedParty] = useState(() => {
    if (editEntry?.party_id) {
      return { id: editEntry.party_id, name: editEntry.party_name };
    }
    return null;
  });

  const parseEntryLines = (entry) => {
    if (!entry) return [{ boxes: '', parts: [{ fish: 'CHAMBAN', pct: '', c: '' }] }];

    // 1. Try parsing remarks if present (handles grouped fish with counts seamlessly)
    if (entry.remarks && typeof entry.remarks === 'string') {
      const lotStrings = entry.remarks.split(',').map((s) => s.trim()).filter(Boolean);
      const parsedLines = [];

      for (const lotStr of lotStrings) {
        const boxMatch = lotStr.match(/^(\d+)\s+(.+)$/);
        if (!boxMatch) continue;
        const boxCount = boxMatch[1];
        const partsStr = boxMatch[2];
        const partItems = partsStr.split('+').map((p) => p.trim()).filter(Boolean);

        const parts = partItems.map((pStr) => {
          const pctMatch = pStr.match(/(\d+(?:\.\d+)?)\s*%/);
          const cMatch = pStr.match(/(\d+)\s*C/i);

          let fish = pStr;
          if (pctMatch) fish = fish.replace(pctMatch[0], '');
          if (cMatch) fish = fish.replace(cMatch[0], '');
          fish = fish.trim();

          return {
            fish: fish,
            pct: pctMatch ? pctMatch[1] : partItems.length === 1 ? '100' : '',
            c: cMatch ? cMatch[1] : '',
          };
        });

        parsedLines.push({
          boxes: boxCount,
          parts,
        });
      }

      if (parsedLines.length > 0) {
        return parsedLines;
      }
    }

    // 2. Fallback: Group by box_group_id if present in entry.boxes
    if (Array.isArray(entry.boxes) && entry.boxes.length > 0) {
      const groups = {};
      entry.boxes.forEach((b, idx) => {
        const gId = b.box_group_id || `box_${b.box_count}_${idx}`;
        if (!groups[gId]) {
          groups[gId] = {
            boxes: String(b.box_count || ''),
            parts: [],
          };
        }
        groups[gId].parts.push({
          fish: b.fish_name,
          pct: b.mix_percentage ? String(b.mix_percentage) : '',
          c: b.fish_count ? String(b.fish_count) : '',
        });
      });
      return Object.values(groups);
    }

    return [{ boxes: '', parts: [{ fish: 'CHAMBAN', pct: '', c: '' }] }];
  };

  // Lines: [{ boxes: '64', parts: [{ fish: 'CHAMBAN', pct: '100', c: '20' }] }]
  const [lines, setLines] = useState(() => parseEntryLines(editEntry));

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
        if (l.parts.length === 1 && (!l.parts[0].pct || parseFloat(l.parts[0].pct) >= 100)) {
          return [l.boxes, l.parts[0].fish, l.parts[0].c ? `${l.parts[0].c}C` : ''].filter(Boolean).join(' ');
        }
        return `${l.boxes} ` + l.parts.map((p) => [p.fish, p.pct ? `${p.pct}%` : '', p.c ? `${p.c}C` : ''].filter(Boolean).join(' ')).join(' + ');
      })
      .join(', ');
  }, [lines]);

  // Handle adding fish species to lines
  const handleAddFish = (fishName) => {
    if (mixTargetIndex !== null) {
      const targetIdx = mixTargetIndex;
      const targetLine = lines[targetIdx];
      const targetTotal = targetLine
        ? targetLine.parts.reduce((sum, p) => sum + (parseFloat(p.pct) || 0), 0)
        : 0;

      // If box is already 100%, do not allow adding another fish (Point 1)
      if (targetTotal >= 100) {
        setMixTargetIndex(null);
        return;
      }

      setMixTargetIndex(null);
      // Mix into target line immutably - keep pct empty initially (Point 2)
      setLines((prev) =>
        prev.map((line, idx) => {
          if (idx !== targetIdx) return line;
          return {
            ...line,
            parts: [...line.parts, { fish: fishName, pct: '', c: '' }],
          };
        })
      );
    } else {
      // Add as standalone box line immutably - keep pct empty initially (Point 2)
      setLines((prev) => [
        ...prev,
        { boxes: '', parts: [{ fish: fishName, pct: '', c: '' }] },
      ]);
    }
  };

  const handleUpdateBoxCount = (lineIdx, count) => {
    const clean = count.replace(/\D/g, '');
    setLines((prev) =>
      prev.map((line, idx) => (idx === lineIdx ? { ...line, boxes: clean } : line))
    );
  };

  const handleUpdatePartPct = (lineIdx, partIdx, pct) => {
    const clean = pct.replace(/\D/g, '');
    setLines((prev) =>
      prev.map((line, idx) => {
        if (idx !== lineIdx) return line;
        return {
          ...line,
          parts: line.parts.map((part, pIdx) =>
            pIdx === partIdx ? { ...part, pct: clean } : part
          ),
        };
      })
    );
  };

  const handleUpdatePartCount = (lineIdx, partIdx, count) => {
    const clean = count.replace(/\D/g, '');
    setLines((prev) =>
      prev.map((line, idx) => {
        if (idx !== lineIdx) return line;
        return {
          ...line,
          parts: line.parts.map((part, pIdx) =>
            pIdx === partIdx ? { ...part, c: clean } : part
          ),
        };
      })
    );
  };

  const handleRemovePart = (lineIdx, partIdx) => {
    setLines((prev) =>
      prev
        .map((line, idx) => {
          if (idx !== lineIdx) return line;
          return {
            ...line,
            parts: line.parts.filter((_, pIdx) => pIdx !== partIdx),
          };
        })
        .filter((line) => line.parts.length > 0)
    );
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

    // Flatten box lot lines for backend schema with box_group_id and fish_count
    const boxesPayload = [];
    lines.forEach((l, lotIdx) => {
      const bCount = parseInt(l.boxes, 10) || 1;
      l.parts.forEach((p) => {
        boxesPayload.push({
          fish_name: p.fish,
          box_count: bCount,
          mix_percentage: parseFloat(p.pct) || 100,
          fish_count: p.c ? parseInt(p.c, 10) : null,
          box_group_id: lotIdx + 1,
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
        const res = editEntry
          ? await api.put(`/entries/${editEntry.id}`, payload)
          : await api.post('/entries', payload);
        await queryClient.invalidateQueries({ queryKey: ['entries'] });
        if (onEntryCreated) onEntryCreated(res.data);
      } else {
        const offlineEntry = {
          ...payload,
          id: editEntry?.id,
          tempId: editEntry?.tempId || `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          branchId: activeBranchId,
          createdAt: new Date().toISOString(),
          status: 'QUEUED_SYNC',
        };
        await saveOfflineEntry(offlineEntry);
        await registerBackgroundSync();
        await queryClient.invalidateQueries({ queryKey: ['entries'] });
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
          <div className="flex items-center gap-3">
            {editEntry && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900"
                title="Cancel Edit"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h2 className="text-base font-black text-slate-900">
                {editEntry ? 'Edit Intake Slip' : 'New Weighbridge Entry'}
              </h2>
              <p className="text-xs text-slate-500">Step 1: Fish &amp; Remarks</p>
            </div>
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
                disabled={createPartyMutation.isPending}
                onClick={async () => {
                  const newName = partySearch.trim();
                  try {
                    await createPartyMutation.mutateAsync({ name: newName });
                  } catch (err) {
                    console.warn('[Weighbridge] Party quick-creation:', err.message);
                  }
                  setPartySearch(newName);
                }}
                className="text-xs font-bold px-3 py-1.5 rounded-xl border border-dashed border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-all flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add "{partySearch.trim()}" to Masters
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
                    ) : totalPct >= 100 ? (
                      <span className="text-emerald-700 font-semibold">
                        ✓ 100% complete
                      </span>
                    ) : (
                      <span></span>
                    )}

                    {totalPct >= 100 ? (
                      mixTargetIndex === li ? (
                        <button
                          type="button"
                          onClick={() => setMixTargetIndex(null)}
                          className="text-slate-500 hover:text-slate-700 font-semibold underline"
                        >
                          Cancel mix
                        </button>
                      ) : null
                    ) : (
                      <button
                        type="button"
                        onClick={() => setMixTargetIndex(mixTargetIndex === li ? null : li)}
                        className="text-amber-700 hover:text-amber-800 font-semibold underline"
                      >
                        {mixTargetIndex === li ? 'Cancel mix' : '+ Mix another fish in this box'}
                      </button>
                    )}
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
              {dynamicFishChips.map((chip) => (
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
                  placeholder="Fish species name"
                  value={otherFishInput}
                  onChange={(e) => setOtherFishInput(e.target.value.toUpperCase())}
                  className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900"
                />
                <button
                  type="button"
                  disabled={createFishTypeMutation.isPending || !otherFishInput.trim()}
                  onClick={async () => {
                    if (otherFishInput.trim()) {
                      const fishName = otherFishInput.trim().toUpperCase();
                      try {
                        await createFishTypeMutation.mutateAsync({ name: fishName });
                      } catch (err) {
                        console.warn('[Weighbridge] Fish quick-creation:', err.message);
                      }
                      handleAddFish(fishName);
                      setOtherFishInput('');
                      setShowOtherInput(false);
                    }
                  }}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-40"
                >
                  {createFishTypeMutation.isPending ? 'Saving...' : 'Add to Catalog'}
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Optional Slip No */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Slip No (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. SL-001"
              value={slipNo}
              onChange={(e) => setSlipNo(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Vehicle No */}
          <div className="sm:col-span-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Vehicle No · Required
            </label>
            <input
              type="text"
              placeholder="e.g. KL 59Z 5206"
              value={vehicleNo}
              onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Quick Recent Vehicles from Masters DB */}
        <div className="flex gap-1.5 overflow-x-auto pt-1">
          {dynamicVehicleChips.map((v) => (
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
          {vehicleNo.trim() && !dynamicVehicleChips.includes(vehicleNo.trim()) && (
            <button
              type="button"
              disabled={createVehicleMutation.isPending}
              onClick={async () => {
                try {
                  await createVehicleMutation.mutateAsync({ vehicle_no: vehicleNo.trim() });
                } catch (err) {
                  console.warn('[Weighbridge] Vehicle quick-creation:', err.message);
                }
              }}
              className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg border border-dashed border-amber-400 bg-amber-50 text-amber-800 whitespace-nowrap"
            >
              + Save "{vehicleNo.trim()}" to Masters
            </button>
          )}
        </div>
      </div>

      {/* Gross, Tare, Ice/Water Cards with Direct Keyboard Entry */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Loaded */}
        <div className="light-card p-3.5 rounded-2xl border border-amber-200 bg-amber-50/40 focus-within:ring-2 focus-within:ring-amber-400">
          <label className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block mb-1">
            Loaded (kg) *
          </label>
          <input
            type="number"
            min="0"
            step="any"
            placeholder="0"
            value={grossLoaded}
            onChange={(e) => setGrossLoaded(e.target.value)}
            className="w-full text-xl font-mono font-black text-slate-900 bg-white border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Empty */}
        <div className="light-card p-3.5 rounded-2xl border border-blue-200 bg-blue-50/40 focus-within:ring-2 focus-within:ring-blue-400">
          <label className="text-[10px] font-bold uppercase tracking-wider text-blue-900 block mb-1">
            Empty Tare (kg) *
          </label>
          <input
            type="number"
            min="0"
            step="any"
            placeholder="0"
            value={emptyTare}
            onChange={(e) => setEmptyTare(e.target.value)}
            className="w-full text-xl font-mono font-black text-slate-900 bg-white border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Ice / Water */}
        <div className="light-card p-3.5 rounded-2xl border border-slate-200 bg-slate-50 focus-within:ring-2 focus-within:ring-slate-400">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block mb-1">
            Ice / Water Deduction (kg)
          </label>
          <input
            type="number"
            min="0"
            step="any"
            placeholder="0"
            value={iceWater}
            onChange={(e) => setIceWater(e.target.value)}
            className="w-full text-xl font-mono font-black text-slate-900 bg-white border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-slate-400"
          />
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
        {submitting
          ? editEntry
            ? 'Saving Changes...'
            : 'Sending to Admin...'
          : editEntry
          ? 'Save Changes →'
          : 'Send to admin for rate →'}
      </button>
    </div>
  );
}
