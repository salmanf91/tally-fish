import React from 'react';
import { Delete, Check, RotateCcw } from 'lucide-react';

/**
 * Aesthetic, Tactile Custom Numeric Keypad in Clean Light Theme
 * Optimized for touchscreens, tablets, and rugged mobile use (< 1024px)
 */
export default function NumericKeypad({
  value = '',
  onChange,
  onDone,
  onClear,
  allowDecimal = true,
  maxDecimals = 2,
  quickChips = [],
  className = '',
}) {
  const triggerHaptic = () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(20);
      } catch {
        // Ignore devices blocking vibration
      }
    }
  };

  const handleDigit = (digit) => {
    triggerHaptic();
    let current = String(value || '');

    if (digit === '.') {
      if (!allowDecimal || current.includes('.')) return;
      if (current === '') current = '0';
      onChange(current + '.');
      return;
    }

    if (current === '0' && digit !== '.') {
      current = '';
    }

    if (current.includes('.')) {
      const parts = current.split('.');
      if (parts[1] && parts[1].length >= maxDecimals) {
        return;
      }
    }

    onChange(current + digit);
  };

  const handleBackspace = () => {
    triggerHaptic();
    const current = String(value || '');
    if (current.length > 0) {
      onChange(current.slice(0, -1));
    }
  };

  const handleClear = () => {
    triggerHaptic();
    if (onClear) {
      onClear();
    } else {
      onChange('');
    }
  };

  const handleAddDelta = (delta) => {
    triggerHaptic();
    const current = parseFloat(value) || 0;
    const nextVal = Math.max(0, current + delta);
    onChange(String(nextVal));
  };

  const digits = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    [allowDecimal ? '.' : '', '0', 'backspace'],
  ];

  return (
    <div className={`w-full max-w-sm mx-auto select-none p-2.5 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm ${className}`}>
      {/* Quick Add Chips (Tare, Ice Water, Boxes) */}
      {quickChips.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-2">
          {quickChips.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleAddDelta(chip.value)}
              className="touch-key py-2 text-xs font-bold rounded-xl bg-amber-50 text-amber-800 border border-amber-200 active:bg-amber-100 hover:border-amber-300 transition-all shadow-sm"
            >
              +{chip.label || chip.value}
            </button>
          ))}
        </div>
      )}

      {/* Numeric Grid */}
      <div className="grid grid-cols-3 gap-2">
        {digits.flat().map((item, idx) => {
          if (item === '') {
            return <div key={idx} className="h-14" />;
          }

          if (item === 'backspace') {
            return (
              <button
                key={idx}
                type="button"
                onClick={handleBackspace}
                className="touch-key h-14 flex items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-200 active:bg-rose-100 transition-all shadow-sm"
                aria-label="Backspace"
              >
                <Delete className="w-6 h-6 stroke-[2.2]" />
              </button>
            );
          }

          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleDigit(item)}
              className="touch-key h-14 flex items-center justify-center rounded-xl bg-white text-2xl font-bold text-slate-800 border border-slate-200 active:bg-slate-100 hover:border-slate-300 transition-all shadow-sm"
            >
              {item}
            </button>
          );
        })}
      </div>

      {/* Bottom Action Row: Clear & Done */}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          type="button"
          onClick={handleClear}
          className="touch-key h-12 flex items-center justify-center gap-1.5 rounded-xl bg-white text-slate-600 font-bold text-xs border border-slate-200 active:bg-slate-100 transition-all shadow-sm"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          Clear
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic();
            if (onDone) onDone();
          }}
          className="touch-key h-12 flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-md active:scale-[0.98] transition-all"
        >
          <Check className="w-4 h-4 stroke-[2.5]" />
          Confirm / Done
        </button>
      </div>
    </div>
  );
}
