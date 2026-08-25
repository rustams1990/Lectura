import { useMemo, useCallback } from 'react';
import { ReaderSettings } from '../types';
import { resolveEffectiveReaderSettings, createScopedSettingsPatch } from '../utils/readerSettingsUtils';

export function useReaderSettings(
  rawSettings: ReaderSettings,
  onUpdateSettings: (settings: ReaderSettings) => void,
  lessonType?: string
) {
  const effectiveSettings = useMemo(() => {
    return resolveEffectiveReaderSettings(rawSettings, lessonType);
  }, [rawSettings, lessonType]);

  const updateScopedSettings = useCallback((patch: Partial<ReaderSettings>) => {
    const nextSettings = createScopedSettingsPatch(rawSettings, patch, lessonType);
    onUpdateSettings(nextSettings);
  }, [rawSettings, onUpdateSettings, lessonType]);

  return {
    effectiveSettings,
    updateScopedSettings,
  };
}
