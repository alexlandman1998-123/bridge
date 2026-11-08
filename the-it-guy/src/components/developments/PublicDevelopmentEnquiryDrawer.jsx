import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import PublicDevelopmentEnquiryForm from "./PublicDevelopmentEnquiryForm.jsx";
import "./public-estate-enquiry.css";
import MadisonReservationForm from "./MadisonReservationForm.jsx";

export default function PublicDevelopmentEnquiryDrawer({
  open,
  onClose,
  developmentName,
  agency,
  enquiry,
  reservationUnit = null,
  estatePresentation = false,
  reservationConfig,
  onRequestReservation,
}) {
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
      if (!estatePresentation || event.key !== "Tab") return;
      const elements = [...(panelRef.current?.querySelectorAll('button, input, select, textarea, a[href]') || [])].filter((element) => !element.disabled && element.tabIndex >= 0);
      const first = elements[0];
      const last = elements.at(-1);
      if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    if (estatePresentation) panelRef.current?.querySelector("input, [data-reservation-done]")?.focus({ preventScroll: true });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      if (estatePresentation && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, onClose, estatePresentation]);

  if (!open) return null;
  return (
    <div className={`fixed inset-0 flex items-end bg-black/45 backdrop-blur-sm${estatePresentation ? " estate-enquiry" : ""}`} style={{ zIndex: 100 }} role="dialog" aria-modal="true" aria-label="Enquire about this development" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={panelRef}
        className={`w-full overflow-y-auto rounded-t-3xl px-5 pt-6 text-[#14352c] shadow-2xl md:mx-auto md:max-w-2xl md:px-8${estatePresentation ? " estate-enquiry__panel" : ""}`}
        style={{ maxHeight: "92svh", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))", backgroundColor: "var(--development-surface, #f5f2eb)" }}
      >
        <div className={`mx-auto mb-5 flex max-w-xl items-start justify-between gap-4${estatePresentation ? " estate-enquiry__header" : ""}`}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-[#64766d]">{estatePresentation ? developmentName : "Make it home"}</p>
            <h2 className="mt-1 font-serif text-3xl leading-none">{reservationUnit ? `Reserve unit ${reservationUnit.unitNumber}.` : estatePresentation ? "Let’s talk." : "Let’s talk about your future home."}</h2>
            {estatePresentation ? <p className="estate-enquiry__intro">{reservationUnit ? "A little closer to your new home." : "Tell us what you have in mind. Our team will be in touch to help."}</p> : null}
          </div>
          <button onClick={onClose} aria-label="Close enquiry form" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#9eada5] text-[#14352c]"><X size={20} /></button>
        </div>
        <div className={`mx-auto max-w-xl${estatePresentation ? " estate-enquiry__body" : ""}`}>
          {estatePresentation && reservationUnit ? <MadisonReservationForm key={reservationUnit.id} unit={reservationUnit} config={reservationConfig} onRequest={onRequestReservation} onClose={onClose} /> : <PublicDevelopmentEnquiryForm key={reservationUnit?.id || "enquiry"} estatePresentation={estatePresentation} reservationUnit={reservationUnit} developmentName={developmentName} agency={agency} enquiry={enquiry} tone="light" />}
        </div>
      </section>
    </div>
  );
}
