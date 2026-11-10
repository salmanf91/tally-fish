import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, X, Check } from 'lucide-react';

/**
 * SearchableSelect (Combobox) component
 * Supports keyboard navigation, touch selection, live filtering, and custom items.
 *
 * @param {string} value - Current value
 * @param {function} onChange - Value change callback (newVal) => void
 * @param {Array<string|{value: string, label: string, subtext?: string}>} options - Selectable items
 * @param {string} placeholder - Input placeholder
 * @param {string} [label] - Optional field label
 * @param {boolean} [required] - Shows required indicator
 * @param {string} [error] - Validation error message to display
 * @param {boolean} [disabled] - Disabled state
 * @param {boolean} [allowCustom] - Allow entering custom value
 * @param {string} [customActionLabel] - Optional button text for custom action (e.g. "Other...")
 * @param {function} [onCustomAction] - Callback when custom action button is clicked
 * @param {string} [className] - Additional wrapper class
 * @param {boolean} [autoUppercase] - Automatically uppercase entered text
 */
export default function SearchableSelect({
  value = '',
  onChange,
  options = [],
  placeholder = 'Search or select...',
  label,
  required = false,
  error,
  disabled = false,
  allowCustom = false,
  customActionLabel,
  onCustomAction,
  className = '',
  autoUppercase = true,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value || '');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Sync internal search term when external value changes
  useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

  // Normalize options to [{ value, label, subtext }]
  const normalizedOptions = useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt };
      }
      return {
        value: opt.value ?? opt.label,
        label: opt.label ?? opt.value,
        subtext: opt.subtext,
      };
    });
  }, [options]);

  // Filter options based on typed search term
  const filteredOptions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return normalizedOptions;
    return normalizedOptions.filter((opt) =>
      opt.label.toLowerCase().includes(q) ||
      (opt.subtext && opt.subtext.toLowerCase().includes(q))
    );
  }, [searchTerm, normalizedOptions]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
        // If closed without selection and not allowing custom, revert search term to selected value
        if (!allowCustom && value !== searchTerm) {
          setSearchTerm(value || '');
        }
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [value, searchTerm, allowCustom]);

  const handleSelect = (selectedVal) => {
    onChange(selectedVal);
    setSearchTerm(selectedVal);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleInputChange = (e) => {
    let nextVal = e.target.value;
    if (autoUppercase) nextVal = nextVal.toUpperCase();
    setSearchTerm(nextVal);
    setIsOpen(true);
    setHighlightedIndex(0);
    if (allowCustom) {
      onChange(nextVal);
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
    setIsOpen(false);
    if (inputRef.current) inputRef.current.focus();
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else {
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(filteredOptions.length - 1);
      } else {
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
      }
    } else if (e.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
        e.preventDefault();
        handleSelect(filteredOptions[highlightedIndex].value);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative w-full ${className}`}>
      {label && (
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
          {label} {required && <span className="text-amber-600">· Required</span>}
        </label>
      )}

      {/* Input Field with Search & Chevron Icons */}
      <div className="relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className={`w-full bg-slate-50 border rounded-xl pl-10 pr-16 py-2.5 text-sm font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:bg-white transition-all shadow-sm ${
            error
              ? 'border-rose-300 focus:border-rose-500 ring-1 ring-rose-200'
              : isOpen
              ? 'border-amber-500 ring-2 ring-amber-100 bg-white'
              : 'border-slate-300 hover:border-slate-400'
          }`}
        />

        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {searchTerm && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            onClick={() => !disabled && setIsOpen((prev) => !prev)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                isOpen ? 'rotate-180 text-amber-600' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div
            ref={listRef}
            className="max-h-60 overflow-y-auto py-1 divide-y divide-slate-100 selection:bg-amber-100"
          >
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-500 font-medium">
                No matching master records found for "{searchTerm}"
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = value === opt.value;
                const isHighlighted = highlightedIndex === idx;

                return (
                  <button
                    key={`${opt.value}_${idx}`}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between text-xs transition-colors touch-key ${
                      isSelected
                        ? 'bg-amber-50/80 text-amber-900 font-bold'
                        : isHighlighted
                        ? 'bg-slate-50 text-slate-900 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="truncate pr-2">
                      <span className="block truncate font-bold text-slate-800">
                        {opt.label}
                      </span>
                      {opt.subtext && (
                        <span className="block text-[10px] text-slate-400 font-normal truncate mt-0.5">
                          {opt.subtext}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-amber-600 shrink-0 stroke-[2.5]" />
                    )}
                  </button>
                );
              })
            )}

            {/* Custom action (e.g. "Other...") if provided */}
            {customActionLabel && onCustomAction && (
              <div className="p-1.5 bg-slate-50 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onCustomAction();
                  }}
                  className="w-full text-center py-2 px-3 rounded-xl border border-dashed border-amber-400 bg-amber-50/60 hover:bg-amber-100 text-amber-900 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>+ {customActionLabel}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <p className="text-[11px] font-semibold text-rose-600 mt-1 pl-1">
          {error}
        </p>
      )}
    </div>
  );
}

