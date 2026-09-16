import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  X,
} from "lucide-react";
import { useState } from "react";

const timelines = [
  "As soon as possible",
  "Within 3 months",
  "Within 6–12 months",
  "I’m just exploring",
];
const valuations = [
  "Yes, I’d like a valuation",
  "I’d like to speak to someone first",
  "Not yet",
];
const contactMethods = ["Phone call", "WhatsApp", "Email"];

function Choice({ value, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-lg border px-3 text-left text-sm font-semibold transition ${selected ? "border-[#17613f] bg-[#edf8f2] text-[#075b40]" : "border-[#dbe4de] bg-white text-[#34443a] hover:border-[#75a68d]"}`}
    >
      {value}
    </button>
  );
}

export default function SellingEnquiryFlow({ property, onClose, onMessage }) {
  const [step, setStep] = useState(1);
  const [timeline, setTimeline] = useState("");
  const [valuation, setValuation] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const valid =
    step === 1 || step === 2
      ? Boolean(timeline)
      : step === 3
        ? Boolean(valuation && contact)
        : true;
  if (sent)
    return (
      <div
        className="fixed inset-0 z-50 grid place-items-end bg-[#08170f]/40 p-0 sm:place-items-center sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-label="Selling enquiry sent"
      >
        <section className="w-full max-w-lg rounded-t-[20px] bg-white p-6 shadow-2xl sm:rounded-[20px]">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[#edf8f2] text-[#17613f]">
            <CheckCircle2 size={25} />
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-[-.04em] text-[#19271e]">
            Your enquiry has been sent
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#5f6e64]">
            Your property team will be in touch to discuss the next steps.
          </p>
          <div className="mt-5 rounded-xl bg-[#f3f7f4] p-3 text-sm text-[#52635a]">
            This demo submission is stored only in this browser. It does not
            create a listing, change the tenancy, or notify a tenant.
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onMessage}
              className="min-h-11 flex-1 rounded-lg bg-[#07533a] px-4 text-sm font-semibold text-white"
            >
              Message rental team
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 flex-1 rounded-lg border border-[#3b795e] px-4 text-sm font-semibold text-[#075b40]"
            >
              Back to property
            </button>
          </div>
        </section>
      </div>
    );
  const review = (
    <dl className="mt-4 grid gap-3 rounded-xl bg-[#f4f7f4] p-4 text-sm">
      <div>
        <dt className="text-[#728078]">Property</dt>
        <dd className="mt-1 font-semibold text-[#26362c]">{property.name}</dd>
        <dd className="mt-0.5 text-[#526158]">{property.address}</dd>
      </div>
      <div>
        <dt className="text-[#728078]">Selling timeline</dt>
        <dd className="mt-1 font-semibold text-[#26362c]">{timeline}</dd>
      </div>
      <div>
        <dt className="text-[#728078]">Valuation preference</dt>
        <dd className="mt-1 font-semibold text-[#26362c]">{valuation}</dd>
      </div>
      <div>
        <dt className="text-[#728078]">Preferred contact</dt>
        <dd className="mt-1 font-semibold text-[#26362c]">{contact}</dd>
      </div>
      {note ? (
        <div>
          <dt className="text-[#728078]">Additional context</dt>
          <dd className="mt-1 text-[#26362c]">{note}</dd>
        </div>
      ) : null}
    </dl>
  );
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#08170f]/40 p-0 sm:grid sm:place-items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="selling-enquiry-title"
    >
      <section className="min-h-full w-full bg-white sm:min-h-0 sm:max-w-xl sm:rounded-[20px] sm:shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#eaf0ec] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#69766e]">
              Selling enquiry
            </p>
            <h2
              id="selling-enquiry-title"
              className="mt-1 text-lg font-semibold text-[#18261d]"
            >
              Discuss selling this property
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close selling enquiry"
            className="grid h-10 w-10 place-items-center rounded-lg text-[#506058] hover:bg-[#f0f4f1]"
          >
            <X size={19} />
          </button>
        </header>
        <div className="px-5 pt-4">
          <div className="flex gap-1.5" aria-label={`Step ${step} of 5`}>
            {[1, 2, 3, 4, 5].map((item) => (
              <span
                key={item}
                className={`h-1.5 flex-1 rounded-full ${item <= step ? "bg-[#198754]" : "bg-[#dfe7e2]"}`}
              />
            ))}
          </div>
        </div>
        <div className="p-5">
          {step === 1 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#69766e]">
                Step 1 of 5
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-.035em] text-[#18261d]">
                Confirm property
              </h3>
              <div className="mt-4 overflow-hidden rounded-xl border border-[#e1e7e3]">
                <img
                  src={property.image}
                  alt={property.name}
                  className="h-36 w-full object-cover"
                />
                <div className="p-3">
                  <p className="font-semibold text-[#26362c]">
                    {property.name}
                  </p>
                  <p className="mt-1 text-sm text-[#5c6b62]">
                    {property.address}
                  </p>
                </div>
              </div>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#69766e]">
                Step 2 of 5
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-.035em] text-[#18261d]">
                When are you considering selling?
              </h3>
              <div className="mt-4 grid gap-2">
                {timelines.map((value) => (
                  <Choice
                    key={value}
                    value={value}
                    selected={timeline === value}
                    onClick={() => setTimeline(value)}
                  />
                ))}
              </div>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#69766e]">
                Step 3 of 5
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-.035em] text-[#18261d]">
                Would you like a valuation?
              </h3>
              <div className="mt-4 grid gap-2">
                {valuations.map((value) => (
                  <Choice
                    key={value}
                    value={value}
                    selected={valuation === value}
                    onClick={() => setValuation(value)}
                  />
                ))}
              </div>
              <p className="mt-5 text-sm font-semibold text-[#36473d]">
                Preferred contact method
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {contactMethods.map((value) => (
                  <Choice
                    key={value}
                    value={value}
                    selected={contact === value}
                    onClick={() => setContact(value)}
                  />
                ))}
              </div>
            </>
          ) : null}
          {step === 4 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#69766e]">
                Step 4 of 5
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-.035em] text-[#18261d]">
                Anything you’d like your property team to know?
              </h3>
              <p className="mt-2 text-sm text-[#5f6e64]">
                Optional — for example, a relocation, tenant-in-place sale, or
                request for an estimate.
              </p>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={5}
                maxLength={1000}
                placeholder="Add any context for your property team…"
                className="mt-4 w-full rounded-xl border border-[#dbe4de] p-3 text-sm outline-none focus:border-[#17613f]"
              />
            </>
          ) : null}
          {step === 5 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#69766e]">
                Step 5 of 5
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-.035em] text-[#18261d]">
                Review your enquiry
              </h3>
              {review}
              <p className="mt-4 rounded-xl bg-[#f3f7f4] p-3 text-sm leading-6 text-[#52635a]">
                Submitting this enquiry does not list your property or change
                your current tenancy. Your rental team will guide you on the
                current lease and tenant arrangements.
              </p>
            </>
          ) : null}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-[#eaf0ec] px-5 py-4">
          <button
            type="button"
            onClick={() => (step === 1 ? onClose() : setStep(step - 1))}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-[#52635a]"
          >
            <ChevronLeft size={17} />
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step === 5 ? (
            <button
              type="button"
              onClick={() => setSent(true)}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-[#07533a] px-4 text-sm font-semibold text-white"
            >
              Send enquiry
              <ChevronRight size={17} />
            </button>
          ) : (
            <button
              type="button"
              disabled={!valid}
              onClick={() => setStep(step + 1)}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-[#07533a] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              Continue
              <ChevronRight size={17} />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
