import React, { useState } from 'react';
import { Users, KeyRound, Check, RefreshCw } from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { api } from '../services/api';

export default function AccountsView() {
  const { activeBranchId, activeBranch } = useBranch();
  const [resetMessage, setResetMessage] = useState('');

  // Sample active accounts seeded in DB
  const [accounts, setAccounts] = useState([
    { id: '1', username: 'staff_ullal', role: 'Staff', fullRole: 'staffAdmin', branch: 'Ullal Port' },
    { id: '2', username: 'billing_user', role: 'Billing', fullRole: 'billingAdmin', branch: 'Ullal Port' },
    { id: '3', username: 'admin', role: 'Owner', fullRole: 'owner', branch: 'Company Wide' },
  ]);

  const handleResetPin = async (account) => {
    const newPin = String(Math.floor(1000 + Math.random() * 9000));
    try {
      // In a real API call, calls /api/auth/reset-pin
      setResetMessage(`Temporary PIN for ${account.username} reset to: ${newPin}`);
    } catch (err) {
      setResetMessage(`Failed to reset PIN: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      {/* Header */}
      <div className="light-card p-4 rounded-2xl flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-slate-900">Operator Accounts</h2>
          <p className="text-xs text-slate-500">
            Branch: <strong className="text-slate-800">{activeBranch?.branch_name}</strong>
          </p>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
          Owner Control
        </span>
      </div>

      {resetMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{resetMessage}</span>
        </div>
      )}

      {/* Accounts List */}
      <div className="space-y-2.5">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
          Active Accounts · {accounts.length}
        </div>

        {accounts.map((acc) => (
          <div key={acc.id} className="light-card p-4 rounded-2xl flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-slate-900">{acc.username}</h4>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    acc.role === 'Staff'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : acc.role === 'Billing'
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  {acc.role}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Scope: {acc.branch}</p>
            </div>

            <button
              type="button"
              onClick={() => handleResetPin(acc)}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center gap-1 shadow-sm transition-all"
            >
              <KeyRound className="w-3.5 h-3.5 text-slate-400" /> Reset PIN
            </button>
          </div>
        ))}
      </div>

      {/* Explanatory Policy Note from Mockup */}
      <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 text-xs text-slate-600 leading-relaxed space-y-1.5">
        <p>
          <strong>Staff</strong> add and edit intake entries until admin sets the rate, then the entry locks.
        </p>
        <p>
          <strong>Billing</strong> reviews and edits rates after admin sets them and handles client statements.
        </p>
        <p>
          <strong>Staff cannot see rates</strong> or the daily financial statements.
        </p>
      </div>
    </div>
  );
}

