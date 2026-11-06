import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setApiAuth } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('tally_fish_token'));
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('tally_fish_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [branches, setBranches] = useState(() => {
    const saved = localStorage.getItem('tally_fish_branches');
    return saved ? JSON.parse(saved) : [];
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setApiAuth(token);
  }, [token]);

  const login = async ({ username, pin }) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/login', { username, pin });
      if (res.success && res.token) {
        setToken(res.token);
        setUser(res.user);
        setBranches(res.branches || []);

        localStorage.setItem('tally_fish_token', res.token);
        localStorage.setItem('tally_fish_user', JSON.stringify(res.user));
        localStorage.setItem('tally_fish_branches', JSON.stringify(res.branches || []));

        return { success: true, user: res.user, branches: res.branches };
      }
      return { success: false, error: 'Login failed' };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Authentication error',
        remainingAttempts: err.data?.remainingAttempts,
      };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setBranches([]);
    setApiAuth(null);
    localStorage.removeItem('tally_fish_token');
    localStorage.removeItem('tally_fish_user');
    localStorage.removeItem('tally_fish_branches');
  };

  // Helper role checkers based on standardized 3 roles
  const hasRole = (allowedRoles, branchId) => {
    if (!user || !branches.length) return false;
    const target = branchId
      ? branches.find((b) => b.branch_id === branchId)
      : branches[0];
    if (!target) return false;
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    return roles.includes(target.role);
  };

  const isOwner = branches.some((b) => b.role === 'owner');
  const isBillingAdmin = (branchId) => hasRole(['billingAdmin', 'owner'], branchId);
  const isStaffAdmin = (branchId) => hasRole('staffAdmin', branchId);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        branches,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout,
        hasRole,
        isOwner,
        isBillingAdmin,
        isStaffAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

