import React, { useState, useRef, useEffect, useId } from 'react';
import { Clock, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';

export interface AppTimePickerProps {
  value: string; // Expected in HH:mm (24-hour, e.g. "00:00", "14:30")
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  onBlur?: () => void;
}

/**
 * Normalizes a raw string to valid 24-hour HH:mm.
 * Fallback to default if invalid.
 */
function normalize24hTime(raw: string, fallback = '00:00'): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  // e.g. "9:5" -> "09:05", "14:3" -> "14:03", "9:30" -> "09:30"
  const parts = trimmed.split(':');
  if (parts.length === 2) {
    let h = parseInt(parts[0], 10);
    let m = parseInt(parts[1], 10);
    if (isNaN(h)) h = 0;
    if (isNaN(m)) m = 0;
    h = Math.max(0, Math.min(23, h));
    m = Math.max(0, Math.min(59, m));
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // If user typed 3 or 4 digits without colon, e.g. "930" -> "09:30", "1430" -> "14:30"
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 3) {
    const h = Math.min(23, parseInt(digits.slice(0, 1), 10));
    const m = Math.min(59, parseInt(digits.slice(1, 3), 10));
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  if (digits.length === 4) {
    const h = Math.min(23, parseInt(digits.slice(0, 2), 10));
    const m = Math.min(59, parseInt(digits.slice(2, 4), 10));
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return fallback;
}

export const AppTimePicker: React.FC<AppTimePickerProps> = ({
  value,
  onChange,
  className = '',
  inputClassName = '',
  disabled = false,
  id,
  placeholder = '14:30',
  onBlur,
}) => {
  const { t } = useTranslation();
  const generatedId = useId();
  const inputId = id || generatedId;
  const timeFormat = useSettingsStore((s) => s.timeFormat);

  // Local text state for smooth user typing
  const [textValue, setTextValue] = useState(() => value || '00:00');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoursListRef = useRef<HTMLDivElement>(null);
  const minutesListRef = useRef<HTMLDivElement>(null);

  // Sync with value prop if it changes externally
  useEffect(() => {
    setTextValue(value || '00:00');
  }, [value]);

  // Parse current selected hour and minute
  const [currH, currM] = (value || '00:00').split(':').map((s) => parseInt(s, 10) || 0);

  // Close popover on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Auto-scroll selected hour/minute into view when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        const selectedHourEl = hoursListRef.current?.querySelector('[data-selected="true"]');
        if (selectedHourEl) {
          selectedHourEl.scrollIntoView({ block: 'nearest' });
        }
        const selectedMinEl = minutesListRef.current?.querySelector('[data-selected="true"]');
        if (selectedMinEl) {
          selectedMinEl.scrollIntoView({ block: 'nearest' });
        }
      }, 50);
    }
  }, [isOpen]);

  // Masking input change handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow digits and colon only, max length 5
    const filtered = raw.replace(/[^\d:]/g, '').slice(0, 5);

    // Auto-insert colon if user typed 2 digits without colon (e.g. "14" -> "14:")
    let formatted = filtered;
    if (filtered.length === 2 && !filtered.includes(':') && raw.length > textValue.length) {
      formatted = `${filtered}:`;
    }

    setTextValue(formatted);

    // If completely matches HH:mm (5 chars), validate and commit
    if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(formatted)) {
      onChange(formatted);
    }
  };

  const handleInputBlur = () => {
    const normalized = normalize24hTime(textValue, value || '00:00');
    setTextValue(normalized);
    onChange(normalized);
    onBlur?.();
  };

  const handleSelectHour = (hour: number) => {
    const hStr = String(hour).padStart(2, '0');
    const mStr = String(currM).padStart(2, '0');
    const updated = `${hStr}:${mStr}`;
    setTextValue(updated);
    onChange(updated);
  };

  const handleSelectMinute = (min: number) => {
    const hStr = String(currH).padStart(2, '0');
    const mStr = String(min).padStart(2, '0');
    const updated = `${hStr}:${mStr}`;
    setTextValue(updated);
    onChange(updated);
  };

  const handleSetNow = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const updated = `${h}:${m}`;
    setTextValue(updated);
    onChange(updated);
  };

  const handleSetPreset = (preset: string) => {
    setTextValue(preset);
    onChange(preset);
  };

  // Format 12h preview if user has 12h mode in settings
  const format12hPreview = (h: number, m: number) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
  };

  const hoursArray = Array.from({ length: 24 }, (_, i) => i);
  const minutesArray = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl transition-all focus-within:ring-2 focus-within:ring-teal-500/20 focus-within:border-teal-500/60 ${
          disabled ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''
        } ${inputClassName}`}
      >
        <button
          type="button"
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          className="text-teal-600 dark:text-teal-400 p-0.5 rounded hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          title={t('common.select_time', 'Select time')}
          tabIndex={-1}
        >
          <Clock className="w-3.5 h-3.5" />
        </button>

        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          pattern="^([01]\d|2[0-3]):([0-5]\d)$"
          placeholder={placeholder}
          maxLength={5}
          value={textValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          disabled={disabled}
          className="w-full bg-transparent text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-100 outline-none placeholder-zinc-400 select-all"
        />

        {timeFormat === '12h' && (
          <span className="text-[10px] text-zinc-400 font-mono shrink-0 select-none">
            {format12hPreview(currH, currM)}
          </span>
        )}
      </div>

      {/* Popover selector */}
      {isOpen && (
        <div className="absolute left-0 sm:right-auto z-[9999] mt-1.5 w-60 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-3 animate-in fade-in zoom-in-95 duration-150 select-none font-sans">
          {/* Quick Presets Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100 dark:border-zinc-800 gap-1 overflow-x-auto text-[10px]">
            <button
              type="button"
              onClick={handleSetNow}
              className="px-2 py-1 font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-900/80 transition-colors cursor-pointer shrink-0"
            >
              {t('common.now', 'Now')}
            </button>
            <button
              type="button"
              onClick={() => handleSetPreset('00:00')}
              className="px-1.5 py-1 font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            >
              00:00
            </button>
            <button
              type="button"
              onClick={() => handleSetPreset('09:00')}
              className="px-1.5 py-1 font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            >
              09:00
            </button>
            <button
              type="button"
              onClick={() => handleSetPreset('12:00')}
              className="px-1.5 py-1 font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            >
              12:00
            </button>
            <button
              type="button"
              onClick={() => handleSetPreset('18:00')}
              className="px-1.5 py-1 font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            >
              18:00
            </button>
          </div>

          {/* Time Picker Columns */}
          <div className="grid grid-cols-2 gap-2">
            {/* Hours Column */}
            <div>
              <div className="text-[9px] font-black uppercase tracking-wider text-zinc-400 pb-1 text-center">
                {t('common.hours', 'Hours')} (00-23)
              </div>
              <div
                ref={hoursListRef}
                className="max-h-48 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-700"
              >
                {hoursArray.map((h) => {
                  const isSelected = h === currH;
                  const hStr = String(h).padStart(2, '0');
                  return (
                    <button
                      key={h}
                      type="button"
                      data-selected={isSelected}
                      onClick={() => handleSelectHour(h)}
                      className={`w-full py-1 px-2 rounded-lg text-xs font-mono font-bold flex items-center justify-between transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span>{hStr}</span>
                      {timeFormat === '12h' && (
                        <span className="text-[9px] opacity-70">
                          {h % 12 === 0 ? 12 : h % 12} {h >= 12 ? 'PM' : 'AM'}
                        </span>
                      )}
                      {isSelected && <Check className="w-3 h-3" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Minutes Column */}
            <div>
              <div className="text-[9px] font-black uppercase tracking-wider text-zinc-400 pb-1 text-center">
                {t('common.minutes', 'Minutes')} (00-59)
              </div>
              <div
                ref={minutesListRef}
                className="max-h-48 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-700"
              >
                {minutesArray.map((m) => {
                  const isSelected = m === currM;
                  const mStr = String(m).padStart(2, '0');
                  return (
                    <button
                      key={m}
                      type="button"
                      data-selected={isSelected}
                      onClick={() => handleSelectMinute(m)}
                      className={`w-full py-1 px-2 rounded-lg text-xs font-mono font-bold flex items-center justify-between transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span>{mStr}</span>
                      {isSelected && <Check className="w-3 h-3" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-2 mt-2 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              {t('common.done', 'Done')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
