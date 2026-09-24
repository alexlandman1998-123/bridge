import { X } from "lucide-react";
import { useEffect } from "react";
import PublicDevelopmentEnquiryForm from "./PublicDevelopmentEnquiryForm.jsx";

export default function PublicDevelopmentEnquiryDrawer({
  open,
  onClose,
  developmentName,
  agency,
  enquiry,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => event.key === "Escape" && onClose();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end bg-black/45 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Enquire about this development" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="max-h-[92svh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--development-surface,#f5f2eb)] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 text-[#14352c] shadow-[0_-20px_60px_rgba(0,0,0,.22)] md:mx-auto md:max-w-2xl md:rounded-t-[28px] md:px-8">
        <div className="mx-auto mb-5 flex max-w-xl items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-[#64766d]">Make it home</p>
            <h2 className="mt-1 font-serif text-3xl leading-none">Let’s talk about your future home.</h2>
          </div>
          <button onClick={onClose} aria-label="Close enquiry form" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#9eada5] text-[#14352c]"><X size={20} /></button>
        </div>
        <div className="mx-auto max-w-xl">
          <PublicDevelopmentEnquiryForm developmentName={developmentName} agency={agency} enquiry={enquiry} tone="light" />
        </div>
      </section>
    </div>
  );
}
