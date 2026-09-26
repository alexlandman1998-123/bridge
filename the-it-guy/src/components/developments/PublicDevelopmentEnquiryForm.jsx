import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

const text = (value) => String(value || "").trim();

function contactUrl(baseUrl, developmentName, form) {
  const note = [
    `New enquiry for ${developmentName}.`,
    `Name: ${form.name}`,
    `Email: ${form.email}`,
    `Phone: ${form.phone}`,
    `Interest: ${form.interest}`,
    form.message ? `Message: ${form.message}` : "",
  ].filter(Boolean).join("\n");
  const source = text(baseUrl);
  if (/wa\.me|whatsapp\.com/i.test(source)) {
    const url = new URL(source);
    url.searchParams.set("text", note);
    return url.toString();
  }
  if (/^mailto:/i.test(source)) {
    const url = new URL(source);
    url.searchParams.set("subject", `Enquiry: ${developmentName}`);
    url.searchParams.set("body", note);
    return url.toString();
  }
  return "";
}

export default function PublicDevelopmentEnquiryForm({ developmentName, agency, enquiry, tone = "dark" }) {
  const isLight = tone === "light";
  const fieldClass = isLight
    ? "border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:border-slate-800"
    : "border-white/20 bg-white text-[#14352c] placeholder:text-[#819087] focus:border-white";
  const [form, setForm] = useState(() => {
    let interest = developmentName;
    try {
      interest = window.sessionStorage.getItem("arch9:development-enquiry-interest") || interest;
      window.sessionStorage.removeItem("arch9:development-enquiry-interest");
    } catch {
      // Session storage can be unavailable; keep the development name as the default.
    }
    return { name: "", email: "", phone: "", message: "", interest };
  });
  const [status, setStatus] = useState("");
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  useEffect(() => {
    const setInterest = (event) => {
      const interest = text(event.detail) || developmentName;
      setForm((current) => ({ ...current, interest }));
    };
    window.addEventListener("arch9:development-enquiry-interest", setInterest);
    return () => window.removeEventListener("arch9:development-enquiry-interest", setInterest);
  }, [developmentName]);
  const submit = (event) => {
    event.preventDefault();
    const destination = contactUrl(enquiry, developmentName, form);
    if (!destination) {
      setStatus("The sales contact route has not been configured yet. Please try again shortly.");
      return;
    }
    window.open(destination, "_blank", "noopener,noreferrer");
    setStatus("Your enquiry is ready to send in the sales team’s contact channel.");
  };

  return (
    <form onSubmit={submit} className={`rounded-[20px] border p-5 md:p-6 ${isLight ? "border-slate-200 bg-white shadow-sm" : "border-white/20 bg-white/[0.07] backdrop-blur-sm"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[.16em] ${isLight ? "text-slate-600" : "text-white/65"}`}>Enquire</p>
          <h3 className={`mt-1 font-serif text-2xl ${isLight ? "text-slate-800" : "text-white"}`}>Talk to the sales team.</h3>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${isLight ? "border-slate-300 text-slate-700" : "border-white/25 text-white/75"}`}>{agency}</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className={`grid gap-1.5 text-xs font-medium ${isLight ? "text-slate-700" : "text-white/80"}`}>Full name<input required name="name" value={form.name} onChange={update("name")} placeholder="Your name" className={`h-11 rounded-lg border px-3 text-sm outline-none ring-0 ${fieldClass}`} /></label>
        <label className={`grid gap-1.5 text-xs font-medium ${isLight ? "text-slate-700" : "text-white/80"}`}>Email address<input required type="email" name="email" value={form.email} onChange={update("email")} placeholder="you@email.com" className={`h-11 rounded-lg border px-3 text-sm outline-none ${fieldClass}`} /></label>
        <label className={`grid gap-1.5 text-xs font-medium ${isLight ? "text-slate-700" : "text-white/80"}`}>Phone number<input required type="tel" name="phone" value={form.phone} onChange={update("phone")} placeholder="Your number" className={`h-11 rounded-lg border px-3 text-sm outline-none ${fieldClass}`} /></label>
        <label className={`grid gap-1.5 text-xs font-medium ${isLight ? "text-slate-700" : "text-white/80"}`}>I’m interested in<select name="interest" value={form.interest} onChange={update("interest")} className={`h-11 rounded-lg border px-3 text-sm outline-none ${fieldClass}`}><option>{developmentName}</option><option>Reserve a unit</option><option>Viewing options</option><option>Pricing and availability</option></select></label>
      </div>
      <label className={`mt-3 grid gap-1.5 text-xs font-medium ${isLight ? "text-slate-700" : "text-white/80"}`}>How can we help?<textarea name="message" value={form.message} onChange={update("message")} rows="3" placeholder="Tell us what you’d like to know." className={`resize-none rounded-lg border px-3 py-2.5 text-sm outline-none ${fieldClass}`} /></label>
      {status ? <p className={`mt-4 flex items-start gap-2 text-sm leading-5 ${isLight ? "text-slate-800" : "text-white/90"}`}><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{status}</p> : null}
      <button type="submit" className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--development-accent)] px-5 text-sm font-semibold text-[#14352c] transition hover:brightness-105">Send enquiry <ArrowRight size={17} /></button>
      <p className={`mt-3 text-xs leading-5 ${isLight ? "text-slate-600" : "text-white/60"}`}>By sending, you agree that the {agency} sales team may contact you about {developmentName}.</p>
    </form>
  );
}
