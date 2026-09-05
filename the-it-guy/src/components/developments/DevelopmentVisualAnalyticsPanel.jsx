import {
  AlertTriangle,
  Eye,
  MousePointerClick,
  Send,
  Users,
} from "lucide-react";

const number = (value) =>
  new Intl.NumberFormat("en-ZA").format(Number(value) || 0);

export default function DevelopmentVisualAnalyticsPanel({ analytics }) {
  if (!analytics)
    return (
      <section className="rounded-[20px] border border-dashed border-[#d8e3ef] bg-white p-6 text-sm text-[#6b7d93] xl:col-span-2">
        Visual journey analytics will appear here after the Phase 14 database
        migration is applied and buyers begin exploring.
      </section>
    );
  const summary = analytics.summary || {};
  const metrics = [
    [Users, "Buyer sessions", summary.sessions],
    [Eye, "Scene views", summary.sceneViews],
    [MousePointerClick, "Properties opened", summary.unitOpens],
    [Send, "Enquiries started", summary.enquiries],
  ];
  return (
    <section className="rounded-[20px] border border-[#e3ebf4] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)] xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-[1.08rem] font-semibold text-[#142132]">
            Buyer journey performance
          </h4>
          <p className="mt-1 text-sm text-[#6b7d93]">
            First-party, privacy-limited activity from the last{" "}
            {analytics.periodDays || 30} days.
          </p>
        </div>
        <span className="rounded-full bg-[#eaf7ef] px-3 py-1 text-xs font-semibold text-[#168a57]">
          {Number(summary.enquiryRate) || 0}% session-to-enquiry
        </span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([Icon, label, value]) => (
          <article
            key={label}
            className="rounded-[15px] border border-[#e6edf5] bg-[#fbfcfe] p-4"
          >
            <Icon size={17} className="text-[#2f6fec]" />
            <strong className="mt-3 block text-2xl text-[#142132]">
              {number(value)}
            </strong>
            <span className="text-xs text-[#6b7d93]">{label}</span>
          </article>
        ))}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Ranking
          title="Most explored views"
          rows={analytics.scenes}
          valueKey="views"
          detailKey="enquiries"
          detailLabel="enquiries"
          empty="No scene views yet."
        />
        <Ranking
          title="Properties receiving attention"
          rows={analytics.units}
          valueKey="opens"
          detailKey="shortlists"
          detailLabel="saved"
          empty="No properties opened yet."
        />
        <Ranking
          title="Journey drop-off points"
          rows={analytics.dropoffs}
          valueKey="abandonments"
          empty="No measured drop-offs yet."
          warning
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#66788f]">
        {(analytics.devices || []).map((device) => (
          <span
            key={device.device}
            className="rounded-full border border-[#dce5ee] px-3 py-1.5 capitalize"
          >
            {device.device}: {number(device.sessions)} sessions
          </span>
        ))}
        {Number(summary.fallbacks) ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-amber-800">
            <AlertTriangle size={13} /> {number(summary.fallbacks)} asset
            fallbacks encountered
          </span>
        ) : null}
      </div>
    </section>
  );
}

function Ranking({
  title,
  rows = [],
  valueKey,
  detailKey,
  detailLabel,
  empty,
  warning = false,
}) {
  return (
    <div>
      <h5 className="text-xs font-bold uppercase tracking-[.12em] text-[#60758a]">
        {title}
      </h5>
      <div className="mt-2 grid gap-2">
        {rows.slice(0, 5).map((row, index) => (
          <div
            key={row.id || index}
            className="flex items-center justify-between gap-3 rounded-lg bg-[#f6f8fa] px-3 py-2 text-xs"
          >
            <span className="truncate text-[#30485f]">
              {row.name || row.unit_number || row.id || "Unknown"}
            </span>
            <span className="shrink-0 text-right">
              <strong className={warning ? "text-amber-700" : "text-[#173d33]"}>
                {number(row[valueKey])}
              </strong>
              {detailKey && Number(row[detailKey]) ? (
                <small className="ml-1 text-[9px] text-[#718299]">
                  · {number(row[detailKey])} {detailLabel}
                </small>
              ) : null}
            </span>
          </div>
        ))}
        {!rows.length ? (
          <p className="rounded-lg border border-dashed p-3 text-xs text-[#7b8b9d]">
            {empty}
          </p>
        ) : null}
      </div>
    </div>
  );
}
