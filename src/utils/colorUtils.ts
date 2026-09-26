/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Deterministic HSL Color Generator for topics and tags.
 * Generates unique, stable, high-contrast colors based on the topic name.
 */
export const getTopicColor = (topicName: string): string => {
  if (!topicName) {
    return '#9CA3AF'; // Фиксированный серый для Uncategorized
  }

  // Очищаем имя от лишних пробелов, символов решетки и приводим к нижнему регистру для стабильности хэша
  const cleanName = topicName.trim().replace(/^#+/, '').trim().toLowerCase();

  if (!cleanName || cleanName === 'uncategorized' || cleanName === 'без категории') {
    return '#9CA3AF';
  }

  // Детерминированный хэш из строки
  let hash = 0;
  for (let i = 0; i < cleanName.length; i++) {
    hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;

  // HSL с 70% насыщенности и 45% светлоты для гармоничных и контрастных цветов
  return `hsl(${hue}, 70%, 45%)`;
};
