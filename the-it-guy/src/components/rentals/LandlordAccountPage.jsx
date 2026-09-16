import {
  Bell,
  CircleHelp,
  ChevronRight,
  Mail,
  MessageCircle,
  Phone,
  Send,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useState } from "react";

function Card({ children, className = "" }) {
  return (
    <section
      className={`rounded-[14px] border border-[#e1e7e3] bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,.04)] ${className}`}
    >
      {children}
    </section>
  );
}
function Heading({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-[#edf8f2] text-[#17613f]">
        <Icon size={18} />
      </span>
      <h1 className="text-base font-semibold tracking-[-.025em] text-[#18251e]">
        {children}
      </h1>
    </div>
  );
}
function PageHeader({ eyebrow, title, copy, action }) {
  return (
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.15em] text-[#63716a]">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-.05em] text-[#142219] sm:text-[2.35rem]">
          {title}
        </h1>
        <p className="mt-1 text-base text-[#5c6961]">{copy}</p>
      </div>
      {action}
    </header>
  );
}

export default function LandlordAccountPage({ section = "messages" }) {
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState(false);
  if (section === "messages")
    return (
      <div className="mx-auto max-w-[1200px] space-y-3 pb-3">
        <PageHeader
          eyebrow="Messages"
          title="Messages"
          copy="Stay connected with your rental team about your portfolio."
          action={
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#07533a] px-4 text-sm font-semibold text-white"
            >
              <MessageCircle size={17} />
              New message
            </button>
          }
        />
        <div className="grid gap-3 lg:grid-cols-[.7fr_1.3fr]">
          <Card>
            <Heading icon={MessageCircle}>Conversations</Heading>
            <div className="mt-3 divide-y divide-[#edf0ee]">
              {[
                [
                  "Harbour Heights · Apartment 14",
                  "Your inspection has been confirmed.",
                  "Today",
                ],
                [
                  "Ocean View Villa",
                  "Monthly statement is available.",
                  "Yesterday",
                ],
                [
                  "The Mews · Unit 3",
                  "We have received a partial payment.",
                  "16 Sep",
                ],
              ].map(([name, text, time], index) => (
                <button
                  key={name}
                  type="button"
                  className={`w-full px-2 py-3 text-left ${index === 0 ? "rounded-lg bg-[#edf8f2]" : ""}`}
                >
                  <div className="flex justify-between gap-3">
                    <p className="font-semibold text-[#2d3d32]">{name}</p>
                    <span className="text-xs text-[#748078]">{time}</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-[#637168]">{text}</p>
                </button>
              ))}
            </div>
          </Card>
          <Card>
            <Heading icon={MessageCircle}>
              Harbour Heights · Apartment 14
            </Heading>
            <div className="mt-4 space-y-3">
              <div className="max-w-[82%] rounded-xl bg-[#f2f5f3] px-3 py-2.5 text-sm text-[#37463d]">
                Your routine inspection has been confirmed for 24 September at
                10:00.
              </div>
              <div className="ml-auto max-w-[82%] rounded-xl bg-[#07533a] px-3 py-2.5 text-sm text-white">
                Thank you, that works for me.
              </div>
              <div className="max-w-[82%] rounded-xl bg-[#f2f5f3] px-3 py-2.5 text-sm text-[#37463d]">
                We’ll share the report once it is ready.
              </div>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (draft.trim()) {
                  setSent(true);
                  setDraft("");
                }
              }}
              className="mt-6 flex gap-2 border-t border-[#edf0ee] pt-3"
            >
              <label className="sr-only" htmlFor="landlord-message">
                Message rental team
              </label>
              <input
                id="landlord-message"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write a message…"
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#dce4df] px-3 text-sm outline-none focus:border-[#17613f]"
              />
              <button
                type="submit"
                className="grid min-h-11 min-w-11 place-items-center rounded-lg bg-[#07533a] text-white"
                aria-label="Send message"
              >
                <Send size={17} />
              </button>
            </form>
            {sent ? (
              <p className="mt-2 text-xs font-medium text-[#17613f]">
                Message added to this local demo conversation.
              </p>
            ) : null}
          </Card>
        </div>
      </div>
    );
  if (section === "settings")
    return (
      <div className="mx-auto max-w-[980px] space-y-3 pb-3">
        <PageHeader
          eyebrow="Settings"
          title="Account settings"
          copy="Manage your portfolio contact details and communication preferences."
        />
        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <Heading icon={UserRound}>Contact details</Heading>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-[#718078]">Name</dt>
                <dd className="mt-1 font-semibold text-[#2d3d32]">Alex</dd>
              </div>
              <div>
                <dt className="text-[#718078]">Email</dt>
                <dd className="mt-1 font-semibold text-[#2d3d32]">
                  Your email is managed securely
                </dd>
              </div>
              <button
                type="button"
                className="mt-1 text-left font-semibold text-[#075b40] underline underline-offset-4"
              >
                Update contact details
              </button>
            </dl>
          </Card>
          <Card>
            <Heading icon={Bell}>Notifications</Heading>
            <div className="mt-4 grid gap-3 text-sm">
              {[
                ["Maintenance approvals", "Quote and repair decisions"],
                ["Rent and statements", "Statements and disbursements"],
                ["Inspections", "Upcoming inspection updates"],
              ].map(([title, copy]) => (
                <label
                  key={title}
                  className="flex items-center justify-between gap-3"
                >
                  <span>
                    <strong className="block text-[#2d3d32]">{title}</strong>
                    <small className="text-[#718078]">{copy}</small>
                  </span>
                  <input
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4 accent-[#17613f]"
                  />
                </label>
              ))}
            </div>
          </Card>
          <Card>
            <Heading icon={ShieldCheck}>Banking & disbursements</Heading>
            <p className="mt-4 text-sm text-[#617067]">
              Banking details are protected. Contact your rental team to update
              disbursement instructions.
            </p>
            <button
              type="button"
              className="mt-4 min-h-10 rounded-lg border border-[#3b795e] px-3 text-sm font-semibold text-[#075b40]"
            >
              Contact rental team
            </button>
          </Card>
          <Card>
            <Heading icon={Settings}>Access</Heading>
            <p className="mt-4 text-sm text-[#617067]">
              Your portal access is restricted to authorised properties in your
              portfolio.
            </p>
            <button
              type="button"
              className="mt-4 text-sm font-semibold text-[#075b40] underline underline-offset-4"
            >
              Review access details
            </button>
          </Card>
        </div>
      </div>
    );
  return (
    <div className="mx-auto max-w-[980px] space-y-3 pb-3">
      <PageHeader
        eyebrow="Support"
        title="How can we help?"
        copy="Find help with your portfolio or contact your rental team."
      />
      <div className="grid gap-3 md:grid-cols-3">
        {[
          [CircleHelp, "Help centre", "Answers to common landlord questions"],
          [
            MessageCircle,
            "Message rental team",
            "Ask a question about a property",
          ],
          [Phone, "Escalate an issue", "Get help with an urgent concern"],
        ].map(([Icon, title, copy]) => (
          <Card key={title}>
            <Heading icon={Icon}>{title}</Heading>
            <p className="mt-4 text-sm text-[#617067]">{copy}</p>
            <button
              type="button"
              className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[#075b40] underline underline-offset-4"
            >
              Get help <ChevronRight size={16} />
            </button>
          </Card>
        ))}
      </div>
      <Card>
        <Heading icon={Mail}>Contact your rental team</Heading>
        <p className="mt-3 text-sm text-[#617067]">
          For questions about a tenancy, statement, property, maintenance
          request or inspection, send a message and the correct team will follow
          up.
        </p>
        <button
          type="button"
          className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#07533a] px-4 text-sm font-semibold text-white"
        >
          <MessageCircle size={16} />
          Message rental team
        </button>
      </Card>
    </div>
  );
}
