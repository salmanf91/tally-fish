import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { setApiBranch } from '../services/api';

const BranchContext = createContext(null);

export function BranchProvider({ children }) {
  const { branches, isAuthenticated } = useAuth();
  const [activeBranchId, setActiveBranchIdState] = useState(() => {
    return localStorage.getItem('tally_fish_branch_id') || null;
  });

  // Automatically validate and select the default branch on login
  useEffect(() => {
    if (!isAuthenticated || branches.length === 0) {
      setActiveBranchIdState(null);
      setApiBranch(null);
      return;
    }

    const savedId = localStorage.getItem('tally_fish_branch_id');
    const isValidSaved = branches.some((b) => b.branch_id === savedId);

    if (isValidSaved) {
      setActiveBranchIdState(savedId);
      setApiBranch(savedId);
    } else {
      // Default to primary operating branch (ULLAL if available, else first assigned)
      const primaryBranch = branches.find((b) => b.branch_code === 'ULLAL') || branches[0];
      const defaultId = primaryBranch.branch_id;
      setActiveBranchIdState(defaultId);
      setApiBranch(defaultId);
      localStorage.setItem('tally_fish_branch_id', defaultId);
    }
  }, [branches, isAuthenticated]);

  const setActiveBranchId = (branchId) => {
    setActiveBranchIdState(branchId);
    setApiBranch(branchId);
  };

  const activeBranch = branches.find((b) => b.branch_id === activeBranchId) || branches[0] || null;
  const currentRole = activeBranch ? activeBranch.role : null;

  return (
    <BranchContext.Provider
      value={{
        activeBranchId,
        activeBranch,
        currentRole,
        availableBranches: branches,
        setActiveBranchId,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
}

