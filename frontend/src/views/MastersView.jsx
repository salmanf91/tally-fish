import React, { useState, useMemo } from 'react';
import {
  Users,
  Truck,
  Fish,
  GitMerge,
  Check,
  Plus,
  Upload,
  Download,
  Edit2,
  Trash2,
  Search,
  AlertCircle,
  X,
  RefreshCw,
  Power,
  FileSpreadsheet,
} from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { useAuth } from '../context/AuthContext';
import {
  useParties,
  useVehicles,
  useFishTypes,
  useCreateParty,
  useUpdateParty,
  useDeleteParty,
  useCreateVehicle,
  useUpdateVehicle,
  useDeleteVehicle,
  useCreateFishType,
  useUpdateFishType,
  useDeleteFishType,
  useImportMasters,
} from '../hooks/useMasters';
import { api } from '../services/api';

// Helper to parse simple CSV text into array of objects
function parseCSV(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  // Parse header line
  const parseLine = (line) => {
    const result = [];
    let insideQuotes = false;
    let current = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders.map((h) => h.replace(/^["']|["']$/g, '').toLowerCase().trim());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      let val = values[idx] !== undefined ? values[idx] : '';
      val = val.replace(/^["']|["']$/g, '').trim();
      obj[h] = val;
    });
    rows.push(obj);
  }

  return { headers, rows };
}

export default function MastersView() {
  const { activeBranchId, activeBranch } = useBranch();
  const { isOwner, isBillingAdmin } = useAuth();
  const canCurate = isBillingAdmin(activeBranchId) || isOwner;

  const [activeTab, setActiveTab] = useState('parties'); // 'parties' | 'vehicles' | 'fish'
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [alertBanner, setAlertBanner] = useState(null);

  // Queries
  const { data: parties = [], isLoading: partiesLoading, refetch: refetchParties } = useParties(activeBranchId);
  const { data: vehicles = [], isLoading: vehiclesLoading, refetch: refetchVehicles } = useVehicles(activeBranchId);
  const { data: fishTypes = [], isLoading: fishLoading, refetch: refetchFishTypes } = useFishTypes(activeBranchId);

  // Mutations
  const createParty = useCreateParty(activeBranchId);
  const updateParty = useUpdateParty(activeBranchId);
  const deleteParty = useDeleteParty(activeBranchId);

  const createVehicle = useCreateVehicle(activeBranchId);
  const updateVehicle = useUpdateVehicle(activeBranchId);
  const deleteVehicle = useDeleteVehicle(activeBranchId);

  const createFishType = useCreateFishType(activeBranchId);
  const updateFishType = useUpdateFishType(activeBranchId);
  const deleteFishType = useDeleteFishType(activeBranchId);

  const importMasters = useImportMasters(activeBranchId);

  // Modals state
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // null = Add, object = Edit

  const [showImportModal, setShowImportModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);

  // Form states for Add/Edit
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    phone: '',
    vehicle_no: '',
    party_id: '',
    notes: '',
    default_rate: '',
    is_active: true,
  });

  // Merge modal state
  const [sourcePartyId, setSourcePartyId] = useState('');
  const [targetPartyId, setTargetPartyId] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  // Import modal state
  const [csvRawText, setCsvRawText] = useState('');
  const [parsedImportRows, setParsedImportRows] = useState([]);
  const [importStatus, setImportStatus] = useState(null);

  // Open Add modal
  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      code: '',
      phone: '',
      vehicle_no: '',
      party_id: '',
      notes: '',
      default_rate: '35.00',
      is_active: true,
    });
    setShowAddEditModal(true);
  };

  // Open Edit modal
  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name || '',
      code: item.code || '',
      phone: item.phone || '',
      vehicle_no: item.vehicle_no || '',
      party_id: item.party_id || '',
      notes: item.notes || '',
      default_rate: item.default_rate !== undefined ? String(item.default_rate) : '0.00',
      is_active: item.is_active !== undefined ? item.is_active : true,
    });
    setShowAddEditModal(true);
  };

  // Save Add/Edit
  const handleSaveAddEdit = async (e) => {
    e.preventDefault();
    try {
      if (activeTab === 'parties') {
        if (!formData.name.trim()) throw new Error('Vendor name is required');
        const payload = {
          name: formData.name.trim(),
          code: formData.code.trim() ? formData.code.trim().toUpperCase() : null,
          phone: formData.phone.trim() || null,
          is_active: formData.is_active,
        };
        if (editingItem) {
          await updateParty.mutateAsync({ id: editingItem.id, ...payload });
          setAlertBanner({ type: 'success', text: `Vendor "${formData.name}" updated successfully.` });
        } else {
          await createParty.mutateAsync(payload);
          setAlertBanner({ type: 'success', text: `Vendor "${formData.name}" added successfully.` });
        }
      } else if (activeTab === 'vehicles') {
        if (!formData.vehicle_no.trim()) throw new Error('Vehicle number is required');
        const payload = {
          vehicle_no: formData.vehicle_no.trim().toUpperCase(),
          party_id: formData.party_id || null,
          notes: formData.notes.trim() || null,
          is_active: formData.is_active,
        };
        if (editingItem) {
          await updateVehicle.mutateAsync({ id: editingItem.id, ...payload });
          setAlertBanner({ type: 'success', text: `Vehicle "${formData.vehicle_no}" updated successfully.` });
        } else {
          await createVehicle.mutateAsync(payload);
          setAlertBanner({ type: 'success', text: `Vehicle "${formData.vehicle_no}" added successfully.` });
        }
      } else if (activeTab === 'fish') {
        if (!formData.name.trim()) throw new Error('Fish species name is required');
        const payload = {
          name: formData.name.trim().toUpperCase(),
          code: formData.code.trim() ? formData.code.trim().toUpperCase() : null,
          default_rate: parseFloat(formData.default_rate) || 0.0,
          is_active: formData.is_active,
        };
        if (editingItem) {
          await updateFishType.mutateAsync({ id: editingItem.id, ...payload });
          setAlertBanner({ type: 'success', text: `Fish species "${formData.name}" updated successfully.` });
        } else {
          await createFishType.mutateAsync(payload);
          setAlertBanner({ type: 'success', text: `Fish species "${formData.name}" added successfully.` });
        }
      }
      setShowAddEditModal(false);
    } catch (err) {
      setAlertBanner({ type: 'error', text: err.response?.data?.error || err.message });
    }
  };

  // Toggle Active/Inactive status directly
  const handleToggleActive = async (item) => {
    try {
      const nextActive = !item.is_active;
      if (activeTab === 'parties') {
        await updateParty.mutateAsync({ id: item.id, is_active: nextActive });
        setAlertBanner({ type: 'success', text: `Vendor "${item.name}" set to ${nextActive ? 'Active' : 'Inactive'}.` });
      } else if (activeTab === 'vehicles') {
        await updateVehicle.mutateAsync({ id: item.id, is_active: nextActive });
        setAlertBanner({ type: 'success', text: `Vehicle "${item.vehicle_no}" set to ${nextActive ? 'Active' : 'Inactive'}.` });
      } else if (activeTab === 'fish') {
        await updateFishType.mutateAsync({ id: item.id, is_active: nextActive });
        setAlertBanner({ type: 'success', text: `Species "${item.name}" set to ${nextActive ? 'Active' : 'Inactive'}.` });
      }
    } catch (err) {
      setAlertBanner({ type: 'error', text: err.response?.data?.error || err.message });
    }
  };

  // Confirm delete/deactivate
  const handleExecuteDelete = async () => {
    if (!deleteConfirmItem) return;
    try {
      let res;
      if (activeTab === 'parties') {
        res = await deleteParty.mutateAsync(deleteConfirmItem.id);
      } else if (activeTab === 'vehicles') {
        res = await deleteVehicle.mutateAsync(deleteConfirmItem.id);
      } else if (activeTab === 'fish') {
        res = await deleteFishType.mutateAsync(deleteConfirmItem.id);
      }
      setAlertBanner({
        type: res?.deactivated ? 'warning' : 'success',
        text: res?.message || 'Master record processed successfully.',
      });
      setDeleteConfirmItem(null);
    } catch (err) {
      setAlertBanner({ type: 'error', text: err.response?.data?.error || err.message });
    }
  };

  // Execute Merge
  const handleMergeParties = async () => {
    if (!sourcePartyId || !targetPartyId || sourcePartyId === targetPartyId) {
      setAlertBanner({ type: 'error', text: 'Please select two different vendors to merge.' });
      return;
    }
    try {
      setIsMerging(true);
      const res = await api.post('/masters/parties/merge', {
        sourcePartyId,
        targetPartyId,
      });
      setAlertBanner({
        type: 'success',
        text: res.data?.message || 'Vendors merged successfully! Historical slips reassigned.',
      });
      refetchParties();
      setShowMergeModal(false);
      setSourcePartyId('');
      setTargetPartyId('');
    } catch (err) {
      setAlertBanner({ type: 'error', text: err.response?.data?.error || err.message || 'Failed to merge vendors' });
    } finally {
      setIsMerging(false);
    }
  };

  // Generate Sample CSV Template Download
  const handleDownloadSampleCSV = () => {
    let headers = '';
    let sampleRows = '';
    let filename = '';

    if (activeTab === 'parties') {
      filename = 'sample_parties_master.csv';
      headers = 'name,code,phone,is_active\n';
      sampleRows =
        '"Karnataka Fisheries","KF01","+919876543210","true"\n' +
        '"Arabian Sea Catchers","ASC","+919844001122","true"\n' +
        '"Malpe Trawlers Union","MTU","+919822334455","true"\n';
    } else if (activeTab === 'vehicles') {
      filename = 'sample_vehicles_master.csv';
      headers = 'vehicle_no,party_name,notes,is_active\n';
      sampleRows =
        '"KA-19-AB-9999","Coastal Catchers Ltd","10-ton insulated truck","true"\n' +
        '"KA-20-C-1234","","Direct port delivery freelance truck","true"\n' +
        '"KL-14-D-5678","Karnataka Fisheries","Insulated refrigerated","true"\n';
    } else if (activeTab === 'fish') {
      filename = 'sample_fish_types_master.csv';
      headers = 'name,code,default_rate,is_active\n';
      sampleRows =
        '"POMFRET","PMF","180.00","true"\n' +
        '"KINGFISH","KGF","240.00","true"\n' +
        '"ANCHOVY","ANC","28.00","true"\n' +
        '"SQUID","SQD","90.00","true"\n';
    }

    const blob = new Blob([headers + sampleRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle CSV file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setCsvRawText(content);
        const parsed = parseCSV(content);
        setParsedImportRows(parsed.rows);
      }
    };
    reader.readAsText(file);
  };

  // Handle manual raw text change in import modal
  const handleRawTextChange = (text) => {
    setCsvRawText(text);
    const parsed = parseCSV(text);
    setParsedImportRows(parsed.rows);
  };

  // Confirm Import
  const handleExecuteImport = async () => {
    if (parsedImportRows.length === 0) {
      setImportStatus({ error: 'No valid data rows found to import.' });
      return;
    }

    try {
      setImportStatus({ loading: true });
      const entityMap = {
        parties: 'parties',
        vehicles: 'vehicles',
        fish: 'fish_types',
      };
      const entity = entityMap[activeTab];

      const res = await importMasters.mutateAsync({
        entity,
        records: parsedImportRows,
      });

      const result = res.data;
      setAlertBanner({
        type: 'success',
        text: `Import finished: ${result.inserted} new created, ${result.updated} existing updated (${result.total} total rows processed).`,
      });
      setShowImportModal(false);
      setCsvRawText('');
      setParsedImportRows([]);
      setImportStatus(null);
    } catch (err) {
      setImportStatus({ error: err.response?.data?.error || err.message });
    }
  };

  // Filtered lists
  const filteredParties = useMemo(() => {
    return parties.filter((p) => {
      if (statusFilter === 'active' && !p.is_active) return false;
      if (statusFilter === 'inactive' && p.is_active) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          p.name?.toLowerCase().includes(term) ||
          p.code?.toLowerCase().includes(term) ||
          p.phone?.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [parties, statusFilter, searchTerm]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (statusFilter === 'active' && !v.is_active) return false;
      if (statusFilter === 'inactive' && v.is_active) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          v.vehicle_no?.toLowerCase().includes(term) ||
          v.party_name?.toLowerCase().includes(term) ||
          v.notes?.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [vehicles, statusFilter, searchTerm]);

  const filteredFishTypes = useMemo(() => {
    return fishTypes.filter((f) => {
      if (statusFilter === 'active' && !f.is_active) return false;
      if (statusFilter === 'inactive' && f.is_active) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          f.name?.toLowerCase().includes(term) ||
          f.code?.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [fishTypes, statusFilter, searchTerm]);

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-12">
      {/* Top Header Card */}
      <div className="light-card p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm border border-slate-200">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-600" />
            Master Catalog & Master Data Management
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Active Unit: <span className="font-bold text-slate-800">{activeBranch?.branch_name || 'Ullal Unit'}</span> | Manage verified vendors, vehicles, and species.
          </p>
        </div>

        {canCurate && (
          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'parties' && (
              <button
                onClick={() => setShowMergeModal(true)}
                className="text-xs font-bold px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-center gap-1.5 hover:bg-amber-100 transition-all shadow-sm"
              >
                <GitMerge className="w-3.5 h-3.5 text-amber-700" />
                Merge Duplicates
              </button>
            )}

            <button
              onClick={() => {
                setShowImportModal(true);
                setCsvRawText('');
                setParsedImportRows([]);
                setImportStatus(null);
              }}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 flex items-center gap-1.5 hover:bg-slate-200 transition-all shadow-sm"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              Import CSV
            </button>

            <button
              onClick={handleOpenAdd}
              className="text-xs font-bold px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add {activeTab === 'parties' ? 'Vendor' : activeTab === 'vehicles' ? 'Vehicle' : 'Species'}
            </button>
          </div>
        )}
      </div>

      {/* Alert Banner */}
      {alertBanner && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 transition-all ${
            alertBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : alertBanner.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {alertBanner.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{alertBanner.text}</span>
          </div>
          <button onClick={() => setAlertBanner(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => {
              setActiveTab('parties');
              setSearchTerm('');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'parties'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Vendors / Parties ({parties.length})
          </button>

          <button
            onClick={() => {
              setActiveTab('vehicles');
              setSearchTerm('');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'vehicles'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            Vehicles ({vehicles.length})
          </button>

          <button
            onClick={() => {
              setActiveTab('fish');
              setSearchTerm('');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'fish'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Fish className="w-3.5 h-3.5" />
            Fish Species ({fishTypes.length})
          </button>
        </div>

        {/* Search and Filter Controls */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-60">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Tab Contents: Grid of Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* PARTIES CARDS */}
        {activeTab === 'parties' && (
          <>
            {filteredParties.map((p) => (
              <div
                key={p.id}
                className="light-card p-4 rounded-2xl flex flex-col justify-between border border-slate-200 bg-white hover:border-slate-300 transition-all shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-sm text-slate-900 leading-tight">{p.name}</h4>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold border shrink-0 ${
                        p.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="text-slate-400">Code:</span>
                      <span className="font-semibold text-slate-700">{p.code || '—'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="text-slate-400">Phone:</span>
                      <span className="text-slate-700">{p.phone || '—'}</span>
                    </div>
                  </div>
                </div>

                {canCurate && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <button
                      onClick={() => handleToggleActive(p)}
                      title={p.is_active ? 'Deactivate vendor' : 'Activate vendor'}
                      className={`text-[11px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 transition-all ${
                        p.is_active
                          ? 'text-slate-500 hover:text-amber-700 hover:bg-amber-50'
                          : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      {p.is_active ? 'Deactivate' : 'Activate'}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(p)}
                        title="Edit Vendor"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmItem(p)}
                        title="Delete Vendor"
                        className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {filteredParties.length === 0 && (
              <div className="col-span-full p-8 text-center bg-white rounded-2xl border border-dashed border-slate-300">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">No vendors found</p>
                <p className="text-xs text-slate-400 mt-0.5">Click "+ Add Vendor" or "Import CSV" to populate master records.</p>
              </div>
            )}
          </>
        )}

        {/* VEHICLES CARDS */}
        {activeTab === 'vehicles' && (
          <>
            {filteredVehicles.map((v) => (
              <div
                key={v.id}
                className="light-card p-4 rounded-2xl flex flex-col justify-between border border-slate-200 bg-white hover:border-slate-300 transition-all shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-mono font-bold text-sm text-blue-700 tracking-wide">{v.vehicle_no}</h4>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold border shrink-0 ${
                        v.is_active
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {v.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">Associated Vendor:</span>
                      <span className="font-semibold text-slate-800">{v.party_name || 'Generic / Freelance'}</span>
                    </div>
                    {v.notes && (
                      <p className="text-slate-400 text-[11px] line-clamp-1 italic mt-1">{v.notes}</p>
                    )}
                  </div>
                </div>

                {canCurate && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <button
                      onClick={() => handleToggleActive(v)}
                      title={v.is_active ? 'Deactivate vehicle' : 'Activate vehicle'}
                      className={`text-[11px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 transition-all ${
                        v.is_active
                          ? 'text-slate-500 hover:text-blue-700 hover:bg-blue-50'
                          : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      {v.is_active ? 'Deactivate' : 'Activate'}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(v)}
                        title="Edit Vehicle"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmItem(v)}
                        title="Delete Vehicle"
                        className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {filteredVehicles.length === 0 && (
              <div className="col-span-full p-8 text-center bg-white rounded-2xl border border-dashed border-slate-300">
                <Truck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">No vehicles found</p>
                <p className="text-xs text-slate-400 mt-0.5">Click "+ Add Vehicle" or "Import CSV" to register transport vehicles.</p>
              </div>
            )}
          </>
        )}

        {/* FISH SPECIES CARDS */}
        {activeTab === 'fish' && (
          <>
            {filteredFishTypes.map((f) => (
              <div
                key={f.id}
                className="light-card p-4 rounded-2xl flex flex-col justify-between border border-slate-200 bg-white hover:border-slate-300 transition-all shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-sm text-emerald-800 tracking-wide">{f.name}</h4>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold border shrink-0 ${
                        f.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {f.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="text-slate-400">Code:</span>
                      <span className="font-semibold text-slate-700">{f.code || '—'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">Default Rate:</span>
                      <span className="font-bold text-emerald-700 font-mono">₹{parseFloat(f.default_rate || 0).toFixed(2)}/kg</span>
                    </div>
                  </div>
                </div>

                {canCurate && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <button
                      onClick={() => handleToggleActive(f)}
                      title={f.is_active ? 'Deactivate species' : 'Activate species'}
                      className={`text-[11px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 transition-all ${
                        f.is_active
                          ? 'text-slate-500 hover:text-emerald-700 hover:bg-emerald-50'
                          : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      {f.is_active ? 'Deactivate' : 'Activate'}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(f)}
                        title="Edit Species"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmItem(f)}
                        title="Delete Species"
                        className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {filteredFishTypes.length === 0 && (
              <div className="col-span-full p-8 text-center bg-white rounded-2xl border border-dashed border-slate-300">
                <Fish className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">No fish species found</p>
                <p className="text-xs text-slate-400 mt-0.5">Click "+ Add Species" or "Import CSV" to populate the fish catalog.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* ADD / EDIT MODAL                                                          */}
      {/* ========================================================================= */}
      {showAddEditModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full p-6 rounded-3xl border border-slate-200 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                {editingItem ? <Edit2 className="w-4 h-4 text-amber-600" /> : <Plus className="w-4 h-4 text-amber-600" />}
                {editingItem ? 'Edit' : 'Add New'}{' '}
                {activeTab === 'parties' ? 'Vendor / Party' : activeTab === 'vehicles' ? 'Vehicle' : 'Fish Species'}
              </h3>
              <button onClick={() => setShowAddEditModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAddEdit} className="space-y-3.5">
              {/* PARTY FIELDS */}
              {activeTab === 'parties' && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Vendor / Party Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Coastal Catchers Ltd"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Short Code</label>
                      <input
                        type="text"
                        placeholder="e.g. CCL"
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                        className="w-full font-mono bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Contact Phone</label>
                      <input
                        type="text"
                        placeholder="e.g. +91 9876543210"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* VEHICLE FIELDS */}
              {activeTab === 'vehicles' && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Vehicle Registration Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. KA-19-AB-1234"
                      value={formData.vehicle_no}
                      onChange={(e) => setFormData({ ...formData, vehicle_no: e.target.value.toUpperCase() })}
                      className="w-full font-mono font-bold bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Associated Vendor / Party</label>
                    <select
                      value={formData.party_id}
                      onChange={(e) => setFormData({ ...formData, party_id: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">-- Freelance / Generic (No fixed vendor) --</option>
                      {parties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Notes / Description</label>
                    <input
                      type="text"
                      placeholder="e.g. 10 Ton Insulated Reefer"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              {/* FISH SPECIES FIELDS */}
              {activeTab === 'fish' && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Fish Species Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. SARDINE"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
                      className="w-full font-bold bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Catalog Code</label>
                      <input
                        type="text"
                        placeholder="e.g. SAR"
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                        className="w-full font-mono bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Default Rate (₹/kg)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="35.00"
                        value={formData.default_rate}
                        onChange={(e) => setFormData({ ...formData, default_rate: e.target.value })}
                        className="w-full font-mono bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Active Toggle Checkbox */}
              <div className="pt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                />
                <label htmlFor="isActiveToggle" className="text-xs font-medium text-slate-700 select-none">
                  Active (Available for weighbridge selection)
                </label>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                >
                  {editingItem ? 'Save Changes' : 'Create Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BULK CSV IMPORT MODAL                                                     */}
      {/* ========================================================================= */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-2xl w-full p-6 rounded-3xl border border-slate-200 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-amber-600" />
                  Bulk Import {activeTab === 'parties' ? 'Vendors' : activeTab === 'vehicles' ? 'Vehicles' : 'Species'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload a CSV file or paste tabular data to batch create or update catalog records.
                </p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 pr-1 flex-1">
              {/* Template Download Banner */}
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-center justify-between gap-3">
                <div className="text-xs text-amber-900">
                  <span className="font-bold">Need the exact CSV format?</span> Download the sample template with pre-filled headers and sample rows.
                </div>
                <button
                  type="button"
                  onClick={handleDownloadSampleCSV}
                  className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-800 flex items-center gap-1.5 hover:bg-amber-100 shrink-0 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5 text-amber-600" />
                  Download Sample CSV
                </button>
              </div>

              {/* File Upload Selector */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Option 1: Choose CSV File
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  onChange={handleFileUpload}
                  className="block w-full text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                />
              </div>

              {/* Paste Textarea */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Option 2: Or Paste CSV / Comma-Separated Text
                </label>
                <textarea
                  rows={4}
                  value={csvRawText}
                  onChange={(e) => handleRawTextChange(e.target.value)}
                  placeholder={`name,code,phone,is_active\n"Karnataka Fisheries","KF01","+919876543210","true"`}
                  className="w-full font-mono text-[11px] p-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Preview Table */}
              {parsedImportRows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800">
                      Parsed Preview: <span className="text-amber-600 font-black">{parsedImportRows.length} records</span>
                    </span>
                    <span className="text-[11px] text-slate-400">Existing records with matching names will be safely updated</span>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-48">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                          <th className="py-1.5 px-3">#</th>
                          {Object.keys(parsedImportRows[0] || {}).map((col) => (
                            <th key={col} className="py-1.5 px-3 uppercase tracking-wider font-mono">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedImportRows.slice(0, 10).map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 text-slate-700 font-mono">
                            <td className="py-1.5 px-3 text-slate-400 font-sans">{idx + 1}</td>
                            {Object.values(row).map((val, cIdx) => (
                              <td key={cIdx} className="py-1.5 px-3 whitespace-nowrap">
                                {String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsedImportRows.length > 10 && (
                      <div className="p-2 text-center text-[10px] text-slate-400 bg-slate-50 border-t border-slate-200">
                        ... and {parsedImportRows.length - 10} more rows
                      </div>
                    )}
                  </div>
                </div>
              )}

              {importStatus?.error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{importStatus.error}</span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={parsedImportRows.length === 0 || importMasters.isPending}
                onClick={handleExecuteImport}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white shadow-sm flex items-center gap-1.5"
              >
                {importMasters.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Confirm & Import {parsedImportRows.length} Records
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DELETE / DEACTIVATE CONFIRMATION MODAL                                    */}
      {/* ========================================================================= */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full p-6 rounded-3xl border border-slate-200 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2 text-rose-600">
              <Trash2 className="w-5 h-5 text-rose-600" />
              Confirm Master Deletion
            </h3>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Are you sure you want to delete{' '}
              <span className="font-bold text-slate-900">
                "{deleteConfirmItem.name || deleteConfirmItem.vehicle_no}"
              </span>
              ?
              <br />
              <span className="text-[11px] text-slate-400 mt-2 block">
                Safety Note: If this record has existing historical weighbridge transactions, it will be safely deactivated to protect the transaction ledger.
              </span>
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
              >
                Delete / Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VENDOR MERGE MODAL                                                        */}
      {/* ========================================================================= */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full p-6 rounded-3xl border border-slate-200 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-amber-600" />
                Merge Duplicate Vendors
              </h3>
              <button onClick={() => setShowMergeModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              All historical slips and registered vehicles from the duplicate vendor will be re-assigned to the primary vendor.
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
                disabled={isMerging}
                onClick={handleMergeParties}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white shadow-sm flex items-center gap-1.5"
              >
                {isMerging ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Merging...
                  </>
                ) : (
                  'Execute Merge'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
