import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  CreditCard,
  MessageCircle,
  Wrench,
} from "lucide-react";

const money = (value) =>
  Number.isFinite(Number(value))
    ? new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        maximumFractionDigits: 0,
      })
        .format(Number(value))
        .replace("ZAR", "R")
    : "—";
function Card({ children, className = "" }) {
  return (
    <section
      className={`rounded-[16px] border border-[#e5e7eb] bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,.045)] sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}
function Heading({ icon: Icon, children, action }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[color-mix(in_srgb,var(--landlord-accent)_18%,white)] text-[var(--landlord-primary)]">
          <Icon size={18} />
        </span>
        <h2 className="text-base font-semibold tracking-[-.025em] text-[#15231e]">
          {children}
        </h2>
      </div>
      {action}
    </div>
  );
}
function Metric({ title, value, detail, tone = "normal" }) {
  return (
    <Card
      className={
        tone === "attention"
          ? "bg-[#fffaf0]"
          : tone === "success"
            ? "bg-[color-mix(in_srgb,var(--landlord-accent)_12%,white)]"
            : ""
      }
    >
      <p className="text-sm font-medium text-[#64716a]">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-.04em] text-[#1b2921] tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-xs text-[#67736b]">{detail}</p>
    </Card>
  );
}

export default function LandlordOverview({
  data = {},
  branding = {},
  onNavigate,
}) {
  const portfolio = data.portfolio || {};
  const properties = portfolio.properties || [];
  const rentRoll = portfolio.rentRoll || [];
  const approvals = portfolio.approvals || [];
  const activity = portfolio.activity || [];
  const themeStyle = {
    "--landlord-primary": branding.primaryColour || "#071E1A",
    "--landlord-accent": branding.accentColour || "#64B992",
  };
  return (
    <div
      style={themeStyle}
      className="mx-auto max-w-[1440px] space-y-4 pb-3 sm:space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          title="Expected rent"
          value={money(portfolio.expectedRent)}
          detail={`Across ${portfolio.activeLeases || 0} active leases`}
        />
        <Metric
          title="Collected this month"
          value={money(portfolio.collectedRent)}
          detail={`${portfolio.collectionRate || 0}% collected`}
          tone="success"
        />
        <Metric
          title="Outstanding"
          value={money(portfolio.outstanding)}
          detail={`${portfolio.attentionCount || 0} payments need attention`}
          tone="attention"
        />
        <Metric
          title="Occupancy"
          value={`${portfolio.occupied || 0} of ${portfolio.totalUnits || 0} homes`}
          detail={`${portfolio.occupancyRate || 0}% occupied`}
        />
      </div>
      <Card>
        <Heading
          icon={Building2}
          action={
            <button
              type="button"
              onClick={() => onNavigate("properties")}
              className="text-sm font-semibold text-[var(--landlord-primary)] underline underline-offset-4"
            >
              View all properties
            </button>
          }
        >
          Your properties
        </Heading>
        <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-1">
          {properties.map((property) => (
            <button
              key={property.id}
              type="button"
              onClick={() => onNavigate("properties")}
              className="w-[280px] shrink-0 snap-start overflow-hidden rounded-xl border border-[#e4e8e5] bg-[#fafafa] text-left transition-shadow hover:shadow-[0_8px_18px_rgba(15,23,42,.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--landlord-primary)]"
            >
              {property.image ? (
                <img
                  src={property.image}
                  alt=""
                  className="h-32 w-full object-cover"
                />
              ) : (
                <div className="h-32 bg-[color-mix(in_srgb,var(--landlord-accent)_22%,white)]" />
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#202f26]">
                      {property.name}
                    </p>
                    <p className="mt-1 text-sm text-[#64716a]">
                      {property.location}
                    </p>
                  </div>
                  <span className="rounded-full bg-[color-mix(in_srgb,var(--landlord-accent)_20%,white)] px-2.5 py-1 text-xs font-semibold text-[var(--landlord-primary)]">
                    {property.status}
                  </span>
                </div>
                <p className="mt-4 text-lg font-semibold text-[#1d2d23]">
                  {money(property.rent)} pm
                </p>
                <p className="mt-2 text-sm text-[#59675e]">{property.signal}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--landlord-primary)]">
                  View property <ChevronRight size={16} />
                </span>
              </div>
            </button>
          ))}
          {!properties.length ? (
            <p className="py-4 text-sm text-[#607166]">
              Your managed properties will appear here.
            </p>
          ) : null}
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.65fr)]">
        <Card>
          <Heading
            icon={CreditCard}
            action={
              <button
                type="button"
                onClick={() => onNavigate("properties")}
                className="text-sm font-semibold text-[var(--landlord-primary)] underline underline-offset-4"
              >
                View full rent roll
              </button>
            }
          >
            Rent roll
          </Heading>
          <p className="mt-2 text-sm text-[#64716a]">
            Latest rental activity across your properties.
          </p>
          <div className="mt-4 divide-y divide-[#edf0ee]">
            {rentRoll.map((row) => (
              <button
                type="button"
                key={row.id}
                onClick={() => onNavigate("properties")}
                className="grid min-h-14 w-full grid-cols-[minmax(120px,1.4fr)_minmax(70px,.7fr)_minmax(70px,.7fr)_auto] items-center gap-3 text-left text-sm"
              >
                <div>
                  <strong className="block text-[#25342b]">
                    {row.property}
                  </strong>
                  <span className="text-xs text-[#68736c]">{row.tenant}</span>
                </div>
                <span>{money(row.due)}</span>
                <span>{row.received === null ? "—" : money(row.received)}</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === "Attention" ? "bg-[#fff4df] text-[#925a0d]" : "bg-[color-mix(in_srgb,var(--landlord-accent)_20%,white)] text-[var(--landlord-primary)]"}`}
                >
                  {row.status}
                </span>
              </button>
            ))}
            {!rentRoll.length ? (
              <p className="py-4 text-sm text-[#607166]">
                Rent roll data is not available for this period.
              </p>
            ) : null}
          </div>
        </Card>
        <div className="grid gap-4">
          <Card>
            <Heading icon={AlertTriangle}>Needs your approval</Heading>
            <div className="mt-3 grid gap-3">
              {approvals.slice(0, 3).map((approval) => (
                <div key={approval.id} className="rounded-xl bg-[#fafafa] p-3">
                  <p className="font-semibold text-[#26362d]">
                    {approval.title}
                  </p>
                  <p className="mt-1 text-sm text-[#627068]">
                    {approval.property} · {approval.detail}
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate("approvals")}
                    className="mt-3 text-sm font-semibold text-[var(--landlord-primary)] underline underline-offset-4"
                  >
                    Review
                  </button>
                </div>
              ))}
              {!approvals.length ? (
                <p className="text-sm text-[#607166]">
                  There are no decisions requiring your approval.
                </p>
              ) : null}
            </div>
          </Card>
          <Card>
            <Heading icon={Clock3}>Recent activity</Heading>
            <div className="mt-3 grid gap-3">
              {activity.slice(0, 4).map((item) => (
                <div key={item.id} className="flex gap-3 text-sm">
                  <CheckCircle2
                    className="mt-0.5 shrink-0 text-[var(--landlord-primary)]"
                    size={17}
                  />
                  <div>
                    <p className="font-semibold text-[#26362d]">{item.title}</p>
                    <p className="mt-1 text-[#68736c]">{item.detail}</p>
                  </div>
                </div>
              ))}
              {!activity.length ? (
                <p className="text-sm text-[#607166]">
                  Your portfolio activity will appear here.
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
      <section className="flex flex-col justify-between gap-3 rounded-[14px] border border-[color-mix(in_srgb,var(--landlord-accent)_32%,white)] bg-[color-mix(in_srgb,var(--landlord-accent)_13%,white)] px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex gap-3">
          <CircleHelp
            className="mt-0.5 shrink-0 text-[var(--landlord-primary)]"
            size={20}
          />
          <div>
            <p className="font-semibold text-[#26362d]">
              Need help with your portfolio?
            </p>
            <p className="mt-1 text-sm text-[#627068]">
              Your rental team is ready to help.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("support")}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--landlord-primary)] px-4 text-sm font-semibold text-white"
        >
          <MessageCircle size={16} />
          Message rental team
        </button>
      </section>
    </div>
  );
}
