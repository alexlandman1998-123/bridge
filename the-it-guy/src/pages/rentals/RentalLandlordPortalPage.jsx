import {
  Building2,
  CalendarClock,
  Check,
  CircleAlert,
  FileText,
  MapPin,
  MoreHorizontal,
  Search,
  UserRound,
  Loader2,
  Send,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import RentalClientPortalShell from "../../components/rentals/RentalClientPortalShell";
import LandlordOverview from "../../components/rentals/LandlordOverview";
import LandlordPropertyWorkspace from "../../components/rentals/LandlordPropertyWorkspace";
import LandlordRentStatementsPage from "../../components/rentals/LandlordRentStatementsPage";
import LandlordMaintenancePage from "../../components/rentals/LandlordMaintenancePage";
import LandlordDocumentsPage from "../../components/rentals/LandlordDocumentsPage";
import LandlordAccountPage from "../../components/rentals/LandlordAccountPage";
import {
  buildDefaultProspectDemoConfig,
  resolveProspectDemoConfig,
} from "../../lib/prospectDemoConfig";
import { supabase } from "../../lib/supabaseClient";

const label = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
const currency = (value) =>
  Number.isFinite(Number(value))
    ? new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        maximumFractionDigits: 0,
      }).format(Number(value))
    : "Not captured";
const date = (value) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("en-ZA", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Not available";
function Card({ icon: Icon, eyebrow, title, children }) {
  return (
    <section className="rounded-[20px] border border-[#dfe7f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,.05)] sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-[#edf5ff] text-[#1769d1]">
          <Icon size={19} />
        </span>
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[.13em] text-[#7b8491]">
            {eyebrow}
          </p>
          <h2 className="text-xl font-semibold tracking-[-.035em]">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}
function InstructionForm({
  decisionType,
  setDecisionType,
  message,
  setMessage,
  submit,
  saving,
}) {
  return (
    <form onSubmit={submit} className="mt-5 grid gap-4">
      <label className="text-sm font-semibold text-[#344054]">
        Instruction type
        <select
          value={decisionType}
          onChange={(event) => setDecisionType(event.target.value)}
          className="mt-2 w-full rounded-xl border border-[#dbe5ef] bg-white px-3 py-2.5 font-normal text-[#203247]"
        >
          <option value="maintenance_approval">Maintenance approval</option>
          <option value="listing_instruction">Listing instruction</option>
          <option value="general">General</option>
        </select>
      </label>
      <label className="text-sm font-semibold text-[#344054]">
        Instruction
        <textarea
          required
          minLength="10"
          maxLength="4000"
          rows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="mt-2 w-full rounded-xl border border-[#dbe5ef] px-3 py-2.5 font-normal text-[#203247]"
          placeholder="Tell your rentals team what you would like them to action."
        />
      </label>
      <button
        disabled={saving}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#10213a] px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className="animate-spin" size={16} />
        ) : (
          <Send size={16} />
        )}
        Send instruction
      </button>
    </form>
  );
}

export default function RentalLandlordPortalPage({
  accountMembershipId = "",
  demo = false,
}) {
  const { token = "" } = useParams();
  const [searchParams] = useSearchParams();
  const activeKey = searchParams.get("section") || "overview";
  const selectedPropertyId = searchParams.get("property") || "";
  const propertyTab = searchParams.get("tab") || "overview";
  const navigate = useNavigate();
  const accountMode = Boolean(accountMembershipId);
  const [data, setData] = useState(null);
  const [branding, setBranding] = useState(() =>
    buildDefaultProspectDemoConfig(token),
  );
  const [decisionType, setDecisionType] = useState("maintenance_approval");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [propertyQuery, setPropertyQuery] = useState("");
  const navigateSection = (section) =>
    navigate({ search: `?section=${encodeURIComponent(section)}` });
  const accountHeaders = useCallback(async () => {
    if (!supabase) throw new Error("Client account access is not configured.");
    const { data } = await supabase.auth.getSession();
    if (!data?.session?.access_token)
      throw new Error("Your session has expired. Please sign in again.");
    return { Authorization: `Bearer ${data.session.access_token}` };
  }, []);
  const load = useCallback(async () => {
    try {
      setLoading(true);
      if (demo) {
        const config = await resolveProspectDemoConfig(token);
        setBranding(config);
        setData({
          property: {
            name: "Harbour Heights",
            property_type: "apartment",
            status: "managed",
          },
          mandate: {
            mandate_status: "active",
            authority_status: "full",
            starts_on: "2026-08-01",
            ends_on: "2027-07-31",
          },
          units: [
            {
              id: "demo-unit",
              unit_label: "Apartment 14",
              status: "occupied",
              bedrooms: 2,
              bathrooms: 2,
              target_rent: 18500,
            },
          ],
          documents: [],
          decisions: [],
        });
        return;
      }
      const headers = accountMode
        ? await accountHeaders()
        : { Authorization: `Bearer ${token}` };
      const response = await fetch(
        accountMode
          ? `/api/rentals/client-portal?audience=landlord&membershipId=${encodeURIComponent(accountMembershipId)}`
          : "/api/public/rental-landlord-portal",
        { headers },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setData(payload);
    } catch (cause) {
      setError(cause?.message || "Unable to open landlord portal.");
    } finally {
      setLoading(false);
    }
  }, [accountHeaders, accountMembershipId, accountMode, demo, token]);
  useEffect(() => {
    void load();
  }, [load]);
  const submit = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError("");
      if (demo) {
        setData((current) => ({
          ...current,
          decisions: [
            {
              id: `demo-${Date.now()}`,
              decision_type: decisionType,
              status: "submitted",
              message,
            },
            ...(current.decisions || []),
          ],
        }));
        setMessage("");
        setNotice(
          "Demo instruction recorded locally — no client data was changed.",
        );
        return;
      }
      const headers = accountMode
        ? await accountHeaders()
        : { Authorization: `Bearer ${token}` };
      const response = await fetch(
        accountMode
          ? "/api/rentals/client-portal"
          : "/api/public/rental-landlord-portal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify(
            accountMode
              ? {
                  audience: "landlord",
                  membershipId: accountMembershipId,
                  decisionType,
                  message,
                }
              : { decisionType, message },
          ),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setData((current) => ({
        ...current,
        decisions: [payload.decision, ...(current.decisions || [])],
      }));
      setMessage("");
      setNotice("Instruction submitted to the rentals team.");
    } catch (cause) {
      setError(cause?.message || "Unable to submit instruction.");
    } finally {
      setSaving(false);
    }
  };
  if (loading)
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f7fa]">
        <span className="inline-flex items-center gap-2 text-sm text-[#667085]">
          <Loader2 className="animate-spin" size={18} />
          Loading your portal…
        </span>
      </main>
    );
  if (error && !data)
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f7fa] p-6">
        <section className="max-w-md rounded-[20px] border border-[#f2c6c6] bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Landlord portal unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-[#667085]">{error}</p>
        </section>
      </main>
    );
  const property = data?.property || {};
  const mandate = data?.mandate || {};
  const units = data?.units || [];
  const documents = data?.documents || [];
  const decisions = data?.decisions || [];
  const decisionHistory = (
    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {decisions.length ? (
        decisions.map((decision) => (
          <article
            key={decision.id}
            className="rounded-[16px] border border-[#e3eaf2] bg-[#fbfdff] p-4"
          >
            <div className="flex justify-between gap-3">
              <strong>{label(decision.decision_type)}</strong>
              <span className="rounded-full bg-[#edf5ff] px-2.5 py-1 text-xs font-semibold text-[#45627d]">
                {label(decision.status)}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#52657b]">
              {decision.message}
            </p>
          </article>
        ))
      ) : (
        <p className="rounded-[16px] border border-dashed border-[#d8e4f0] p-6 text-sm text-[#667085]">
          No instructions submitted yet.
        </p>
      )}
    </div>
  );
  const overview = (
    <LandlordOverview
      data={{
        ...data,
        portfolio: demo
          ? {
              expectedRent: 62500,
              collectedRent: 57500,
              outstanding: 5000,
              activeLeases: 4,
              collectionRate: 92,
              attentionCount: 1,
              occupied: 4,
              totalUnits: 5,
              occupancyRate: 80,
              properties: [
                {
                  id: "harbour",
                  name: "Harbour Heights · Apartment 14",
                  location: "Sea Point",
                  status: "Occupied",
                  rent: 18500,
                  signal: "Next inspection 24 Sep",
                  image: "/brand/harbour-heights-apartment-14.png",
                },
                {
                  id: "ocean",
                  name: "Ocean View Villa",
                  location: "Camps Bay",
                  status: "Occupied",
                  rent: 22000,
                  signal: "No actions outstanding",
                  image: "/brand/landlord-demo/ocean-view-villa.jpg",
                },
                {
                  id: "maple",
                  name: "Maple Grove 8",
                  location: "Newlands",
                  status: "Vacant",
                  rent: 12000,
                  signal: "2 new applications",
                  image: "/brand/landlord-demo/maple-grove-8.jpg",
                },
                {
                  id: "mews",
                  name: "The Mews · Unit 3",
                  location: "Rondebosch",
                  status: "Occupied",
                  rent: 10000,
                  signal: "Maintenance update",
                  image: "/brand/landlord-demo/the-mews-3.jpg",
                },
              ],
              rentRoll: [
                {
                  id: "harbour",
                  property: "Harbour Heights 14",
                  tenant: "Jordan Taylor",
                  due: 18500,
                  received: 18500,
                  status: "Paid",
                },
                {
                  id: "ocean",
                  property: "Ocean View Villa",
                  tenant: "Maya Smith",
                  due: 22000,
                  received: 22000,
                  status: "Paid",
                },
                {
                  id: "maple",
                  property: "Maple Grove 8",
                  tenant: "Vacant",
                  due: null,
                  received: null,
                  status: "Available",
                },
                {
                  id: "mews",
                  property: "The Mews 3",
                  tenant: "Daniel Botha",
                  due: 10000,
                  received: 5000,
                  status: "Attention",
                },
              ],
              approvals: [
                {
                  id: "quote",
                  title: "Plumbing repair quote",
                  property: "Harbour Heights 14",
                  detail: "R2 450",
                },
              ],
              activity: [
                {
                  id: "rent",
                  title: "Rent received",
                  detail: "Harbour Heights 14 · today",
                },
                {
                  id: "inspection",
                  title: "Inspection confirmed",
                  detail: "Harbour Heights 14 · 24 Sep",
                },
                {
                  id: "quote",
                  title: "Maintenance quote uploaded",
                  detail: "The Mews 3 · review required",
                },
              ],
            }
          : {
              properties: units.map((unit) => ({
                id: unit.id,
                name: `${property.name || "Property"}${unit.unit_label ? ` · ${unit.unit_label}` : ""}`,
                location: property.suburb || "",
                status: label(unit.status),
                rent: unit.target_rent,
                signal: "View property details",
              })),
              rentRoll: [],
            },
      }}
      branding={demo ? branding : {}}
      onNavigate={navigateSection}
    />
  );
  const portfolioProperties = demo
    ? [
        {
          id: "harbour",
          name: "Harbour Heights · Apartment 14",
          location: "Sea Point",
          tenant: "Jordan Taylor",
          status: "occupied",
          rent: 18500,
          image: "/brand/harbour-heights-apartment-14.png",
          signal: "Next inspection · 24 Sep",
        },
        {
          id: "ocean",
          name: "Ocean View Villa",
          location: "Camps Bay",
          tenant: "Maya Smith",
          status: "occupied",
          rent: 22000,
          image: "/brand/landlord-demo/ocean-view-villa.jpg",
          signal: "No actions outstanding",
        },
        {
          id: "maple",
          name: "Maple Grove 8",
          location: "Newlands",
          tenant: "",
          status: "vacant",
          rent: 12000,
          image: "/brand/landlord-demo/maple-grove-8.jpg",
          signal: "2 applications to review",
          attention: true,
        },
        {
          id: "mews",
          name: "The Mews · Unit 3",
          location: "Rondebosch",
          tenant: "Daniel Botha",
          status: "occupied",
          rent: 10000,
          image: "/brand/landlord-demo/the-mews-3.jpg",
          signal: "R5 000 outstanding",
          attention: true,
        },
        {
          id: "fernwood",
          name: "Fernwood Studio 6",
          location: "Gardens",
          tenant: "Thandi Nkosi",
          status: "occupied",
          rent: 8000,
          image: "/brand/landlord-demo/fernwood-studio-6.jpg",
          signal: "Maintenance visit tomorrow",
          maintenance: true,
        },
      ]
    : units.map((unit) => ({
        id: unit.id,
        name: `${property.name || "Property"}${unit.unit_label ? ` · ${unit.unit_label}` : ""}`,
        location: property.suburb || property.city || "",
        tenant: "",
        status: String(unit.status || "unknown").toLowerCase(),
        rent: unit.target_rent,
        signal: "View property details",
      }));
  const visibleProperties = portfolioProperties.filter((item) => {
    const matchesFilter =
      propertyFilter === "all" ||
      (propertyFilter === "attention"
        ? item.attention
        : propertyFilter === "maintenance"
          ? item.maintenance
          : item.status === propertyFilter);
    const query = propertyQuery.trim().toLowerCase();
    return (
      matchesFilter &&
      (!query ||
        `${item.name} ${item.location} ${item.tenant}`
          .toLowerCase()
          .includes(query))
    );
  });
  const propertyCounts = {
    all: portfolioProperties.length,
    occupied: portfolioProperties.filter((item) => item.status === "occupied")
      .length,
    vacant: portfolioProperties.filter((item) => item.status === "vacant")
      .length,
    attention: portfolioProperties.filter((item) => item.attention).length,
  };
  const properties = (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 rounded-[14px] border border-[#e3e7e4] bg-white p-3 shadow-[0_6px_18px_rgba(15,23,42,.035)] xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            ["all", "All"],
            ["occupied", "Occupied"],
            ["vacant", "Vacant"],
            ["attention", "Needs attention"],
            ["maintenance", "Maintenance"],
          ].map(([key, labelText]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPropertyFilter(key)}
              className={`min-h-9 rounded-lg px-3 text-sm font-semibold transition ${propertyFilter === key ? "bg-[var(--landlord-primary,#071E1A)] text-white shadow-sm" : "text-[#45524b] hover:bg-[#f2f5f3]"}`}
            >
              {labelText}
              {propertyCounts[key] !== undefined ? (
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${propertyFilter === key ? "bg-white/20" : "bg-[#edf2ee] text-[#58655e]"}`}
                >
                  {propertyCounts[key]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <label className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-[#dfe5e1] bg-white px-3 text-sm text-[#6d776f] xl:max-w-[250px]">
          <Search size={17} />
          <span className="sr-only">Search properties</span>
          <input
            value={propertyQuery}
            onChange={(event) => setPropertyQuery(event.target.value)}
            placeholder="Search properties"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#8a938d]"
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {visibleProperties.map((item) => (
          <article
            key={item.id}
            className="overflow-hidden rounded-[14px] border border-[#e2e7e3] bg-white shadow-[0_7px_18px_rgba(15,23,42,.045)]"
          >
            <div className="relative h-40 bg-[#eef3ef]">
              {item.image ? (
                <img
                  src={item.image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-[color-mix(in_srgb,var(--landlord-accent,#64B992)_20%,white)]" />
              )}
              <span
                className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === "occupied" ? "bg-[#ecfaf2] text-[#17613f]" : "bg-[#fff5df] text-[#91570d]"}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${item.status === "occupied" ? "bg-[#198754]" : "bg-[#d27a00]"}`}
                />
                {label(item.status)}
              </span>
              <button
                type="button"
                aria-label={`Actions for ${item.name}`}
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg bg-white/95 text-[#26352c] shadow-sm"
              >
                <MoreHorizontal size={17} />
              </button>
            </div>
            <div className="p-3.5">
              <h2 className="text-lg font-semibold tracking-[-.035em] text-[#17251d]">
                {item.name}
              </h2>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-[#58655f]">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={15} />
                  {item.location || "Location not captured"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock size={15} />
                  {currency(item.rent)} pm
                </span>
                {item.tenant ? (
                  <span className="inline-flex items-center gap-1.5">
                    <UserRound size={15} />
                    {item.tenant}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[#a25e09]">
                    <UserRound size={15} />
                    Available
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1.5 ${item.attention || item.maintenance ? "text-[#ad5700]" : "text-[#287652]"}`}
                >
                  {item.attention ? (
                    <CircleAlert size={15} />
                  ) : item.maintenance ? (
                    <Wrench size={15} />
                  ) : (
                    <Check size={15} />
                  )}
                  {item.signal}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[#edf0ee] pt-3">
                {item.attention ? (
                  <button
                    type="button"
                    onClick={() => navigate("?section=rent")}
                    className="rounded-lg bg-[var(--landlord-primary,#071E1A)] px-3 py-2 text-sm font-semibold text-white"
                  >
                    Review applications
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `?section=properties&property=${encodeURIComponent(item.id)}`,
                    )
                  }
                  className="text-sm font-semibold text-[var(--landlord-primary,#071E1A)] underline underline-offset-4"
                >
                  View property
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!visibleProperties.length ? (
        <p className="rounded-[14px] border border-dashed border-[#d9e2dc] bg-white p-8 text-center text-sm text-[#66736b]">
          No properties match these filters.
        </p>
      ) : null}
    </section>
  );
  const selectedProperty = portfolioProperties.find(
    (item) => item.id === selectedPropertyId,
  );
  const workspace = selectedProperty ? (
    <LandlordPropertyWorkspace
      property={selectedProperty}
      tab={propertyTab}
      demo={demo}
      onBack={() => navigate("?section=properties")}
      onTabChange={(nextTab) =>
        navigate(
          `?section=properties&property=${encodeURIComponent(selectedProperty.id)}&tab=${encodeURIComponent(nextTab)}`,
        )
      }
      onNavigate={navigateSection}
    />
  ) : (
    properties
  );
  const approvals = (
    <div className="grid gap-5 xl:grid-cols-[minmax(340px,.75fr)_minmax(0,1.25fr)]">
      <Card icon={Wrench} eyebrow="Approvals" title="Send an instruction">
        <InstructionForm
          {...{
            decisionType,
            setDecisionType,
            message,
            setMessage,
            submit,
            saving,
          }}
        />
      </Card>
      <Card icon={CalendarClock} eyebrow="Activity" title="Instruction history">
        {decisionHistory}
      </Card>
    </div>
  );
  const docs = (
    <Card
      icon={FileText}
      eyebrow="Mandate & documents"
      title="Property records"
    >
      <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Mandate status", label(mandate.mandate_status || "Not available")],
          ["Authority", label(mandate.authority_status || "Not available")],
          ["Starts", date(mandate.starts_on)],
          ["Ends", date(mandate.ends_on)],
        ].map(([term, value]) => (
          <div
            key={term}
            className="rounded-[14px] border border-[#e3eaf2] bg-[#fbfdff] p-3"
          >
            <dt className="text-xs font-semibold uppercase tracking-wide text-[#7b8491]">
              {term}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-[#203247]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {documents.length ? (
          documents.map((document) => (
            <article
              key={document.id}
              className="rounded-[16px] border border-[#e3eaf2] bg-[#fbfdff] p-4"
            >
              <FileText size={18} className="text-[#1769d1]" />
              <p className="mt-4 font-semibold text-[#203247]">
                {document.document_label || "Property document"}
              </p>
              <p className="mt-1 text-xs text-[#667085]">
                {label(document.document_category || "Supporting document")}
              </p>
            </article>
          ))
        ) : (
          <p className="rounded-[16px] border border-dashed border-[#d8e4f0] p-6 text-sm text-[#667085]">
            No property documents are available in this portal yet.
          </p>
        )}
      </div>
    </Card>
  );
  const support = (
    <Card
      icon={CalendarClock}
      eyebrow="Support & activity"
      title="Recent instructions"
    >
      {decisionHistory}
    </Card>
  );
  const rent = <LandlordRentStatementsPage onNavigate={navigateSection} />;
  const maintenance = <LandlordMaintenancePage onNavigate={navigateSection} />;
  const documentVault = <LandlordDocumentsPage onNavigate={navigateSection} />;
  const accountPage = <LandlordAccountPage section={activeKey} />;
  const content =
    activeKey === "properties"
      ? workspace
      : activeKey === "rent"
        ? rent
        : activeKey === "maintenance"
          ? maintenance
          : activeKey === "documents"
            ? documentVault
            : activeKey === "messages" ||
                activeKey === "settings" ||
                activeKey === "support"
              ? accountPage
              : activeKey === "approvals"
                ? approvals
                : activeKey === "documents"
                  ? docs
                  : activeKey === "support"
                    ? support
                    : overview;
  return (
    <RentalClientPortalShell
      role="landlord"
      activeKey={activeKey}
      branding={demo ? branding : {}}
      property={property}
      subtitle="Property oversight, approvals and instructions in one secure workspace."
      showPropertyHero={false}
    >
      {content}
      {error ? (
        <p className="mt-5 rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-3 text-sm text-[#9f3131]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-5 rounded-xl border border-[#bee3ce] bg-[#effaf3] p-3 text-sm text-[#177349]">
          {notice}
        </p>
      ) : null}
    </RentalClientPortalShell>
  );
}
