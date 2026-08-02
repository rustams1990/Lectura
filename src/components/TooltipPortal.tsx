import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

function getZoomScale(): number {
  if (typeof window === "undefined" || typeof document === "undefined") return 1;
  const zoomStr = document.documentElement?.style.zoom || document.body?.style.zoom;
  if (zoomStr) {
    const val = parseFloat(zoomStr);
    if (!isNaN(val)) return val / 100;
  }
  const saved = localStorage.getItem("vocab_clone_interface_zoom");
  if (saved) {
    const val = parseInt(saved, 10);
    if (!isNaN(val)) return val / 100;
  }
  return 1;
}

export const TooltipPortal = ({
  children,
  x,
  y,
  position
}: {
  children: React.ReactNode;
  x: number;
  y: number;
  position: "above" | "below";
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ left: x, top: y });

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    // Zoom factor correction if browser zoom is used
    const scale = getZoomScale();
    const zoomedX = x / scale;
    const zoomedY = y / scale;
    const zoomedWidth = width / scale;
    const zoomedHeight = height / scale;

    const viewportWidth = window.innerWidth / scale;
    const viewportHeight = window.innerHeight / scale;

    const margin = 12;
    
    let left = zoomedX - zoomedWidth / 2;
    let right = zoomedX + zoomedWidth / 2;
    
    if (left < margin) {
      left = margin;
    } else if (right > viewportWidth - margin) {
      left = viewportWidth - margin - zoomedWidth;
    }
    
    let top = zoomedY;
    if (position === "above") {
      top = zoomedY - zoomedHeight - 4; // minor adjustment to sit nicely above
    } else {
      top = zoomedY + 4; // minor adjustment to sit nicely below
    }
    
    // Clamp vertical position so it doesn't overflow top of page
    if (top < margin) {
      top = margin;
    } else if (top + zoomedHeight > viewportHeight - margin) {
      top = viewportHeight - margin - zoomedHeight;
    }

    setCoords({ left, top });
  }, [x, y, position]);

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: `${coords.left}px`,
        top: `${coords.top}px`,
        minWidth: "220px",
        maxWidth: "min(520px, 90vw)",
        width: "max-content",
        zIndex: 99999,
      }}
      className="pointer-events-none p-3 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-xl shadow-xl flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-100 text-left"
    >
      {children}
    </div>,
    document.body
  );
};
