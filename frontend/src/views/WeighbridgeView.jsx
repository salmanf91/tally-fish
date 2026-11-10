import React, { useState, useMemo } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
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
import SearchableSelect from '../components/common/SearchableSelect';
import {
  useParties,
  useVehicles,
  useFishTypes,
  useCreateQuickFishType,
} from '../hooks/useMasters';
import { api } from '../services/api';
import { saveOfflineEntry } from '../services/db';
import { registerBackgroundSync } from '../services/syncManager';

const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function WeighbridgeView({ onEntryCreated, editEntry = null, onCancel }) {
  const { activeBranchId, activeBranch } = useBranch();
  const queryClient = useQueryClient();

  // Master Data hooks (dynamic strictly from PostgreSQL database)
  const { data: partiesList = [], refetch: refetchParties } = useParties(activeBranchId);
  const { data: vehiclesList = [] } = useVehicles(activeBranchId);
  const { data: fishTypesList = [] } = useFishTypes(activeBranchId);

  // Quick-save fish mutation when added via "Other..."
  const createFishTypeMutation = useCreateQuickFishType(activeBranchId);

  // Fetch entries to calculate the top 5 most popular parties, fish species, and vehicles from real DB records
  const { data: entriesList = [] } = useQuery({
    queryKey: ['entries', activeBranchId],
    queryFn: async () => {
      const res = await api.get('/entries');
      return res.data || [];
    },
    enabled: !!activeBranchId,
  });

  // Top 5 Popular Parties from database entries (with fallback to DB masters)
  const popularParties = useMemo(() => {
    const counts = {};
    entriesList.forEach((e) => {
      if (e.party_name) {
        const p = e.party_name.trim();
        counts[p] = (counts[p] || 0) + 1;
      }
    });
    const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const validDBParties = new Set(partiesList.map((p) => p.name.toUpperCase()));
    const result = sorted.filter((name) => validDBParties.has(name.toUpperCase())).slice(0, 5);

    for (const p of partiesList) {
      if (result.length >= 5) break;
      if (!result.includes(p.name)) {
        result.push(p.name);
      }
    }
    return result;
  }, [entriesList, partiesList]);

  // Top 5 Popular Fish species from database entries (with fallback to DB masters)
  const popularFish = useMemo(() => {
    const counts = {};
    entriesList.forEach((e) => {
      if (Array.isArray(e.boxes)) {
        e.boxes.forEach((b) => {
          if (b.fish_name) {
            const f = b.fish_name.trim().toUpperCase();
            counts[f] = (counts[f] || 0) + 1;
          }
        });
      }
    });
    const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const validDBFish = new Set(fishTypesList.map((f) => f.name.toUpperCase()));
    const result = sorted.filter((f) => validDBFish.has(f)).slice(0, 5);

    for (const f of fishTypesList) {
      if (result.length >= 5) break;
      const u = f.name.toUpperCase();
      if (!result.includes(u)) {
        result.push(u);
      }
    }
    return result;
  }, [entriesList, fishTypesList]);

  // Top 5 Popular Vehicles from database entries (with fallback to DB masters)
  const popularVehicles = useMemo(() => {
    const counts = {};
    entriesList.forEach((e) => {
      if (e.vehicle_no) {
        const v = e.vehicle_no.trim().toUpperCase();
        counts[v] = (counts[v] || 0) + 1;
      }
    });
    const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const validDBVehicles = new Set(vehiclesList.map((v) => v.vehicle_no.toUpperCase()));
    const result = sorted.filter((v) => validDBVehicles.has(v)).slice(0, 5);

    for (const v of vehiclesList) {
      if (result.length >= 5) break;
      const u = v.vehicle_no.toUpperCase();
      if (!result.includes(u)) {
        result.push(u);
      }
    }
    return result;
  }, [entriesList, vehiclesList]);

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

    return [{ boxes: '', parts: [{ fish: 'CHAMBAN', pct: '100', c: '' }] }];
  };

  // Lines: [{ boxes: '64', parts: [{ fish: 'CHAMBAN', pct: '100', c: '20' }] }]
  const [lines, setLines] = useState(() => parseEntryLines(editEntry));

  const [mixTargetIndex, setMixTargetIndex] = useState(null);
  const [otherFishInput, setOtherFishInput] = useState('');
  const [showOtherInput, setShowOtherInput] = useState(false);

  // Compute incrementally auto-generated slip number
  const nextDailySlNo = useMemo(() => {
    if (editEntry?.daily_sl_no) return editEntry.daily_sl_no;
    const todayStr = new Date().toISOString().split('T')[0];
    const todayEntries = (entriesList || []).filter((e) => {
      const eDate = e.entry_date ? new Date(e.entry_date).toISOString().split('T')[0] : '';
      return eDate === todayStr;
    });
    if (todayEntries.length === 0) return 1;
    const maxSl = Math.max(...todayEntries.map((e) => e.daily_sl_no || 0), 0);
    return maxSl + 1;
  }, [editEntry, entriesList]);

  const autoSlipNo = useMemo(() => {
    if (editEntry?.slip_no) return editEntry.slip_no;
    if (editEntry?.daily_sl_no) return `SL-${String(editEntry.daily_sl_no).padStart(3, '0')}`;
    return `SL-${String(nextDailySlNo).padStart(3, '0')}`;
  }, [editEntry, nextDailySlNo]);

  // Step 2 State: Vehicle & Weights
  const [vehicleNo, setVehicleNo] = useState(() => editEntry?.vehicle_no || '');
  const [grossLoaded, setGrossLoaded] = useState(() => String(editEntry?.gross_loaded_kg || ''));
  const [emptyTare, setEmptyTare] = useState(() => String(editEntry?.empty_tare_kg || ''));
  const [iceWater, setIceWater] = useState(() => String(editEntry?.ice_water_kg || '0'));

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
      // Add as standalone box line immutably - default single species pct to 100
      setLines((prev) => [
        ...prev,
        { boxes: '', parts: [{ fish: fishName, pct: '100', c: '' }] },
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

  // Verify party exists in database masters
  const partyExists = useMemo(() => {
    if (!partySearch.trim()) return false;
    return partiesList.some(
      (p) => p.name.trim().toUpperCase() === partySearch.trim().toUpperCase()
    );
  }, [partySearch, partiesList]);

  // Verify vehicle exists in database masters
  const vehicleExists = useMemo(() => {
    if (!vehicleNo.trim()) return false;
    return vehiclesList.some(
      (v) => v.vehicle_no.trim().toUpperCase() === vehicleNo.trim().toUpperCase()
    );
  }, [vehicleNo, vehiclesList]);

  // Step 1 Validation
  const canProceedToWeights = useMemo(() => {
    if (!partySearch.trim() || !partyExists) return false;
    if (lines.length === 0) return false;
    return lines.every((l) => {
      const bCount = parseInt(l.boxes, 10);
      if (!(bCount > 0)) return false;
      // Single species lot can have empty pct (implied 100%) or exact 100%
      if (l.parts.length === 1 && !l.parts[0].pct) return true;
      const totalPct = l.parts.reduce((sum, p) => sum + (parseFloat(p.pct) || 0), 0);
      return Math.abs(totalPct - 100) < 0.01;
    });
  }, [partySearch, partyExists, lines]);

  // Submit Weighbridge Entry
  const handleSaveAndSend = async () => {
    if (!partyExists) {
      setErrorMessage(`Vendor "${partySearch.trim()}" does not exist in master data. Billing staff must add this vendor first.`);
      return;
    }
    if (!vehicleNo.trim()) {
      setErrorMessage('Vehicle number is required');
      return;
    }
    if (!vehicleExists) {
      setErrorMessage(`Vehicle "${vehicleNo.trim()}" does not exist in master records. Billing staff must register this vehicle first.`);
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
      slip_no: autoSlipNo,
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

        {/* Party / Vendor Select Search Dropdown */}
        <div className="light-card p-4 rounded-2xl space-y-2.5">
          <SearchableSelect
            label="Party / Vendor"
            required
            value={partySearch}
            onChange={(val) => setPartySearch(val)}
            options={partiesList.map((p) => ({
              value: p.name,
              label: p.name,
              subtext: p.code ? `Code: ${p.code}` : undefined,
            }))}
            placeholder="Search or select vendor / client..."
            error={
              partySearch.trim() && !partyExists
                ? `Vendor "${partySearch.trim()}" does not exist in master data. Billing staff must add this vendor first.`
                : null
            }
          />

          {/* Popular Client / Vendor Chips strictly from DB */}
          {popularParties.length > 0 && (
            <div className="pt-0.5">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Popular Vendors
              </div>
              <div className="flex flex-wrap gap-1.5">
                {popularParties.map((pName) => {
                  const isSelected = partySearch === pName;
                  return (
                    <button
                      key={pName}
                      type="button"
                      onClick={() => setPartySearch(pName)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all active:scale-95 shadow-2xs ${
                        isSelected
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm ring-1 ring-amber-400'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {pName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
              const hasAnyPct = line.parts.some((p) => p.pct !== '' && !isNaN(parseFloat(p.pct)));
              const isOver = totalPct > 100;
              const isComplete = totalPct === 100;

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
                          maxLength={5}
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
                        maxLength={3}
                        placeholder="%"
                        value={part.pct}
                        onChange={(e) => handleUpdatePartPct(li, pi, e.target.value)}
                        className="w-12 bg-white border border-slate-300 rounded-lg py-1.5 text-center font-mono font-bold text-xs text-slate-900"
                      />

                      {/* Count / C value */}
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={5}
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
                    {isOver ? (
                      <span className="text-rose-700 font-bold">
                        ✗ Mix exceeds 100% (currently {totalPct}%)
                      </span>
                    ) : isComplete ? (
                      <span className="text-emerald-700 font-semibold">
                        ✓ 100% complete
                      </span>
                    ) : hasAnyPct ? (
                      <span className="text-amber-700 font-bold">
                        Mix must total 100% (currently {totalPct}%)
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        Enter mix %
                      </span>
                    )}

                    {isComplete ? (
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

          {/* Add Fish Species Select Search Dropdown & Quick Chips */}
          <div className="pt-2 space-y-2">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              <span>Select or Add Fish Species</span>
              {mixTargetIndex !== null && (
                <span className="text-amber-700 font-semibold text-[10px] normal-case">
                  Mixing into Box #{mixTargetIndex + 1}
                </span>
              )}
            </div>

            {/* Fish Searchable Select Dropdown */}
            <SearchableSelect
              value=""
              onChange={(selectedFish) => {
                if (selectedFish) {
                  handleAddFish(selectedFish);
                }
              }}
              options={fishTypesList.map((f) => ({
                value: f.name,
                label: f.name,
                subtext: f.code ? `Code: ${f.code}${f.default_rate ? ` · ₹${f.default_rate}/kg` : ''}` : undefined,
              }))}
              placeholder="Search or select fish species..."
              customActionLabel="Other… (Custom Species)"
              onCustomAction={() => setShowOtherInput(true)}
            />

            {/* Popular Fish Species Chips strictly from DB */}
            {popularFish.length > 0 && (
              <div className="pt-0.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Popular Species
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {popularFish.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleAddFish(chip)}
                      className="touch-key text-xs font-bold px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 active:scale-95 shadow-2xs transition-all"
                    >
                      + {chip}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowOtherInput(!showOtherInput)}
                    className="touch-key text-xs font-semibold px-3 py-1.5 rounded-xl border border-dashed border-slate-300 text-slate-600 hover:border-amber-400 hover:text-amber-800 active:scale-95 transition-all"
                  >
                    Other…
                  </button>
                </div>
              </div>
            )}

            {showOtherInput && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  maxLength={50}
                  placeholder="Fish species name"
                  value={otherFishInput}
                  onChange={(e) => setOtherFishInput(e.target.value.toUpperCase())}
                  className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  disabled={!otherFishInput.trim() || createFishTypeMutation.isPending}
                  onClick={async () => {
                    const fishName = otherFishInput.trim().toUpperCase();
                    if (fishName) {
                      try {
                        await createFishTypeMutation.mutateAsync({ name: fishName });
                      } catch (err) {
                        console.warn('[Weighbridge] Fish quick-save:', err.message);
                      }
                      handleAddFish(fishName);
                      setOtherFishInput('');
                      setShowOtherInput(false);
                    }
                  }}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-40"
                >
                  {createFishTypeMutation.isPending ? 'Adding...' : 'Add Fish'}
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

        {/* Validation Feedback when Next is blocked */}
        {!canProceedToWeights && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              {!partySearch.trim()
                ? 'Please select a registered party / vendor.'
                : !partyExists
                  ? `Vendor "${partySearch.trim()}" is not in database. Billing staff must add this vendor first.`
                  : lines.some((l) => !(parseInt(l.boxes, 10) > 0))
                    ? 'Please enter the number of boxes.'
                    : lines.some((l) => {
                      const total = l.parts.reduce((s, p) => s + (parseFloat(p.pct) || 0), 0);
                      return total > 100;
                    })
                      ? 'Box mix percentage cannot exceed 100%.'
                      : 'Every box mix must total exactly 100% before proceeding.'}
            </span>
          </div>
        )}

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
          {/* Incrementally Auto-Generated Slip No */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Slip No (Auto-generated)
            </label>
            <div className="relative">
              <input
                type="text"
                readOnly
                disabled
                value={autoSlipNo}
                className="w-full bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-700 cursor-not-allowed select-none"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                Auto
              </span>
            </div>
          </div>

          {/* Vehicle No Select Search Dropdown */}
          <div className="sm:col-span-2">
            <SearchableSelect
              label="Vehicle No"
              required
              value={vehicleNo}
              onChange={(val) => setVehicleNo(val)}
              options={vehiclesList.map((v) => ({
                value: v.vehicle_no,
                label: v.vehicle_no,
                subtext: v.driver_name ? `Driver: ${v.driver_name}` : undefined,
              }))}
              placeholder="Search or select vehicle..."
              error={
                vehicleNo.trim() && !vehicleExists
                  ? `Vehicle "${vehicleNo.trim()}" does not exist in master records. Billing staff must register this vehicle first.`
                  : null
              }
            />

            {/* Popular Vehicles strictly from DB */}
            {popularVehicles.length > 0 && (
              <div className="pt-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Popular Vehicles
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {popularVehicles.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVehicleNo(v)}
                      className={`text-[11px] font-mono font-bold px-2.5 py-1.5 rounded-xl border whitespace-nowrap transition-all active:scale-95 shadow-2xs ${
                        vehicleNo === v
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm ring-1 ring-amber-400'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
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
            maxLength={10}
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
            maxLength={10}
            placeholder="0"
            value={emptyTare}
            onChange={(e) => setEmptyTare(e.target.value)}
            className="w-full text-xl font-mono font-black text-slate-900 bg-white border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Ice / Water (Identical style to Loaded box) */}
        <div className="light-card p-3.5 rounded-2xl border border-amber-200 bg-amber-50/40 focus-within:ring-2 focus-within:ring-amber-400">
          <label className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block mb-1">
            Ice / Water Deduction (kg)
          </label>
          <input
            type="number"
            min="0"
            step="any"
            maxLength={10}
            placeholder="0"
            value={iceWater}
            onChange={(e) => setIceWater(e.target.value)}
            className="w-full text-xl font-mono font-black text-slate-900 bg-white border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Calculated Net Weight Card */}
      <div
        className={`p-4 rounded-2xl border transition-all ${
          weightsValid
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
            : (emptyVal >= loadedVal && loadedVal > 0) || (loadedVal > 0 && emptyVal > 0 && netWeight < 0)
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
            <span className="font-mono font-black text-2xl">
              {loadedVal > 0 || emptyVal > 0 ? Number(netWeight).toLocaleString() : '0'}
            </span>
            <span className="text-xs font-semibold ml-1">kg</span>
          </div>
        </div>

        {/* Validation message */}
        <div className="text-[11px] font-semibold mt-2 pt-2 border-t border-slate-200/50">
          {emptyVal >= loadedVal && loadedVal > 0 ? (
            <span className="text-rose-700">✗ Empty tare cannot be greater than or equal to loaded weight</span>
          ) : loadedVal > 0 && emptyVal > 0 && netWeight < 0 ? (
            <span className="text-rose-700">✗ Net weight cannot be negative (ice deduction exceeds payload)</span>
          ) : weightsValid ? (
            <span className="text-emerald-700">✓ Valid net weight: {Number(netWeight).toLocaleString()} kg</span>
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
        disabled={submitting || !weightsValid || !vehicleNo.trim() || !vehicleExists || !partyExists}
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
