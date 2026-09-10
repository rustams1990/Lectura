import React, { useMemo } from 'react';
import { matchLanguage, getItemLocalDateStr, filterDayActivityEntries } from '../services/activity';

export interface DayActivityLog {
  id: string | number;
  title: string;
  minutes: number;
  durationSeconds?: number;
  language?: string;
  targetLanguage?: string;
  flag?: string;
  channel?: string;
  source?: string;
  url?: string;
  timestamp?: string;
  date?: string;
  createdAt?: string;
}

export interface ActivityTabProps {
  dayEntries: DayActivityLog[];
  selectedDateStr: string;
  currentLanguageFilter: string;
  onDeleteLog?: (logId: string | number) => void;
}

/**
 * Filter day activity records by date and active language filter.
 * Matches local timezone dates and handles cross-format language codes (e.g. 'es' <-> 'Spanish').
 */
export function filterDayEntries(
  dayEntries: DayActivityLog[],
  selectedDateStr: string,
  currentLanguageFilter: string
): DayActivityLog[] {
  return filterDayActivityEntries(dayEntries, selectedDateStr, currentLanguageFilter);
}

/**
 * React Component representation of ActivityTab / Day History
 */
export const ActivityTab: React.FC<ActivityTabProps> = ({
  dayEntries,
  selectedDateStr,
  currentLanguageFilter,
  onDeleteLog,
}) => {
  const filteredEntries = useMemo(() => {
    return dayEntries.filter((entry) => {
      // 1. Check selected date (YYYY-MM-DD)
      const rawTime = entry.timestamp || entry.createdAt || entry.date;
      const entryDate = getItemLocalDateStr(rawTime) || entry.date || entry.createdAt?.slice(0, 10);
      const dateMatch = entryDate === selectedDateStr || (rawTime && rawTime.startsWith(selectedDateStr));

      // 2. Check language via normalization
      const entryLang = entry.language || entry.targetLanguage;
      const langMatch = matchLanguage(entryLang, currentLanguageFilter);

      return Boolean(dateMatch && langMatch);
    });
  }, [dayEntries, selectedDateStr, currentLanguageFilter]);

  if (filteredEntries.length === 0) {
    return (
      <div className="day-logs-empty">
        No activity recorded for this day
      </div>
    );
  }

  return (
    <div className="day-logs-list">
      {filteredEntries.map((log) => (
        <div key={log.id} className="history-item">
          <div className="history-item-content">
            <div className="history-item-header">
              <a href={log.url || '#'} target="_blank" rel="noopener noreferrer" className="history-item-title">
                {log.title}
              </a>
              <span className="history-item-minutes">{log.minutes} m</span>
            </div>
            <div className="history-item-meta">
              <span>{log.flag} {log.language}</span>
              <span>•</span>
              <span>{log.source || 'YouTube'}</span>
              <span>•</span>
              <span className="truncate">{log.channel || 'YouTube'}</span>
            </div>
          </div>
          {onDeleteLog && (
            <button
              type="button"
              className="delete-log-btn"
              onClick={() => onDeleteLog(log.id)}
              title="Delete"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default ActivityTab;
