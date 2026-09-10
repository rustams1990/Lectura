import React, { useState, useRef, useEffect, useMemo, useId } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';
import { formatAppDate, getAppFirstDayOfWeek, formatToDbDate } from '../../utils/dateFormatter';
import { resolveLocale, getWeekDayLabels } from '../../utils/dateUtils';

export interface AppDatePickerProps {
  value: string; // Expected in YYYY-MM-DD format
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  minDate?: string | Date;
  maxDate?: string | Date;
  id?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  allowClear?: boolean;
}

export const AppDatePicker: React.FC<AppDatePickerProps> = ({
  value,
  onChange,
  placeholder,
  className = '',
  inputClassName = '',
  disabled = false,
  minDate,
  maxDate,
  id,
  autoFocus = false,
  onBlur,
  allowClear = false,
}) => {
  const { t, i18n } = useTranslation();
  const generatedId = useId();
  const inputId = id || generatedId;
  const dateFormat = useSettingsStore((s) => s.dateFormat);
  const firstDayOfWeek = useSettingsStore((s) => s.firstDayOfWeek);

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial selected date
  const selectedDate = useMemo(() => {
    if (!value) return null;
    const parts = value.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dt = new Date(y, m, d);
      if (!isNaN(dt.getTime())) return dt;
    }
    const fallback = new Date(value);
    return isNaN(fallback.getTime()) ? null : fallback;
  }, [value]);

  // Calendar navigation state (viewYear and viewMonth: 0-11)
  const [viewYear, setViewYear] = useState<number>(() => {
    return selectedDate ? selectedDate.getFullYear() : new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    return selectedDate ? selectedDate.getMonth() : new Date().getMonth();
  });

  // Sync view when opened with current selection
  useEffect(() => {
    if (isOpen) {
      if (selectedDate) {
        setViewYear(selectedDate.getFullYear());
        setViewMonth(selectedDate.getMonth());
      } else {
        const today = new Date();
        setViewYear(today.getFullYear());
        setViewMonth(today.getMonth());
      }
    }
  }, [isOpen, selectedDate]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        onBlur?.();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onBlur]);

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

  const appFirstDay = useMemo(() => {
    return getAppFirstDayOfWeek(firstDayOfWeek);
  }, [firstDayOfWeek]);

  // Weekday labels (e.g. Mon, Tue or Пн, Вт)
  const weekDayLabels = useMemo(() => {
    return getWeekDayLabels(appFirstDay, i18n.language, 'short');
  }, [appFirstDay, i18n.language]);

  // Localized Month & Year header
  const monthName = useMemo(() => {
    const d = new Date(viewYear, viewMonth, 1);
    const locale = resolveLocale(i18n.language);
    const str = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d);
    return str.charAt(0).toUpperCase() + str.slice(1);
  }, [viewYear, viewMonth, i18n.language]);

  // Calendar Grid Days
  const calendarDays = useMemo(() => {
    const days: Array<{
      date: Date;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      isDisabled: boolean;
    }> = [];

    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);

    let startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday, 1 = Monday
    if (appFirstDay === 1) {
      // Monday as first day: shift Sunday (0) to 7
      startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    }

    const todayStr = formatToDbDate(new Date());
    const minDStr = minDate ? formatToDbDate(minDate) : '';
    const maxDStr = maxDate ? formatToDbDate(maxDate) : '';

    // Previous month padding days
    const prevMonthLastDay = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth - 1, prevMonthLastDay - i);
      const dateStr = formatToDbDate(d);
      const isDis = (!!minDStr && dateStr < minDStr) || (!!maxDStr && dateStr > maxDStr);
      days.push({
        date: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: !!selectedDate && dateStr === formatToDbDate(selectedDate),
        isDisabled: isDis,
      });
    }

    // Current month days
    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
      const d = new Date(viewYear, viewMonth, day);
      const dateStr = formatToDbDate(d);
      const isDis = (!!minDStr && dateStr < minDStr) || (!!maxDStr && dateStr > maxDStr);
      days.push({
        date: d,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: !!selectedDate && dateStr === formatToDbDate(selectedDate),
        isDisabled: isDis,
      });
    }

    // Next month padding days to make full rows (multiples of 7)
    const remainingDays = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remainingDays; i++) {
      const d = new Date(viewYear, viewMonth + 1, i);
      const dateStr = formatToDbDate(d);
      const isDis = (!!minDStr && dateStr < minDStr) || (!!maxDStr && dateStr > maxDStr);
      days.push({
        date: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: !!selectedDate && dateStr === formatToDbDate(selectedDate),
        isDisabled: isDis,
      });
    }

    return days;
  }, [viewYear, viewMonth, appFirstDay, selectedDate, minDate, maxDate]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (dateStr: string, isDisabled: boolean) => {
    if (isDisabled || disabled) return;
    onChange(dateStr);
    setIsOpen(false);
    onBlur?.();
  };

  const handleSelectToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const todayStr = formatToDbDate(new Date());
    onChange(todayStr);
    setIsOpen(false);
    onBlur?.();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
    onBlur?.();
  };

  const formattedDisplayValue = useMemo(() => {
    if (!selectedDate) return '';
    return formatAppDate(selectedDate, dateFormat);
  }, [selectedDate, dateFormat]);

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger input element */}
      <div
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={`flex items-center gap-2 cursor-pointer transition-all ${
          disabled ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''
        }`}
      >
        <div
          id={inputId}
          tabIndex={disabled ? -1 : 0}
          autoFocus={autoFocus}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!disabled) setIsOpen((prev) => !prev);
            }
          }}
          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-zinc-800 dark:text-zinc-100 shadow-3xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors select-none focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${inputClassName}`}
        >
          <div className="flex items-center gap-2 truncate">
            <CalendarIcon className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
            <span className={formattedDisplayValue ? 'font-mono' : 'text-zinc-400 font-normal'}>
              {formattedDisplayValue || placeholder || t('common.select_date', 'Select date...')}
            </span>
          </div>

          {allowClear && value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              title={t('common.clear', 'Clear')}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Calendar Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 z-[9999] mt-1.5 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl p-3 animate-in fade-in zoom-in-95 duration-150 select-none font-sans">
          {/* Header Month/Year and navigation */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate">
              {monthName}
            </span>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {weekDayLabels.map((lbl, idx) => (
              <span key={idx} className="text-[10px] font-black uppercase text-zinc-400 dark:text-zinc-500 py-0.5">
                {lbl}
              </span>
            ))}
          </div>

          {/* Day tiles */}
          <div className="grid grid-cols-7 gap-1 text-center font-mono">
            {calendarDays.map((dayItem, idx) => {
              const { isCurrentMonth, isToday, isSelected, isDisabled, dateStr, date } = dayItem;
              return (
                <button
                  key={`${dateStr}-${idx}`}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelectDay(dateStr, isDisabled)}
                  className={`h-7 w-7 mx-auto rounded-lg text-xs flex items-center justify-center transition-all cursor-pointer ${
                    isDisabled
                      ? 'opacity-30 cursor-not-allowed text-zinc-400'
                      : isSelected
                      ? 'bg-teal-500 text-white font-black shadow-2xs scale-105'
                      : isToday
                      ? 'border border-teal-500 text-teal-600 dark:text-teal-400 font-bold bg-teal-50/50 dark:bg-teal-950/20'
                      : isCurrentMonth
                      ? 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold'
                      : 'text-zinc-400 dark:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          {/* Action footer */}
          <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px]">
            <button
              type="button"
              onClick={handleSelectToday}
              className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 font-black cursor-pointer px-1 py-0.5 rounded transition-colors"
            >
              {t('common.today', 'Today')}
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 font-bold cursor-pointer px-1 py-0.5 rounded transition-colors"
            >
              {t('common.close', 'Close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppDatePicker;
