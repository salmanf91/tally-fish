import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  KeyRound,
  Check,
  RefreshCw,
  Plus,
  Edit2,
  X,
  AlertTriangle,
  Building,
  Shield,
  CheckCircle2,
  Lock,
  UserCheck,
  UserX,
  Search,
} from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

const ROLE_CONFIG = {
  staffAdmin: {
    label: 'Weighbridge Staff',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    description: 'Weighbridge intake, gross/tare weights, box lots',
  },
  billingAdmin: {
    label: 'Billing Admin',
    badge: 'bg-blue-50 text-blue-800 border-blue-300',
    description: 'Reviews approved slips, rate adjustments, statements & reports',
  },
  owner: {
    label: 'Owner / Admin',
    badge: 'bg-amber-50 text-amber-800 border-amber-300',
    description: 'Sets rates, locks slips, manages accounts and company branches',
  },
};

export default function AccountsView() {
  const { activeBranchId, activeBranch } = useBranch();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // Status and feedback banners
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Modals state
  const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | 'reset-pin' | null
  const [targetUser, setTargetUser] = useState(null);

  // Form states for Add/Edit
  const [formUsername, setFormUsername] = useState('');
  const [formPin, setFormPin] = useState('');
  const [formRole, setFormRole] = useState('staffAdmin');
  const [formBranchId, setFormBranchId] = useState(activeBranchId || '');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formAssignAllBranches, setFormAssignAllBranches] = useState(false);

  // Filter state
  const [roleFilter, setRoleFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Fetch Users
  const {
    data: users = [],
    isLoading: loadingUsers,
    isFetching: fetchingUsers,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ['users', activeBranchId],
    queryFn: async () => {
      const res = await api.get('/auth/users');
      return res.data || [];
    },
    enabled: !!activeBranchId,
  });

  // 2. Fetch Branches
  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const res = await api.get('/auth/branches');
      return res.data || [];
    },
  });

  // Open Add Modal
  const handleOpenAdd = () => {
    setFormUsername('');
    setFormPin('');
    setFormRole('staffAdmin');
    setFormBranchId(activeBranchId || (branches[0] && branches[0].id) || '');
    setFormIsActive(true);
    setFormAssignAllBranches(false);
    setErrorMessage('');
    setSuccessMessage('');
    setModalMode('add');
  };

  // Open Edit Modal
  const handleOpenEdit = (user) => {
    setTargetUser(user);
    setFormUsername(user.username);
    setFormPin('');
    setFormIsActive(user.is_active);

    const firstRole = user.branch_roles?.[0];
    setFormRole(firstRole?.role || 'staffAdmin');

    const isAll = branches.length > 0 && user.branch_roles?.length === branches.length;
    setFormAssignAllBranches(isAll);
    setFormBranchId(firstRole?.branch_id || activeBranchId || (branches[0] && branches[0].id) || '');

    setErrorMessage('');
    setSuccessMessage('');
    setModalMode('edit');
  };

  // Open Reset PIN Modal
  const handleOpenResetPin = (user) => {
    setTargetUser(user);
    setFormPin('');
    setErrorMessage('');
    setSuccessMessage('');
    setModalMode('reset-pin');
  };

  const closeModal = () => {
    setModalMode(null);
    setTargetUser(null);
  };

  // Mutation: Create User
  const createUserMutation = useMutation({
    mutationFn: async (payload) => {
      return api.post('/auth/users', payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSuccessMessage(`User "${formUsername}" created successfully! PIN: ${formPin}`);
      closeModal();
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Failed to create user');
    },
  });

  // Mutation: Update User
  const updateUserMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      return api.put(`/auth/users/${id}`, payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSuccessMessage(`User "${targetUser?.username}" updated successfully.`);
      closeModal();
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Failed to update user');
    },
  });

  // Mutation: Reset PIN
  const resetPinMutation = useMutation({
    mutationFn: async ({ userId, newPin }) => {
      return api.post('/auth/reset-pin', { userId, newPin });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSuccessMessage(`PIN reset for "${targetUser?.username}"! New PIN: ${formPin}`);
      closeModal();
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Failed to reset PIN');
    },
  });

  // Handle Submit Add/Edit
  const handleSubmitForm = (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (modalMode === 'add') {
      if (!formUsername.trim()) {
        setErrorMessage('Username is required.');
        return;
      }
      if (!/^\d{4}$/.test(formPin.trim())) {
        setErrorMessage('PIN must be exactly 4 numeric digits (e.g. 1234).');
        return;
      }

      let branchRoles = [];
      if (formAssignAllBranches) {
        branchRoles = branches.map((b) => ({ branch_id: b.id, role: formRole }));
      } else {
        if (!formBranchId) {
          setErrorMessage('Please select a branch.');
          return;
        }
        branchRoles = [{ branch_id: formBranchId, role: formRole }];
      }

      createUserMutation.mutate({
        username: formUsername.trim(),
        pin: formPin.trim(),
        branch_roles: branchRoles,
      });
    } else if (modalMode === 'edit') {
      if (!formUsername.trim()) {
        setErrorMessage('Username is required.');
        return;
      }
      if (formPin && !/^\d{4}$/.test(formPin.trim())) {
        setErrorMessage('PIN must be 4 digits, or leave blank to keep existing.');
        return;
      }

      let branchRoles = [];
      if (formAssignAllBranches) {
        branchRoles = branches.map((b) => ({ branch_id: b.id, role: formRole }));
      } else {
        if (!formBranchId) {
          setErrorMessage('Please select a branch.');
          return;
        }
        branchRoles = [{ branch_id: formBranchId, role: formRole }];
      }

      const payload = {
        username: formUsername.trim(),
        is_active: formIsActive,
        branch_roles: branchRoles,
      };
      if (formPin.trim()) {
        payload.pin = formPin.trim();
      }

      updateUserMutation.mutate({
        id: targetUser.id,
        payload,
      });
    } else if (modalMode === 'reset-pin') {
      if (!/^\d{4}$/.test(formPin.trim())) {
        setErrorMessage('PIN must be exactly 4 numeric digits.');
        return;
      }

      resetPinMutation.mutate({
        userId: targetUser.id,
        newPin: formPin.trim(),
      });
    }
  };

  const handleGenerateRandomPin = () => {
    const randomPin = String(Math.floor(1000 + Math.random() * 9000));
    setFormPin(randomPin);
  };

  // Filter users
  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'all') {
      const hasRole = u.branch_roles?.some((br) => br.role === roleFilter);
      if (!hasRole) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchUsername = u.username?.toLowerCase().includes(q);
      const matchBranch = u.branch_roles?.some(
        (br) =>
          br.branch_name?.toLowerCase().includes(q) ||
          br.branch_code?.toLowerCase().includes(q)
      );
      if (!matchUsername && !matchBranch) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4 w-full">
      {/* Top Header Card */}
      <div className="light-card p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-slate-900">Operator Accounts</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
              Owner Control
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Active Branch: <strong className="text-slate-800">{activeBranch?.branch_name}</strong> · Manage users, branch assignments &amp; PIN access
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => refetchUsers()}
            disabled={fetchingUsers}
            title="Refresh Users"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-4 h-4 ${fetchingUsers ? 'animate-spin text-amber-600' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="py-2 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>Add Operator</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage('')}
            className="text-emerald-700 hover:text-emerald-900 text-sm font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && !modalMode && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage('')}
            className="text-rose-700 hover:text-rose-900 text-sm font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-0.5">
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mr-1">
            Filter:
          </span>
          {[
            { id: 'all', label: `All Accounts (${users.length})` },
            { id: 'staffAdmin', label: 'Weighbridge Staff' },
            { id: 'billingAdmin', label: 'Billing Admin' },
            { id: 'owner', label: 'Owner / Admin' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRoleFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all text-xs border ${
                roleFilter === tab.id
                  ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search operator or branch..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-2xs"
          />
        </div>
      </div>

      {/* Accounts DataTable View */}
      {loadingUsers ? (
        <div className="light-card p-12 text-center text-slate-400 text-xs font-medium space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-500" />
          <p>Loading operator accounts...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="light-card p-8 rounded-2xl text-center text-slate-500 text-xs">
          No operator accounts match the selected filter.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Operator / Username</th>
                  <th className="py-3 px-4">System Role</th>
                  <th className="py-3 px-4">Branch Scope</th>
                  <th className="py-3 px-4 w-28">Status</th>
                  <th className="py-3 px-4 w-44 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((acc, idx) => {
                  const primaryRole = acc.branch_roles?.[0]?.role || 'staffAdmin';
                  const roleMeta = ROLE_CONFIG[primaryRole] || ROLE_CONFIG.staffAdmin;
                  const isSelf = currentUser?.id === acc.id || currentUser?.username === acc.username;

                  return (
                    <tr key={acc.id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="py-3 px-4 text-center font-mono text-slate-400 font-semibold">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-800 text-xs shrink-0">
                            {acc.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 text-xs">{acc.username}</span>
                              {isSelf && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ID: {acc.id.slice(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-lg border ${roleMeta.badge}`}>
                          {roleMeta.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {acc.branch_roles && acc.branch_roles.length > 0 ? (
                            acc.branch_roles.map((br) => (
                              <span
                                key={br.id || br.branch_id}
                                className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200"
                              >
                                <span>{br.branch_name}</span>
                                <span className="text-[9px] text-slate-400">({br.branch_code})</span>
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">No branch assigned</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                            acc.is_active
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${acc.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {acc.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(acc)}
                            className="py-1 px-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1 transition-colors"
                          >
                            <Edit2 className="w-3 h-3 text-slate-500" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenResetPin(acc)}
                            className="py-1 px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold text-xs flex items-center gap-1 transition-colors"
                          >
                            <KeyRound className="w-3 h-3 text-amber-600" />
                            <span>Reset PIN</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
            <span>
              Showing <strong>{filteredUsers.length}</strong> of <strong>{users.length}</strong> operator accounts
            </span>
            <span className="text-[11px] text-slate-400">
              Click &ldquo;Edit&rdquo; to modify branch scope or &ldquo;Reset PIN&rdquo; to re-issue credentials
            </span>
          </div>
        </div>
      )}

      {/* Explanatory Role Policy Guide */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed space-y-2">
        <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-amber-600" />
          <span>Role Policy &amp; Workflow Permissions</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-[11px]">
          <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1">
            <strong className="text-emerald-800">Weighbridge Staff</strong>
            <p className="text-slate-500 leading-normal">
              Creates gate intake slips, gross/tare scale weights, and box lot mixes. Slips lock once owner fixes the rate. Cannot view rates or statements.
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1">
            <strong className="text-blue-800">Billing Admin</strong>
            <p className="text-slate-500 leading-normal">
              Reviews slips after admin sets rates, adjusts rates/slip weights when needed, prints daily statements and generates CSV reports.
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1">
            <strong className="text-amber-800">Owner / Admin</strong>
            <p className="text-slate-500 leading-normal">
              Full company-wide oversight. Fixes fish rates, locks entries, adds/edits operator accounts, assigns branches and resets login PINs.
            </p>
          </div>
        </div>
      </div>

      {/* MODAL: ADD / EDIT USER */}
      {(modalMode === 'add' || modalMode === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-slate-900">
                  {modalMode === 'add' ? 'Add Operator Account' : `Edit Account: ${targetUser?.username}`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure login credentials and branch role permissions
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-5 space-y-4">
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Username Input */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Username *
                </label>
                <input
                  type="text"
                  required
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="e.g. staff_ullal"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              {/* 4-digit PIN Input */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    {modalMode === 'add' ? '4-Digit Login PIN *' : 'Change PIN (Optional)'}
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateRandomPin}
                    className="text-[10px] font-bold text-amber-700 hover:text-amber-800 underline"
                  >
                    Generate Random
                  </button>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  required={modalMode === 'add'}
                  value={formPin}
                  onChange={(e) => setFormPin(e.target.value.replace(/\D/g, ''))}
                  placeholder={modalMode === 'add' ? '4-digit PIN (e.g. 1234)' : 'Leave blank to keep current PIN'}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              {/* System Role Selection */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  System Role *
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white cursor-pointer"
                >
                  <option value="staffAdmin">Weighbridge Staff (Scale &amp; Intake Slips)</option>
                  <option value="billingAdmin">Billing Department (Statements &amp; Review)</option>
                  <option value="owner">Owner / Administrator (Full Access &amp; Rate Setting)</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {ROLE_CONFIG[formRole]?.description}
                </p>
              </div>

              {/* Branch Assignment */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Branch Assignment *
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formAssignAllBranches}
                      onChange={(e) => setFormAssignAllBranches(e.target.checked)}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span>All Branches</span>
                  </label>
                </div>

                {!formAssignAllBranches && (
                  <select
                    value={formBranchId}
                    onChange={(e) => setFormBranchId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white cursor-pointer"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Status Toggle (Edit Mode Only) */}
              {modalMode === 'edit' && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div>
                    <label className="text-xs font-bold text-slate-800">Account Status</label>
                    <p className="text-[11px] text-slate-400">Deactivated users cannot log into the system</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormIsActive(!formIsActive)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs border transition-colors flex items-center gap-1.5 ${
                      formIsActive
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-rose-50 text-rose-800 border-rose-300'
                    }`}
                  >
                    {formIsActive ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                    <span>{formIsActive ? 'Active' : 'Disabled'}</span>
                  </button>
                </div>
              )}

              {/* Modal Submit Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending || updateUserMutation.isPending}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50"
                >
                  {createUserMutation.isPending || updateUserMutation.isPending
                    ? 'Saving...'
                    : modalMode === 'add'
                    ? 'Create Operator'
                    : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESET PIN */}
      {modalMode === 'reset-pin' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-slate-900 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-amber-600" />
                  <span>Reset PIN</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Set new 4-digit PIN for <strong>{targetUser?.username}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-5 space-y-4">
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    New 4-Digit Numeric PIN *
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateRandomPin}
                    className="text-[10px] font-bold text-amber-700 hover:text-amber-800 underline"
                  >
                    Generate Random
                  </button>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  required
                  autoFocus
                  value={formPin}
                  onChange={(e) => setFormPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 5678"
                  className="w-full text-center text-xl font-mono font-black text-slate-900 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500 focus:bg-white tracking-widest"
                />
              </div>

              <p className="text-[11px] text-slate-500 leading-normal bg-slate-50 p-3 rounded-xl border border-slate-200/70">
                Setting a new PIN will immediately unlock the user&apos;s account if it was locked due to failed login attempts.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetPinMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50"
                >
                  {resetPinMutation.isPending ? 'Updating PIN...' : 'Confirm New PIN'}
                </button>
              </div>
            </form>
   