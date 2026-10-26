import { useRef } from "react";
export default function InboxPanelDivider({
  panel,
  value,
  onResize,
  onMove,
  onReset,
}) {
  const dragging = useRef(false);
  const label =
    panel === "list" ? "Resize conversation list" : "Resize contact details";
  return (
    <div
      className="inbox-panel-divider"
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={panel === "list" ? 22 : 18}
      aria-valuemax={panel === "list" ? 50 : 34}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)} percent`}
      title={`${label} · drag or use arrow keys · double-click to reset`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        dragging.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        if (dragging.current) onMove(event.clientX);
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onLostPointerCapture={() => {
        dragging.current = false;
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) {
          event.preventDefault();
          if (event.key === "Home") {
            onReset();
            return;
          }
          const direction =
            (event.key === "ArrowRight" ? 1 : -1) *
            (panel === "details" ? -1 : 1);
          onResize(value + direction * (event.shiftKey ? 5 : 1));
        }
      }}
    >
      <span />
    </div>
  );
}
