import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  MessageCircle,
  MoreVertical,
  Search,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

const mockMaintenanceData = {
  approval: {
    title: "Plumbing repair quote",
    property: "Harbour Heights · Apartment 14",
    issue: "Leaking kitchen tap",
    contractor: "AquaFix Plumbing",
    amount: "R2 450",
  },
  visits: {
    count: 2,
    contractor: "AquaFix Plumbing",
    date: "18 Sep · 09:00 – 11:00",
  },
  requests: [
    {
      id: "tap",
      title: "Leaking kitchen tap",
      property: "Harbour Heights 14",
      submitted: "15 Sep 2026",
      status: "Awaiting approval",
      next: "Review quote",
      category: "Plumbing",
      image: "/brand/harbour-heights-apartment-14.png",
      description: "The kitchen tap is leaking from the base when turned on.",
      contractor: "AquaFix Plumbing",
      appointment: "18 Sep 2026 · 09:00 – 11:00",
      stage: 1,
    },
    {
      id: "window",
      title: "Bedroom window not closing",
      property: "Ocean View Villa",
      submitted: "12 Sep 2026",
      status: "Contractor scheduled",
      next: "Visit 19 Sep",
      category: "Windows",
      image: "/brand/landlord-demo/ocean-view-villa.jpg",
      description:
        "The window handle turns, but the window does not close completely.",
      contractor: "Cape Window Repairs",
      appointment: "19 Sep 2026 · 13:00 – 15:00",
      stage: 3,
    },
    {
      id: "aircon",
      title: "Aircon not cooling",
      property: "The Mews 3",
      submitted: "10 Sep 2026",
      status: "In progress",
      next: "Technician attending",
      category: "Appliance",
      image: "/brand/landlord-demo/the-mews-3.jpg",
      description:
        "The air conditioning unit is operating but is no longer cooling the room.",
      contractor: "CoolAir Services",
      appointment: "Today · 14:00 – 16:00",
      stage: 4,
    },
    {
      id: "gate",
      title: "Gate motor serviced",
      property: "Maple Grove 8",
      submitted: "9 Sep 2026",
      status: "Completed",
      next: "Completed",
      category: "Security",
      image: "/brand/landlord-demo/maple-grove-8.jpg",
      description: "The gate motor has been serviced and tested.",
      contractor: "Secure Access",
      appointment: "Completed 9 Sep 2026",
      stage: 4,
    },
  ],
  completed: [
    [
      "Gate motor serviced",
      "Maple Grove 8",
      "Completed 9 Sep 2026",
      "/brand/landlord-demo/maple-grove-8.jpg",
    ],
    [
      "Bathroom extractor replaced",
      "Fernwood Studio 6",
      "Completed 5 Sep 2026",
      "/brand/landlord-demo/fernwood-studio-6.jpg",
    ],
    [
      "Geyser pressure valve",
      "Ocean View Villa",
      "Completed 2 Sep 2026",
      "/brand/landlord-demo/ocean-view-villa.jpg",
    ],
  ],
};

const states = {
  "Awaiting approval": "bg-[#fff3e3] text-[#a45a07]",
  "Contractor scheduled": "bg-[#ecfaf2] text-[#17613f]",
  "In progress": "bg-[#eaf5ff] text-[#17659e]",
  Completed: "bg-[#edf3ef] text-[#5c6b61]",
};

function Card({ children, className = "" }) {
  return (
    <section
      className={`rounded-[14px] border border-[#e1e7e3] bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,.04)] ${className}`}
    >
      {children}
    </section>
  );
}
function Heading({ icon: Icon, children, action }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#edf8f2] text-[#17613f]">
          <Icon size={18} />
        </span>
        <h2 className="truncate text-base font-semibold tracking-[-.025em] text-[#18251e]">
          {children}
        </h2>
      </div>
      {action}
    </div>
  );
}
function Action({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-[#075b40] underline underline-offset-4"
    >
      {children}
      <ChevronRight size={16} />
    </button>
  );
}
function Timeline({ stage }) {
  const steps = [
    "Submitted",
    "Approved",
    "Contractor assigned",
    "Scheduled",
    "Completed",
  ];
  return (
    <div className="mt-3">
      <div className="flex gap-1">
        {steps.map((step, index) => (
          <span
            key={step}
            className={`h-2 flex-1 rounded-full ${index <= stage ? "bg-[#21865b]" : "bg-[#dfe6e1]"}`}
          />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1 text-center text-[0.64rem] leading-tight text-[#647168]">
        {steps.map((step) => (
          <span key={step}>{step}</span>
        ))}
      </div>
    </div>
  );
}

export default function LandlordMaintenancePage({ onNavigate }) {
  const data = mockMaintenanceData;
  const [tab, setTab] = useState("Open");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState("window");
  const [menu, setMenu] = useState("");
  const visible = useMemo(
    () =>
      data.requests.filter((item) => {
        const tabMatches =
          tab === "Open"
            ? item.status !== "Completed"
            : tab === "Awaiting approval"
              ? item.status === "Awaiting approval"
              : item.status === "Completed";
        const propertyMatches =
          propertyFilter === "all" || item.property === propertyFilter;
        const categoryMatches =
          categoryFilter === "all" || item.category === categoryFilter;
        const needle = query.trim().toLowerCase();
        return (
          tabMatches &&
          propertyMatches &&
          categoryMatches &&
          (!needle ||
            `${item.title} ${item.property}`.toLowerCase().includes(needle))
        );
      }),
    [categoryFilter, propertyFilter, query, tab],
  );
  const open = data.requests.filter((item) => item.status !== "Completed");
  const goMessages = () => onNavigate?.("messages");
  return (
    <div className="mx-auto max-w-[1440px] space-y-3 pb-3">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.15em] text-[#63716a]">
            Maintenance
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-.05em] text-[#142219] sm:text-[2.35rem]">
            Maintenance requests
          </h1>
          <p className="mt-1 text-base text-[#5c6961]">
            Stay informed about repairs and approvals across your properties.
          </p>
        </div>
        <select
          value={propertyFilter}
          onChange={(event) => setPropertyFilter(event.target.value)}
          className="min-h-10 rounded-lg border border-[#dce4df] bg-white px-3 text-sm font-semibold text-[#34463a]"
        >
          <option value="all">All properties</option>
          {[...new Set(data.requests.map((item) => item.property))].map(
            (property) => (
              <option key={property}>{property}</option>
            ),
          )}
        </select>
      </header>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="border-[#f0dec0] bg-[#fffaf1]">
          <Heading icon={CircleAlert}>Needs your approval</Heading>
          <div className="mt-3 flex justify-between gap-3">
            <div>
              <p className="text-xl font-semibold tracking-[-.04em] text-[#25251f]">
                {data.approval.title}
              </p>
              <p className="mt-1 text-sm text-[#5e594e]">
                {data.approval.property}
              </p>
              <p className="mt-1 text-sm text-[#5e594e]">
                {data.approval.issue}
              </p>
              <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[#65491d]">
                <Wrench size={16} />
                {data.approval.contractor}
              </p>
            </div>
            <p className="shrink-0 text-2xl font-semibold tracking-[-.04em] text-[#25251f]">
              {data.approval.amount}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab("Awaiting approval")}
              className="min-h-10 rounded-lg border border-[#9c8052] bg-white px-3 text-sm font-semibold text-[#59421f]"
            >
              Review quote
            </button>
            <button
              type="button"
              onClick={() => setTab("Awaiting approval")}
              className="min-h-10 rounded-lg bg-[#07533a] px-5 text-sm font-semibold text-white"
            >
              Approve
            </button>
            <Action onClick={() => setTab("Awaiting approval")}>
              Request more information
            </Action>
          </div>
        </Card>
        <Card>
          <Heading icon={Wrench}>Open maintenance</Heading>
          <p className="mt-4 text-2xl font-semibold tracking-[-.045em] text-[#17251d]">
            {open.length} active requests
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-2 text-[#a45a07]">
              <i className="h-2 w-2 rounded-full bg-[#d27a00]" />1 awaiting
              approval
            </span>
            <span className="inline-flex items-center gap-2 text-[#17613f]">
              <i className="h-2 w-2 rounded-full bg-[#198754]" />1 scheduled
            </span>
            <span className="inline-flex items-center gap-2 text-[#17659e]">
              <i className="h-2 w-2 rounded-full bg-[#319ee5]" />1 in progress
            </span>
          </div>
          <div className="mt-4 border-t border-[#edf0ee] pt-2">
            <Action onClick={() => setTab("Open")}>View open requests</Action>
          </div>
        </Card>
        <Card>
          <Heading icon={CalendarDays}>Upcoming visits</Heading>
          <p className="mt-4 text-2xl font-semibold tracking-[-.045em] text-[#17251d]">
            {data.visits.count} visits this week
          </p>
          <p className="mt-2 text-sm text-[#657168]">Next visit</p>
          <p className="mt-1 font-semibold text-[#2c3a31]">
            {data.visits.contractor}
          </p>
          <p className="mt-1 text-sm text-[#57675d]">{data.visits.date}</p>
          <div className="mt-4 border-t border-[#edf0ee] pt-2">
            <Action onClick={() => setTab("Open")}>View schedule</Action>
          </div>
        </Card>
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(300px,.55fr)]">
        <Card className="min-w-0">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
            <Heading icon={FileText}>Requests</Heading>
            <div className="grid gap-2 sm:grid-cols-3">
              <select
                value={propertyFilter}
                onChange={(event) => setPropertyFilter(event.target.value)}
                className="min-h-10 rounded-lg border border-[#dce4df] bg-white px-3 text-sm"
              >
                <option value="all">All properties</option>
                {[...new Set(data.requests.map((item) => item.property))].map(
                  (property) => (
                    <option key={property}>{property}</option>
                  ),
                )}
              </select>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="min-h-10 rounded-lg border border-[#dce4df] bg-white px-3 text-sm"
              >
                <option value="all">All categories</option>
                {[...new Set(data.requests.map((item) => item.category))].map(
                  (category) => (
                    <option key={category}>{category}</option>
                  ),
                )}
              </select>
              <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[#dce4df] px-3 text-sm">
                <Search size={16} />
                <span className="sr-only">Search requests</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search requests"
                  className="min-w-0 flex-1 bg-transparent outline-none"
                />
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-1 rounded-lg bg-[#f3f6f4] p-1">
            {[
              ["Open", open.length],
              ["Awaiting approval", 1],
              ["Completed", 1],
            ].map(([name, count]) => (
              <button
                key={name}
                type="button"
                onClick={() => setTab(name)}
                className={`min-h-9 rounded-md px-3 text-sm font-semibold ${tab === name ? "bg-white text-[#075b40] shadow-sm" : "text-[#5e6b63]"}`}
              >
                {name}
                <span className="ml-2 rounded-full bg-[#edf4ef] px-1.5 py-0.5 text-xs">
                  {count}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="hidden min-w-[760px] w-full text-left text-sm md:table">
              <thead className="bg-[#f5f7f5] text-xs font-semibold text-[#647169]">
                <tr>
                  {[
                    "Request",
                    "Property",
                    "Submitted",
                    "Status",
                    "Next step",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="px-3 py-3 first:rounded-l-lg last:rounded-r-lg"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0ee]">
                {visible.map((item) => (
                  <>
                    <tr key={item.id}>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={item.image}
                            alt=""
                            className="h-10 w-10 rounded-md object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded(expanded === item.id ? "" : item.id)
                            }
                            className="font-semibold text-[#29392f] hover:underline"
                          >
                            {item.title}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[#506158]">
                        {item.property}
                      </td>
                      <td className="px-3 py-3 text-[#506158]">
                        {item.submitted}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${states[item.status]}`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[#506158]">{item.next}</td>
                      <td className="relative px-3 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            setMenu(menu === item.id ? "" : item.id)
                          }
                          aria-label={`Actions for ${item.title}`}
                          className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#edf3ef]"
                        >
                          <MoreVertical size={18} />
                        </button>
                        {menu === item.id ? (
                          <div className="absolute right-3 top-11 z-20 w-48 rounded-xl border border-[#dfe6e1] bg-white p-1.5 shadow-lg">
                            {[
                              [FileText, "View request"],
                              [CircleAlert, "Review quote"],
                              [FileText, "View documents"],
                              [MessageCircle, "Message rental team"],
                            ].map(([Icon, label]) => (
                              <button
                                key={label}
                                type="button"
                                onClick={() =>
                                  label === "Message rental team"
                                    ? goMessages()
                                    : setMenu("")
                                }
                                className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-[#f3f6f3]"
                              >
                                <Icon size={16} />
                                {label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                    {expanded === item.id ? (
                      <tr key={`${item.id}-details`}>
                        <td colSpan="6" className="bg-[#fffcf5] px-4 py-4">
                          <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)_minmax(280px,.9fr)]">
                            <div className="grid grid-cols-2 gap-2">
                              <img
                                src={item.image}
                                alt=""
                                className="h-24 w-full rounded-lg object-cover"
                              />
                              <img
                                src={item.image}
                                alt=""
                                className="h-24 w-full rounded-lg object-cover object-right"
                              />
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-[#657168]">
                                Issue
                              </p>
                              <p className="mt-1 text-sm text-[#344238]">
                                {item.description}
                              </p>
                              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#657168]">
                                Contractor
                              </p>
                              <p className="mt-1 text-sm font-semibold text-[#344238]">
                                {item.contractor}
                              </p>
                              <p className="mt-2 inline-flex items-center gap-2 text-sm text-[#4d6255]">
                                <CalendarDays size={16} />
                                {item.appointment}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-[#657168]">
                                Progress
                              </p>
                              <Timeline stage={item.stage} />
                              <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="min-h-10 rounded-lg border border-[#35755a] px-3 text-sm font-semibold text-[#075b40]"
                                >
                                  View request
                                </button>
                                <button
                                  type="button"
                                  onClick={goMessages}
                                  className="min-h-10 rounded-lg bg-[#07533a] px-3 text-sm font-semibold text-white"
                                >
                                  Message rental team
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                ))}
              </tbody>
            </table>
            <div className="grid gap-3 md:hidden">
              {visible.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-[#e4ebe6] p-3"
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#29392f]">
                        {item.title}
                      </p>
                      <p className="mt-1 text-sm text-[#647168]">
                        {item.property}
                      </p>
                    </div>
                    <span
                      className={`h-fit rounded-full px-2.5 py-1 text-xs font-semibold ${states[item.status]}`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-[#596a60]">{item.next}</p>
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded(expanded === item.id ? "" : item.id)
                    }
                    className="mt-3 text-sm font-semibold text-[#075b40] underline"
                  >
                    {expanded === item.id ? "Hide details" : "View details"}
                  </button>
                  {expanded === item.id ? (
                    <div className="mt-3 border-t pt-3">
                      <p className="text-sm">{item.description}</p>
                      <Timeline stage={item.stage} />
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </Card>
        <Card>
          <Heading
            icon={FileText}
            action={
              <Action onClick={() => setTab("Completed")}>View history</Action>
            }
          >
            Recently completed
          </Heading>
          <div className="mt-3 divide-y divide-[#edf0ee]">
            {data.completed.map(([title, property, date, image]) => (
              <div key={title} className="flex gap-3 py-3 first:pt-0">
                <img
                  src={image}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover"
                />
                <div>
                  <p className="text-sm font-semibold text-[#2d3c32]">
                    {title}
                  </p>
                  <p className="mt-0.5 text-sm text-[#657168]">{property}</p>
                  <p className="mt-0.5 text-xs text-[#758078]">{date}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <section className="flex flex-col justify-between gap-3 rounded-[14px] border border-[#cde9da] bg-[#effaf3] px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex gap-3">
          <MessageCircle className="mt-0.5 shrink-0 text-[#17613f]" size={20} />
          <div>
            <p className="font-semibold text-[#24352b]">
              Questions about a repair?
            </p>
            <p className="mt-1 text-sm text-[#5f7166]">
              Your rental team is ready to help.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={goMessages}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#07533a] px-4 text-sm font-semibold text-white"
        >
          <MessageCircle size={16} />
          Message rental team
        </button>
      </section>
    </div>
  );
}
