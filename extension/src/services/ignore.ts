/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Direct unified access to Lectura's Auto-Ignore List engine for the Browser Extension.
 * Provides instant O(1) checks against Cities, Names, Tech brands, Gaming, Cinema, Music, Brands, Anglicisms.
 */

import {
  ignoreListManager,
  type AutoIgnoreResult,
  type IgnoreCategoryId,
  IGNORE_CATEGORIES_CONFIG,
  DEFAULT_IGNORE_CATEGORIES,
} from '../../../src/services/ignoreListService';

export {
  ignoreListManager,
  type AutoIgnoreResult,
  type IgnoreCategoryId,
  IGNORE_CATEGORIES_CONFIG,
  DEFAULT_IGNORE_CATEGORIES,
};

/**
 * Returns localized badge label and icon for an auto-ignored result
 */
export function getLocalizedIgnoreBadge(
  result: AutoIgnoreResult,
  uiLang: string = 'en'
): { label: string; icon: string; fullTitle: string } {
  const isRu = uiLang.startsWith('ru');
  const isEs = uiLang.startsWith('es');
  const isDe = uiLang.startsWith('de');

  const catName = isRu 
    ? (result.shortNameRu || result.categoryLabelRu || 'Игнор')
    : (result.shortNameEn || result.categoryLabelEn || 'Ignore');

  const prefix = isRu ? 'Игнор' : (isEs ? 'Ignorado' : (isDe ? 'Ignorieren' : 'Ignore'));
  const fullTitle = `${prefix}: ${catName}`;

  return {
    label: fullTitle,
    icon: result.icon || '🚫',
    fullTitle,
  };
}
