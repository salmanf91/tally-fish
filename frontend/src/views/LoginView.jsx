import React, { useState } from 'react';
import { Scale, Lock, User, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NumericKeypad from '../components/common/NumericKeypad';

export default function LoginView() {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [remainingAttempts, setRemainingAttempts] = useState(null);

  const quickUsers = [
    { name: 'admin', label: 'Owner / Director', role: 'Owner', pin: '1234' },
    { name: 'billing_user', label: 'Billing Admin', role: 'Billing', pin: '2222' },
    { name: 'staff_ullal', label: 'Weighbridge Staff', role: 'Staff', pin: '1111' },
  ];

  const handleSelectQuickUser = (qu) => {
    setUsername(qu.name);
    setPin('');
    setError(null);
    setRemainingAttempts(null);
  };

  const handleLoginSubmit = async () => {
    if (!username) {
      setError('Please select or enter a username');
      return;
    }
    if (!pin || pin.length < 4) {
      setError('Please enter a 4-digit security PIN');
      return;
    }

    setError(null);
    const result = await login({ username, pin });

    if (!result.success) {
      setError(result.error);
      if (result.remainingAttempts !== undefined) {
        setRemainingAttempts(result.remainingAttempts);
      }
      setPin('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4 selection:bg-amber-200 selection:text-amber-900">
      <div className="w-full max-w-md mx-auto">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-amber-500 items-center justify-center shadow-md mb-2.5">
            <Scale className="w-8 h-8 text-white stroke-[2.5]" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center justify-center gap-1.5">
            TALLY FISH
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-bold">
              PRO
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Indo Fish Meal & Oil Co. Pvt. Ltd. | Secure Access
          </p>
        </div>

        {/* Main Login Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200">
          {/* Quick Role Selection Chips */}
          <div className="mb-5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2 text-center">
              Select Operator Profile
            </label>
            <div className="grid grid-cols-3 gap-2">
              {quickUsers.map((qu) => {
                const isSelected = username === qu.name;
                return (
                  <button
                    key={qu.name}
                    type="button"
                    onClick={() => handleSelectQuickUser(qu)}
                    className={`py-2 px-2 rounded-xl text-center transition-all touch-key border ${
                      isSelected
                        ? 'bg-amber-50 border-amber-400 text-amber-900 font-bold shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <div className="text-xs font-bold truncate">{qu.label}</div>
                    <div className="text-[10px] text-slate-400 truncate font-mono mt-0.5">PIN: {qu.pin}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Username Input if custom */}
          <div className="mb-4">
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 shadow-sm"
              />
            </div>
          </div>

          {/* PIN Display & Masked Dots */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1.5 px-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Enter 4-Digit Security PIN
              </span>
              <span className="text-[10px] text-amber-700 font-semibold flex items-center gap-1">
                <Lock className="w-3 h-3" /> Encrypted
              </span>
            </div>

            <div className="h-14 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center gap-4 px-4 shadow-inner">
              {[0, 1, 2, 3].map((index) => {
                const hasDigit = pin.length > index;
                return (
                  <div
                    key={index}
                    className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                      hasDigit
                        ? 'bg-amber-500 scale-125 shadow-sm'
                        : 'border-2 border-slate-300 bg-slate-200'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Error & Lockout Message */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{error}</p>
                {remainingAttempts !== null && (
                  <p className="text-[11px] text-rose-600 mt-0.5 font-medium">
                    Remaining attempts before temporary 15-min lockout: {remainingAttempts}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* On-Screen Touch Numeric Keypad */}
          <NumericKeypad
            value={pin}
            onChange={(newPin) => {
              if (newPin.length <= 4) {
                setPin(newPin);
              }
            }}
            onDone={handleLoginSubmit}
            onClear={() => setPin('')}
            allowDecimal={false}
          />
        </div>

        {/* Security Footer */}
        <div className="mt-6 text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Role-Based PIN Security | Multi-Branch Isolated</span>
        </div>
      </div>
    </div>
  );
}
