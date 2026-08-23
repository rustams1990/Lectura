/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";

export interface PopoverPosition {
  top: number;
  left: number;
  placement: "top" | "bottom";
}

export function getSmartPopoverPosition(
  target: HTMLElement | DOMRect | { top: number; bottom: number; left: number; right: number; width: number; height: number },
  popupWidth: number = 430,
  estimatedHeight: number = 360
): PopoverPosition {
  const rect = "getBoundingClientRect" in target ? target.getBoundingClientRect() : target;
  const screenPadding = 16;
  const gap = 8;

  const scrollX = typeof window !== "undefined" ? window.scrollX || window.pageXOffset || 0 : 0;
  const scrollY = typeof window !== "undefined" ? window.scrollY || window.pageYOffset || 0 : 0;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;

  const effectiveWidth = Math.min(popupWidth, viewportWidth - screenPadding * 2);

  // 1. Horizontal positioning (centered relative to word and kept within viewport)
  let left = rect.left + (rect.width / 2) - (effectiveWidth / 2);
  left = Math.max(screenPadding, Math.min(left, viewportWidth - effectiveWidth - screenPadding));

  // 2. Check space below vs space above
  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;

  let top: number;
  let placement: "top" | "bottom" = "bottom";

  // If space below is less than estimatedHeight + gap (or 380px) and there's more space above than below:
  if (spaceBelow < estimatedHeight + gap && spaceAbove > spaceBelow) {
    // Open strictly ABOVE the word (so word and rows below remain visible)
    placement = "top";
    top = rect.top - estimatedHeight - gap;
    if (top < screenPadding) {
      top = screenPadding;
    }
  } else {
    // Open BELOW the word
    placement = "bottom";
    top = rect.bottom + gap;
  }

  return {
    top: top + scrollY,
    left: left + scrollX,
    placement,
  };
}

export function getPopoverPosition(
  target: HTMLElement | DOMRect | { top: number; bottom: number; left: number; right: number; width: number; height: number },
  popupWidth: number = 430,
  popupHeight: number = 360
): PopoverPosition {
  return getSmartPopoverPosition(target, popupWidth, popupHeight);
}

export function usePopoverPosition(
  targetEl: HTMLElement | null,
  targetRect: DOMRect | null,
  popupWidth: number = 430,
  popupHeight: number = 360
) {
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const updatePosition = useCallback(() => {
    if (targetEl) {
      setPosition(getSmartPopoverPosition(targetEl, popupWidth, popupHeight));
    } else if (targetRect) {
      setPosition(getSmartPopoverPosition(targetRect, popupWidth, popupHeight));
    } else {
      setPosition(null);
    }
  }, [targetEl, targetRect, popupWidth, popupHeight]);

  useEffect(() => {
    updatePosition();

    if (!targetEl && !targetRect) return;

    const handleResize = () => updatePosition();
    const handleScroll = () => updatePosition();

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [targetEl, targetRect, updatePosition]);

  return position;
}
