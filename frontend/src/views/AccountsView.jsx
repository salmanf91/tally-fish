import React, { useState, useMemo } from 'react';
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
  Trash2,
  CheckSquare,
  Square,
  Sliders,
} from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

function getRoleBadge(roleId, rolesList = []) {
  const r = rolesList.find((x) => x.id === roleId);
  if (roleId === 'owner') {
    return {
      label: r?.name || 'Owner / Admin',
      badge: 'bg-amber-50 text-amber-800 border-amber-300',
      description: r?.description || 'Sets rates, locks slips, manages accounts and company branches',
    };
  }
  if (roleId === 'billingAdmin') {
    return {
      label: r?.name || 'Billing Admin',
      badge: 'bg-blue-50 text-blue-800 border-blue-300',
      description: r?.description || 'Reviews approved slips, rate adjustments, statements & reports',
    };
  }
  if (roleId === 'staffAdmin') {
    return {
      label: r?.name || 'Weighbridge Staff',
      badge: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      description: r?.description || 'Weighbridge intake, gross/tare weights, box lots',
    };
  }
  return {
    label: r?.name || roleId,
    badge: 'bg-purple-50 text-purple-800 border-purple-300',
    description: r?.description || 'Custom defined role with modular permissions',
  };
}

export default function AccountsView() {
  const { activeBranchId, activeBranch, hasPermission } = useBranch();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // Sub-tab: 'users' | 'roles'
  const [activeSubTab, setActiveSubTab] = useState('users');

  // Status and feedback banners
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Modals state for Users
  const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | 'reset-pin' | null
  const [targetUser, setTargetUser] = useState(null);

  // Form states for Add/Edit User
  const [formUsername, setFormUsername] = useState('');
  const [formPin, setFormPin] = useState('');
  const [formRole, setFormRole] = useState('staffAdmin');
  const [formBranchId, setFormBranchId] = useState(activeBranchId || '');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formAssignAllBranches, setFormAssignAllBranches] = useState(false);

  // Filter state for Users
  const [roleFilter, setRoleFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state for Roles (RBAC)
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null); // null = Add, object = Edit
  const [roleFormName, setRoleFormName] = useState('');
  const [roleFormSlug, setRoleFormSlug] = useState('');
  const [roleFormDescription, setRoleFormDescription] = useState('');
  const [roleFormPermissions, setRoleFormPermissions] = useState([]);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState(null);

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

  // 3. Fetch Roles
  const {
    data: roles = [],
    isLoading: loadingRoles,
    isFetching: fetchingRoles,
    refetch: refetchRoles,
  } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await api.get('/auth/roles');
      return res.data || [];
    },
  });

  // 4. Fetch Master Permissions Catalog
  const { data: permissionsCatalog = [] } = useQuery({
    queryKey: ['permissions-catalog'],
    queryFn: async () => {
      const res = await api.get('/auth/permissions');
      return res.data || [];
    },
  });

  // Group permissions catalog by category
  const permissionsByCategory = useMemo(() => {
    const grouped = {};
    permissionsCatalog.forEach((p) => {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    });
    return grouped;
  }, [permissionsCatalog]);

  // Open Add User Modal
  const handleOpenAdd = () => {
    setFormUsername('');
    setFormPin('');
    setFormRole(roles[0]?.id || 'staffAdmin');
    setFormBranchId(activeBranchId || (branches[0] && branches[0].id) || '');
    setFormIsActive(true);
    setFormAssignAllBranches(false);
    setErrorMessage('');
    setSuccessMessage('');
    setModalMode('add');
  };

  // Open Edit User Modal
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

  // Open Add Role Modal
  const handleOpenAddRole = () => {
    setEditingRole(null);
    setRoleFormName('');
    setRoleFormSlug('');
    setRoleFormDescription('');
    setRoleFormPermissions([
      'slips:view',
      'slips:create',
      'slips:edit_open',
    ]);
    setErrorMessage('');
    setSuccessMessage('');
    setShowRoleModal(true);
  };

  // Open Edit Role Modal
  const handleOpenEditRole = (role) => {
    setEditingRole(role);
    setRoleFormName(role.name);
    setRoleFormSlug(role.id);
    setRoleFormDescription(role.description || '');

    const perms = Array.isArray(role.permissions)
      ? role.permissions
      : typeof role.permissions === 'string'
      ? JSON.parse(role.permissions)
      : [];
    setRoleFormPermissions(perms);
    setErrorMessage('');
    setSuccessMessage('');
    setShowRoleModal(true);
  };

  const closeRoleModal = () => {
    setShowRoleModal(false);
    setEditingRole(null);
  };

  // Toggle single permission checkbox
  const handleTogglePermission = (permKey) => {
    setRoleFormPermissions((prev) => {
      if (prev.includes(permKey)) {
        return prev.filter((k) => k !== permKey);
      } else {
        return [...prev, permKey];
      }
    });
  };

  // Toggle all permissions in a category
  const handleToggleCategoryAll = (catPermissions) => {
    const catKeys = catPermissions.map((p) => p.key);
    const allSelected = catKeys.every((k) => roleFormPermissions.includes(k));

    if (allSelected) {
      setRoleFormPermissions((prev) => prev.filter((k) => !catKeys.includes(k)));
    } else {
      setRoleFormPermissions((prev) => Array.from(new Set([...prev, ...catKeys])));
    }
  };

  // Mutations for Users
  const createUserMutation = useMutation({
    mutationFn: async (payload) => {
      return api.post('/auth/users', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSuccessMessage(`User "${formUsername}" created successfully! PIN: ${formPin}`);
      closeModal();
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Failed to create user');
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      return api.put(`/auth/users/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSuccessMessage(`User "${targetUser?.username}" updated successfully.`);
      closeModal();
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Failed to update user');
    },
  });

  const resetPinMutation = useMutation({
    mutationFn: async ({ userId, newPin }) => {
      return api.post('/auth/reset-pin', { userId, newPin });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSuccessMessage(`PIN reset for "${targetUser?.username}"! New PIN: ${formPin}`);
      closeModal();
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Failed to reset PIN');
    },
  });

  // Mutations for Roles
  const createRoleMutation = useMutation({
    mutationFn: async (payload) => {
      return api.post('/auth/roles', payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setSuccessMessage(res.message || 'Role created successfully.');
      closeRoleModal();
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Failed to create role');
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      return api.put(`/auth/roles/${id}`, payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setSuccessMessage(res.message || 'Role updated successfully.');
      closeRoleModal();
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Failed to update role');
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (id) => {
      return api.delete(`/auth/roles/${id}`);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setSuccessMessage(res.message || 'Role deleted successfully.');
      setDeleteRoleTarget(null);
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Failed to delete role');
      setDeleteRoleTarget(null);
    },
  });

  // Handle Submit Add/Edit User
  const handleSubmitUserForm = (e) => {
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
        branchRoles = [{ branch_id: formBranchId, role: formRole }];
      }

      updateUserMutation.mutate({
        id: targetUser.id,
        payload: {
          username: formUsername.trim(),
          pin: formPin.trim() || undefined,
          is_active: formIsActive,
          branch_roles: branchRoles,
        },
      });
    }
  };

  // Handle Submit Role Form
  const handleSubmitRoleForm = (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!roleFormName.trim()) {
      setErrorMessage('Role name is required.');
      return;
    }

    const payload = {
      name: roleFormName.trim(),
      description: roleFormDescription.trim() || null,
      permissions: roleFormPermissions,
    };

    if (editingRole) {
      updateRoleMutation.mutate({
        id: editingRole.id,
        payload,
      });
    } else {
      createRoleMutation.mutate({
        id: roleFormSlug.trim() || undefined,
        ...payload,
      });
    }
  };

  // Filtered Users List
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
            <h2 className="text-lg font-black text-slate-900">Access &amp; Security Governance</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
              Hybrid RBAC
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Active Branch: <strong className="text-slate-800">{activeBranch?.branch_name}</strong> · User onboarding, branch scopes &amp; dynamic permission policies
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              refetchUsers();
              refetchRoles();
            }}
            disabled={fetchingUsers || fetchingRoles}
            title="Refresh Data"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-4 h-4 ${fetchingUsers || fetchingRoles ? 'animate-spin text-amber-600' : ''}`} />
          </button>

          {activeSubTab === 'users' ? (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="py-2 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span>Add Operator</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenAddRole}
              className="py-2 px-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span>Create Custom Role</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary Sub-Tab Switcher: User Accounts vs Roles & Permissions */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('users')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeSubTab === 'users'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Accounts ({users.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('roles')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeSubTab === 'roles'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Roles &amp; Permission Matrix ({roles.length})</span>
        </button>
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
      {errorMessage && !modalMode && !showRoleModal && (
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

      {/* TAB 1: USER ACCOUNTS */}
      {activeSubTab === 'users' && (
        <div className="space-y-3">
          {/* Filter and Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-0.5">
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mr-1">
                Filter:
              </span>
              <button
                type="button"
                onClick={() => setRoleFilter('all')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all text-xs border ${
                  roleFilter === 'all'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                All Accounts ({users.length})
              </button>
              {roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRoleFilter(r.id)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all text-xs border ${
                    roleFilter === r.id
                      ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  {r.name}
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
                      <th className="py-3 px-4">Role Assignment</th>
                      <th className="py-3 px-4">Branch Scope</th>
                      <th className="py-3 px-4 w-28">Status</th>
                      <th className="py-3 px-4 w-44 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map((acc, idx) => {
                      const primaryRole = acc.branch_roles?.[0]?.role || 'staffAdmin';
                      const roleMeta = getRoleBadge(primaryRole, roles);
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
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ROLES & PERMISSION MATRIX (RBAC) */}
      {activeSubTab === 'roles' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {roles.map((r) => {
              const perms = Array.isArray(r.permissions)
                ? r.permissions
                : typeof r.permissions === 'string'
                ? JSON.parse(r.permissions)
                : [];
              const isOwner = r.id === 'owner';
              const isWildcard = perms.includes('*') || isOwner;

              return (
                <div
                  key={r.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                          <span>{r.name}</span>
                        </h4>
                        <span className="font-mono text-[10px] text-slate-400 block mt-0.5">
                          ID: {r.id}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          r.is_system
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}
                      >
                        {r.is_system ? 'System Template' : 'Custom Role'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 leading-normal min-h-[36px]">
                      {r.description || 'No description provided.'}
                    </p>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Assigned Users:</span>
                      <strong className="text-slate-900 font-bold">{r.user_count || 0} active</strong>
                    </div>

                    <div className="space-y-1 pt-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Privilege Scope:
                      </span>
                      {isWildcard ? (
                        <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-amber-600" />
                          <span>Full Wildcard Authority (*)</span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {perms.slice(0, 5).map((p) => (
                            <span
                              key={p}
                              className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                            >
                              {p}
                            </span>
                          ))}
                          {perms.length > 5 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                              +{perms.length - 5} more
                            </span>
                          )}
                          {perms.length === 0 && (
                            <span className="text-[10px] text-slate-400 italic">No privileges granted</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditRole(r)}
                      className="py-1.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <Sliders className="w-3.5 h-3.5 text-slate-500" />
                      <span>{r.is_system ? 'Inspect Permissions' : 'Edit Matrix'}</span>
                    </button>

                    {!r.is_system && (
                      <button
                        type="button"
                        onClick={() => setDeleteRoleTarget(r)}
                        disabled={Number(r.user_count) > 0}
                        title={Number(r.user_count) > 0 ? 'Cannot delete role with assigned users' : 'Delete role'}
                        className="py-1.5 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs flex items-center gap-1 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL 1: ADD / EDIT USER */}
      {(modalMode === 'add' || modalMode === 'edit') && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-xs">
                  {modalMode === 'add' ? <Plus className="w-5 h-5" /> : <Edit2 className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {modalMode === 'add' ? 'Create Operator Account' : `Edit Account: ${targetUser?.username}`}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {modalMode === 'add' ? 'Assign a username, PIN, role and branch' : 'Update credentials and operational roles'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmitUserForm} className="space-y-3.5">
              {/* Username */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Username *
                </label>
                <input
                  type="text"
                  required
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  placeholder="e.g. staff_ullal"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              {/* 4-Digit PIN */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  {modalMode === 'add' ? 'Security PIN (4 Digits) *' : 'Update Security PIN (Optional)'}
                </label>
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

              {/* Dynamic Role Selection (System Templates + Custom Roles) */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Role Assignment *
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white cursor-pointer"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {!r.is_system ? '(Custom Role)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {roles.find((r) => r.id === formRole)?.description || 'Assigned role policy'}
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

              {/* Active Status */}
              {modalMode === 'edit' && (
                <div className="pt-1 flex items-center justify-between border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-700">Account Active</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                  </label>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending || updateUserMutation.isPending}
                  className="py-2.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-md transition-all active:scale-[0.98] disabled:opacity-40"
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

      {/* MODAL 2: RESET PIN */}
      {modalMode === 'reset-pin' && targetUser && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-xs">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Reset PIN</h3>
                  <p className="text-[11px] text-slate-400">User: {targetUser.username}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!/^\d{4}$/.test(formPin.trim())) {
                  setErrorMessage('PIN must be exactly 4 numeric digits.');
                  return;
                }
                resetPinMutation.mutate({ userId: targetUser.id, newPin: formPin.trim() });
              }}
              className="space-y-3.5"
            >
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  New 4-Digit Security PIN *
                </label>
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

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetPinMutation.isPending}
                  className="py-2.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-md disabled:opacity-40"
                >
                  {resetPinMutation.isPending ? 'Updating...' : 'Set New PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ROLE PERMISSION MATRIX (CREATE / EDIT ROLE) */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full space-y-4 shadow-xl border border-slate-200 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-xs">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {editingRole
                      ? editingRole.is_system
                        ? `Inspect Permissions: ${editingRole.name}`
                        : `Edit Role: ${editingRole.name}`
                      : 'Create Custom Enterprise Role'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Configure granular module access privileges across the procurement lifecycle
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeRoleModal}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2 shrink-0">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Scrollable Form Body */}
            <form onSubmit={handleSubmitRoleForm} className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Role Display Name *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={editingRole?.is_system}
                    value={roleFormName}
                    onChange={(e) => {
                      setRoleFormName(e.target.value);
                      if (!editingRole) {
                        setRoleFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_'));
                      }
                    }}
                    placeholder="e.g. Shift Supervisor"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Role Identifier / Slug
                  </label>
                  <input
                    type="text"
                    disabled={!!editingRole}
                    value={roleFormSlug}
                    onChange={(e) => setRoleFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_'))}
                    placeholder="e.g. supervisor"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Role Description
                </label>
                <input
                  type="text"
                  disabled={editingRole?.is_system}
                  value={roleFormDescription}
                  onChange={(e) => setRoleFormDescription(e.target.value)}
                  placeholder="e.g. Weighbridge lead allowed to edit slips and view daily reports"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white disabled:opacity-60"
                />
              </div>

              {/* Categorized Permissions Matrix */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                    Modular Permissions Matrix
                  </span>
                  <span className="text-[11px] font-bold text-purple-700">
                    {roleFormPermissions.includes('*')
                      ? 'Full Access (*)'
                      : `${roleFormPermissions.length} selected`}
                  </span>
                </div>

                {editingRole?.id === 'owner' ? (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs">
                    <strong>Owner / Administrator:</strong> Has full unrestricted wildcard authority (<code>*</code>) across all system modules, pricing engines, and security configuration.
                  </div>
                ) : (
                  Object.entries(permissionsByCategory).map(([category, catPerms]) => {
                    const allSelected = catPerms.every((p) => roleFormPermissions.includes(p.key));

                    return (
                      <div
                        key={category}
                        className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50/50"
                      >
                        <div className="p-2.5 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                          <strong className="text-xs font-bold text-slate-800">{category}</strong>
                          {!editingRole?.is_system && (
                            <button
                              type="button"
                              onClick={() => handleToggleCategoryAll(catPerms)}
                              className="text-[11px] font-bold text-purple-700 hover:text-purple-900"
                            >
                              {allSelected ? 'Deselect All' : 'Select All'}
                            </button>
                          )}
                        </div>

                        <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {catPerms.map((perm) => {
                            const isChecked = roleFormPermissions.includes(perm.key);
                            return (
                              <label
                                key={perm.key}
                                className={`p-2 rounded-xl border flex items-start gap-2.5 transition-colors cursor-pointer select-none ${
                                  isChecked
                                    ? 'bg-purple-50/80 border-purple-300 text-purple-950 font-medium'
                                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                                } ${editingRole?.is_system ? 'cursor-default opacity-85' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  disabled={editingRole?.is_system}
                                  checked={isChecked}
                                  onChange={() => handleTogglePermission(perm.key)}
                                  className="mt-0.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                                />
                                <div>
                                  <div className="text-xs font-bold leading-tight">{perm.name}</div>
                                  <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                                    {perm.description}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={closeRoleModal}
                  className="py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs"
                >
                  {editingRole?.is_system ? 'Close' : 'Cancel'}
                </button>
                {!editingRole?.is_system && (
                  <button
                    type="submit"
                    disabled={createRoleMutation.isPending || updateRoleMutation.isPending}
                    className="py-2.5 px-5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md disabled:opacity-40"
                  >
                    {createRoleMutation.isPending || updateRoleMutation.isPending
                      ? 'Saving...'
                      : editingRole
                      ? 'Update Role Permissions'
                      : 'Create Custom Role'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: DELETE ROLE CONFIRMATION */}
      {deleteRoleTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Delete Role &ldquo;{deleteRoleTarget.name}&rdquo;?</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Are you sure you want to permanently delete this custom role? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setDeleteRoleTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteRoleMutation.mutate(deleteRoleTarget.id)}
                disabled={deleteRoleMutation.isPending}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
              >
                {deleteRoleMutation.isPending ? 'Deleting...' : 'Yes, Delete Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
