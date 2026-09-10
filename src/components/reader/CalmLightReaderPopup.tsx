/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import CalmSheetWordCard, { CalmSheetWordCardProps } from "../CalmSheetWordCard";

/**
 * CalmLightReaderPopup (Web App Component)
 * Dedicated, fully isolated Lectura Web Reader Word Card Popup.
 * Connects strictly to Web App context/stores (VocabContext, useSettingsStore, IndexedDB).
 */
export const CalmLightReaderPopup: React.FC<CalmSheetWordCardProps> = (props) => {
  return <CalmSheetWordCard {...props} />;
};

export default CalmLightReaderPopup;
