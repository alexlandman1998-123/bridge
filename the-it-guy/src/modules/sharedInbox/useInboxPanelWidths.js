import { useState } from "react";
const KEY = "arch9.inbox.panel-widths.v1";
const DEFAULTS = { list: 32, details: 24 };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export default function useInboxPanelWidths() {
  const [widths, setWidths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      return {
        list: Number.isFinite(saved?.list)
          ? clamp(saved.list, 22, 50)
          : DEFAULTS.list,
        details: Number.isFinite(saved?.details)
          ? clamp(saved.details, 18, 34)
          : DEFAULTS.details,
      };
    } catch {
      return DEFAULTS;
    }
  });
  const update = (next) => {
    setWidths(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* Resizing still works when preference storage is unavailable. */
    }
  };
  return {
    widths,
    resize: (panel, percent) =>
      update({
        ...widths,
        [panel]: clamp(
          percent,
          panel === "list" ? 22 : 18,
          panel === "list" ? 50 : 34,
        ),
      }),
    reset: () => update({ ...DEFAULTS }),
  };
}
