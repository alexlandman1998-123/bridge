import {
  Building2,
  ChevronRight,
  Loader2,
  Mail,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useWorkspace } from "../../context/WorkspaceContext";
import {
  createRentalProperty,
  listRentalProperties,
} from "../../services/rentals/rentalPropertyRepository.js";
import { listRentalUnits } from "../../services/rentals/rentalUnitRepository.js";
import { listPersistedRentalTenancies } from "../../services/rentals/rentalApplicationRepository.js";
import { listRentalPropertyOwners } from "../../services/rentals/rentalLandlordMandateRepository.js";

const initialForm = {
  name: "",
  propertyType: "house",
  addressLine1: "",
  city: "",
  province: "",
  postalCode: "",
};
const propertyTypes = [
  "house",
  "apartment",
  "townhouse",
  "duplex",
  "studio",
  "estate",
  "commercial",
  "other",
];
const text = (value) => String(value ?? "").trim();
const title = (value) =>
  text(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
function getScope(context = {}) {
  const membership =
    context.currentMembership || context.organisationMembership || {};
  return {
    organisationId: text(
      context.workspace?.id ||
        membership.organisation_id ||
        membership.organisationId,
    ),
    branchId: text(membership.branch_id || membership.branchId),
    userId: text(context.profile?.id || context.userId),
  };
}
function statusTone(value) {
  return value === "active"
    ? "border-[#cfe8dc] bg-[#effaf3] text-[#26724c]"
    : "border-[#dbe6f1] bg-[#f8fbff] text-[#4d6782]";
}
function renewalDueDate(tenancy = {}) {
  const terms = tenancy.lease?.terms_json || {};
  const start =
    tenancy.intendedOccupationDate || terms.intended_occupation_date;
  const months = Number(terms.lease_term_months || 0);
  if (!start || !Number.isFinite(months) || months <= 0) return null;
  const due = new Date(`${start}T00:00:00`);
  due.setMonth(due.getMonth() + months);
  return Number.isNaN(due.getTime()) ? null : due;
}
function formatDate(value) {
  return value
    ? new Intl.DateTimeFormat("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(value)
    : "Not captured";
}
function formatRent(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "Rent pending";
  return `R ${amount.toLocaleString("en-ZA", {
    maximumFractionDigits: 0,
  })}`;
}
function rentSummary(rents = []) {
  const values = rents.filter(
    (rent) => Number.isFinite(Number(rent)) && Number(rent) > 0,
  );
  if (!values.length) return "Rent pending";
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  return `${lowest === highest ? "" : "From "}${formatRent(lowest)} / mo`;
}
function leaseProgress(tenancy = {}) {
  const terms = tenancy.lease?.terms_json || {};
  const startValue =
    tenancy.intendedOccupationDate ||
    terms.intended_occupation_date ||
    terms.start_date;
  if (!startValue) return null;
  const start = new Date(`${startValue}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  let end = terms.end_date ? new Date(`${terms.end_date}T00:00:00`) : null;
  if (!end || Number.isNaN(end.getTime())) {
    const months = Number(terms.lease_term_months || 0);
    if (!Number.isFinite(months) || months <= 0) return null;
    end = new Date(start);
    end.setMonth(end.getMonth() + months);
  }
  const duration = end.getTime() - start.getTime();
  if (duration <= 0) return null;
  const percentage = Math.min(
    100,
    Math.max(0, Math.round(((Date.now() - start.getTime()) / duration) * 100)),
  );
  return { percentage, end };
}

function CreatePropertyDrawer({
  open,
  onClose,
  form,
  update,
  submit,
  creating,
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-[#102236]/35 p-4 sm:flex sm:justify-end">
      <form
        onSubmit={submit}
        className="ml-auto h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.1em] text-[#6f8398]">
              Properties & units
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[#102236]">
              Add managed property
            </h2>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-xl border border-[#dbe6f1] text-[#60758b]"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <p className="mt-2 text-sm text-[#60758b]">
          Keep the managed property separate from its rental listings and
          vacancies.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="form-field sm:col-span-2">
            <span>Property name</span>
            <input
              required
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="e.g. The View Apartments"
            />
          </label>
          <label className="form-field">
            <span>Property type</span>
            <select
              value={form.propertyType}
              onChange={(event) => update("propertyType", event.target.value)}
            >
              {propertyTypes.map((type) => (
                <option key={type} value={type}>
                  {title(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>City</span>
            <input
              required
              value={form.city}
              onChange={(event) => update("city", event.target.value)}
            />
          </label>
          <label className="form-field sm:col-span-2">
            <span>Address</span>
            <input
              required
              value={form.addressLine1}
              onChange={(event) => update("addressLine1", event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Province</span>
            <input
              value={form.province}
              onChange={(event) => update("province", event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Postal code</span>
            <input
              value={form.postalCode}
              onChange={(event) => update("postalCode", event.target.value)}
            />
          </label>
        </div>
        <button
          disabled={creating}
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-[#0f2743] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {creating ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Plus size={16} />
          )}
          Create property
        </button>
      </form>
    </div>
  );
}

export default function RentalPropertiesPage() {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const scope = useMemo(() => getScope(workspace), [workspace]);
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [tenancies, setTenancies] = useState([]);
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [stockView, setStockView] = useState("all");
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    if (!scope.organisationId) {
      setProperties([]);
      setUnits([]);
      setTenancies([]);
      setOwners([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");
      const [propertyRows, unitRows, tenancyRows, ownerRows] =
        await Promise.all([
          listRentalProperties({ ...scope, status: "active", limit: 100 }),
          listRentalUnits({
            organisationId: scope.organisationId,
            branchId: scope.branchId,
            limit: 500,
          }),
          listPersistedRentalTenancies(scope.organisationId),
          listRentalPropertyOwners(scope.organisationId),
        ]);
      setProperties(propertyRows);
      setUnits(unitRows);
      setTenancies(tenancyRows);
      setOwners(ownerRows);
    } catch (cause) {
      setError(cause?.message || "Unable to load managed stock.");
      setProperties([]);
      setUnits([]);
      setTenancies([]);
      setOwners([]);
    } finally {
      setLoading(false);
    }
  }, [scope]);
  useEffect(() => {
    void load();
  }, [load]);
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    try {
      setCreating(true);
      setError("");
      const property = await createRentalProperty({
        ...scope,
        ...form,
        assignedManagerId: scope.userId,
        createdBy: scope.userId,
      });
      setForm(initialForm);
      setDrawer(false);
      navigate(`/agent/rentals/portfolio/properties/${property.id}`);
    } catch (cause) {
      setError(cause?.message || "Unable to create rental property.");
    } finally {
      setCreating(false);
    }
  };
  const managedUnits = useMemo(() => {
    const propertyIds = new Set(properties.map((property) => property.id));
    return units.filter((unit) => propertyIds.has(unit.propertyId));
  }, [properties, units]);
  const stockByProperty = useMemo(
    () =>
      managedUnits.reduce((result, unit) => {
        const current = result.get(unit.propertyId) || {
          total: 0,
          occupied: 0,
          vacant: 0,
        };
        current.total += 1;
        if (unit.status === "occupied") current.occupied += 1;
        else current.vacant += 1;
        result.set(unit.propertyId, current);
        return result;
      }, new Map()),
    [managedUnits],
  );
  const totalUnits = managedUnits.length;
  const occupiedUnits = managedUnits.filter(
    (unit) => unit.status === "occupied",
  ).length;
  const occupancyRate = totalUnits
    ? Math.round((occupiedUnits / totalUnits) * 100)
    : 0;
  const renewalsByProperty = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 90);
    const managedPropertyIds = new Set(
      properties.map((property) => property.id),
    );
    return tenancies.reduce((result, tenancy) => {
      const dueDate = renewalDueDate(tenancy);
      if (
        !managedPropertyIds.has(tenancy.propertyId) ||
        tenancy.status !== "active" ||
        !dueDate ||
        dueDate < new Date() ||
        dueDate > cutoff
      )
        return result;
      const current = result.get(tenancy.propertyId) || {
        count: 0,
        nextDue: dueDate,
      };
      current.count += 1;
      if (dueDate < current.nextDue) current.nextDue = dueDate;
      result.set(tenancy.propertyId, current);
      return result;
    }, new Map());
  }, [properties, tenancies]);
  const cardFactsByProperty = useMemo(() => {
    const activeTenanciesByUnit = new Map(
      tenancies
        .filter((tenancy) => tenancy.status === "active" && tenancy.unitId)
        .map((tenancy) => [tenancy.unitId, tenancy]),
    );
    return managedUnits.reduce((result, unit) => {
      const current = result.get(unit.propertyId) || {
        rents: [],
        lease: null,
      };
      const tenancy = activeTenanciesByUnit.get(unit.id);
      const leaseRent = Number(tenancy?.lease?.terms_json?.monthly_rent);
      const targetRent = Number(unit.targetRent);
      const rent =
        Number.isFinite(targetRent) && targetRent > 0 ? targetRent : leaseRent;
      if (Number.isFinite(rent) && rent > 0) current.rents.push(rent);
      if (!current.lease && tenancy) current.lease = leaseProgress(tenancy);
      result.set(unit.propertyId, current);
      return result;
    }, new Map());
  }, [managedUnits, tenancies]);
  const renewalCount = [...renewalsByProperty.values()].reduce(
    (total, item) => total + item.count,
    0,
  );
  const rows = useMemo(
    () =>
      properties.filter(
        (property) =>
          (stockView === "all" || renewalsByProperty.has(property.id)) &&
          [
            property.name,
            property.propertyType,
            property.address?.line1,
            property.address?.city,
            property.status,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [properties, query, renewalsByProperty, stockView],
  );
  const selectedOwner = useMemo(
    () => owners.find((owner) => owner.partyId === selectedOwnerId) || null,
    [owners, selectedOwnerId],
  );
  const selectedOwnerProperties = useMemo(() => {
    if (!selectedOwner) return [];
    const ownerPropertyIds = new Set(
      selectedOwner.relationships.map(
        (relationship) => relationship.propertyId,
      ),
    );
    return properties.filter((property) => ownerPropertyIds.has(property.id));
  }, [properties, selectedOwner]);
  return (
    <main className="mx-auto w-full px-2 py-2 sm:px-3 lg:px-4">
      <section className="space-y-4 pb-6">
        <section className="rounded-[18px] border border-[#dce6f2] bg-white px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,.04)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.08em] text-[#6f8298]">
                Occupancy
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[#142132]">
                {loading ? "—" : `${occupancyRate}%`}
              </p>
            </div>
            <div className="flex gap-5 text-sm">
              <p>
                <b className="text-[#142132]">
                  {loading ? "—" : occupiedUnits}
                </b>{" "}
                <span className="text-[#60758b]">occupied</span>
              </p>
              <p>
                <b className="text-[#142132]">
                  {loading ? "—" : Math.max(0, totalUnits - occupiedUnits)}
                </b>{" "}
                <span className="text-[#60758b]">vacant</span>
              </p>
              <p>
                <b className="text-[#142132]">{loading ? "—" : totalUnits}</b>{" "}
                <span className="text-[#60758b]">total units</span>
              </p>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eaf0f5]">
            <div
              className="h-full rounded-full bg-[#16894f] transition-[width]"
              style={{ width: `${occupancyRate}%` }}
            />
          </div>
        </section>
        <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-[12px] border border-[#dbe4ee] bg-[#f8fafc] p-1">
              <button
                type="button"
                onClick={() => setStockView("all")}
                className={`rounded-[8px] px-3 py-2 text-sm font-semibold ${stockView === "all" ? "bg-[#0f2743] text-white" : "text-[#60758b] hover:bg-[#f5f9fd]"}`}
              >
                All stock {properties.length}
              </button>
              <button
                type="button"
                onClick={() => setStockView("renewals")}
                className={`rounded-[8px] px-3 py-2 text-sm font-semibold ${stockView === "renewals" ? "bg-[#0f2743] text-white" : "text-[#60758b] hover:bg-[#f5f9fd]"}`}
              >
                Renewals due {renewalCount}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStockView("owners");
                  setSelectedOwnerId("");
                }}
                className={`rounded-[8px] px-3 py-2 text-sm font-semibold ${stockView === "owners" ? "bg-[#0f2743] text-white" : "text-[#60758b] hover:bg-[#f5f9fd]"}`}
              >
                Owners {owners.length}
              </button>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2">
              <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[12px] border border-[#dbe4ee] bg-white px-3 sm:max-w-md">
                <Search size={15} className="text-[#7b8ca2]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none"
                  placeholder={
                    stockView === "owners"
                      ? "Search owners"
                      : "Search properties or locations"
                  }
                />
              </label>
              <button
                type="button"
                onClick={() => setDrawer(true)}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[12px] bg-[#0f2743] px-3 text-sm font-semibold text-white"
              >
                <Plus size={16} />
                Add property
              </button>
            </div>
          </div>
          {error ? (
            <p className="rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-3 text-sm text-[#9f3131]">
              {error}
            </p>
          ) : null}
          {loading ? (
            <div className="grid min-h-56 place-items-center text-sm text-[#60758b]">
              <span className="inline-flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Loading managed stock…
              </span>
            </div>
          ) : stockView === "owners" ? (
            selectedOwner ? (
              <section className="mt-4 space-y-4">
                <header className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#e1e8f0] bg-[#f8fbfe] p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#edf5ff] text-[#1769d1]">
                      <UserRound size={20} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold text-[#142132]">
                        {selectedOwner.name}
                      </h2>
                      <p className="mt-1 flex items-center gap-1 text-sm text-[#60758b]">
                        {selectedOwner.email ? (
                          <>
                            <Mail size={14} />
                            {selectedOwner.email}
                          </>
                        ) : (
                          "Owner contact details not captured"
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedOwnerId("")}
                    className="rounded-lg border border-[#dbe4ee] bg-white px-3 py-2 text-sm font-semibold text-[#35546c]"
                  >
                    All owners
                  </button>
                </header>
                <section className="grid gap-3 sm:grid-cols-3">
                  <article className="rounded-xl border border-[#e1e8f0] bg-white p-4">
                    <p className="text-2xl font-semibold text-[#142132]">
                      {selectedOwnerProperties.length}
                    </p>
                    <p className="mt-1 text-sm text-[#60758b]">
                      managed propert
                      {selectedOwnerProperties.length === 1 ? "y" : "ies"}
                    </p>
                  </article>
                  <article className="rounded-xl border border-[#e1e8f0] bg-white p-4">
                    <p className="text-2xl font-semibold text-[#142132]">
                      {selectedOwnerProperties.reduce(
                        (total, property) =>
                          total +
                          (stockByProperty.get(property.id)?.total || 0),
                        0,
                      )}
                    </p>
                    <p className="mt-1 text-sm text-[#60758b]">
                      units under management
                    </p>
                  </article>
                  <article className="rounded-xl border border-[#e1e8f0] bg-white p-4">
                    <p className="text-2xl font-semibold text-[#142132]">
                      {selectedOwner.primaryPropertyCount}
                    </p>
                    <p className="mt-1 text-sm text-[#60758b]">
                      primary property contact
                      {selectedOwner.primaryPropertyCount === 1 ? "" : "s"}
                    </p>
                  </article>
                </section>
                <div>
                  <h3 className="text-base font-semibold text-[#142132]">
                    Properties under management
                  </h3>
                  <p className="mt-1 text-sm text-[#60758b]">
                    Properties managed by your company for this owner.
                  </p>
                </div>
                {selectedOwnerProperties.length ? (
                  <section className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {selectedOwnerProperties.map((property) => {
                      const stock = stockByProperty.get(property.id) || {
                        total: 0,
                        occupied: 0,
                        vacant: 0,
                      };
                      return (
                        <Link
                          key={property.id}
                          to={`/agent/rentals/portfolio/properties/${property.id}`}
                          className="group rounded-xl border border-[#dce6f2] bg-white p-4 transition hover:border-[#b9cee4] hover:shadow-[0_8px_18px_rgba(15,23,42,.06)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf5ff] text-[#1769d1]">
                              <Building2 size={19} />
                            </span>
                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(property.status)}`}
                            >
                              {title(property.status || "draft")}
                            </span>
                          </div>
                          <h4 className="mt-4 font-semibold text-[#142132]">
                            {property.name}
                          </h4>
                          <p className="mt-1 text-sm text-[#60758b]">
                            {property.address?.line1 || "Address pending"}
                            {property.address?.city
                              ? ` · ${property.address.city}`
                              : ""}
                          </p>
                          <div className="mt-4 flex justify-between border-t border-[#edf2f7] pt-3 text-sm text-[#35546c]">
                            <span>{stock.total} units</span>
                            <span>{stock.occupied} occupied</span>
                            <span>{stock.vacant} vacant</span>
                          </div>
                        </Link>
                      );
                    })}
                  </section>
                ) : (
                  <p className="rounded-xl border border-dashed border-[#d8e4f0] bg-[#f9fbfd] p-8 text-center text-sm text-[#60758b]">
                    No managed properties are linked to this owner.
                  </p>
                )}
              </section>
            ) : (
              <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {owners
                  .filter((owner) =>
                    [owner.name, owner.email, owner.phone]
                      .join(" ")
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((owner) => {
                    const propertyCount = new Set(
                      owner.relationships.map(
                        (relationship) => relationship.propertyId,
                      ),
                    ).size;
                    const ownerUnits = owner.relationships.reduce(
                      (total, relationship) =>
                        total +
                        (stockByProperty.get(relationship.propertyId)?.total ||
                          0),
                      0,
                    );
                    return (
                      <button
                        key={owner.partyId}
                        type="button"
                        onClick={() => setSelectedOwnerId(owner.partyId)}
                        className="group rounded-[14px] border border-[#dce6f2] bg-white p-4 text-left shadow-[0_6px_16px_rgba(15,23,42,.04)] transition hover:-translate-y-0.5 hover:border-[#b9cee4] hover:shadow-[0_10px_24px_rgba(15,23,42,.08)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf5ff] text-[#1769d1]">
                            <UserRound size={20} />
                          </span>
                          <ChevronRight size={18} className="text-[#1769d1]" />
                        </div>
                        <h2 className="mt-4 font-semibold text-[#142132]">
                          {owner.name}
                        </h2>
                        <p className="mt-1 truncate text-sm text-[#60758b]">
                          {owner.email ||
                            owner.phone ||
                            "Contact details not captured"}
                        </p>
                        <div className="mt-4 flex gap-4 border-t border-[#edf2f7] pt-3 text-sm">
                          <span>
                            <b className="text-[#142132]">{propertyCount}</b>{" "}
                            <span className="text-[#60758b]">properties</span>
                          </span>
                          <span>
                            <b className="text-[#142132]">{ownerUnits}</b>{" "}
                            <span className="text-[#60758b]">units</span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                {!owners.length ? (
                  <p className="col-span-full rounded-xl border border-dashed border-[#d8e4f0] bg-[#f9fbfd] p-10 text-center text-sm text-[#60758b]">
                    No owners are linked to managed properties yet.
                  </p>
                ) : null}
                {owners.length &&
                !owners.some((owner) =>
                  [owner.name, owner.email, owner.phone]
                    .join(" ")
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                ) ? (
                  <p className="col-span-full rounded-xl border border-dashed border-[#d8e4f0] bg-[#f9fbfd] p-10 text-center text-sm text-[#60758b]">
                    No owners match this search.
                  </p>
                ) : null}
              </section>
            )
          ) : rows.length ? (
            <section className="mt-4 grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {rows.map((property) => {
                const stock = stockByProperty.get(property.id) || {
                  total: 0,
                  occupied: 0,
                  vacant: 0,
                };
                const renewal = renewalsByProperty.get(property.id);
                const cardFacts = cardFactsByProperty.get(property.id) || {
                  rents: [],
                  lease: null,
                };
                return (
                  <Link
                    key={property.id}
                    to={`/agent/rentals/portfolio/properties/${property.id}`}
                    className="group flex h-full flex-col overflow-hidden rounded-[8px] border border-[#dce6f2] bg-white shadow-[0_6px_16px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 hover:border-[#b9cee4] hover:shadow-[0_10px_24px_rgba(15,23,42,.09)]"
                  >
                    <div className="flex h-[112px] items-start justify-between border-b border-[#e5edf6] bg-[#f5f9fd] p-4">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf5ff] text-[#1769d1]">
                        <Building2 size={20} />
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(property.status)}`}
                      >
                        {title(property.status || "draft")}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div>
                        <h2 className="truncate text-[1.02rem] font-semibold leading-6 text-[#142132]">
                          {property.name}
                        </h2>
                        <p className="mt-1 truncate text-sm text-[#60758b]">
                          {property.address?.line1 || "Address pending"}
                          {property.address?.city
                            ? ` · ${property.address.city}`
                            : ""}
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 rounded-[12px] border border-[#dbe6f2] bg-[#f9fbfe] px-3 py-2 text-center text-[0.76rem] font-semibold text-[#35546c]">
                        <span>
                          {stock.total} unit{stock.total === 1 ? "" : "s"}
                        </span>
                        <span>{stock.occupied} occupied</span>
                        <span>{stock.vacant} vacant</span>
                      </div>
                      <div className="rounded-[12px] border border-[#dbe6f2] bg-[#fbfdff] px-3 py-2.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[.08em] text-[#718399]">
                            Monthly rent
                          </p>
                          <p className="text-sm font-semibold text-[#142132]">
                            {rentSummary(cardFacts.rents)}
                          </p>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                          <span className="font-medium text-[#60758b]">
                            Lease progress
                          </span>
                          <span className="font-semibold text-[#35546c]">
                            {cardFacts.lease
                              ? `${cardFacts.lease.percentage}% complete`
                              : stock.occupied
                                ? "Lease dates pending"
                                : "Vacant"}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e8eef4]">
                          <div
                            className="h-full rounded-full bg-[#16894f] transition-[width]"
                            style={{
                              width: `${cardFacts.lease?.percentage || 0}%`,
                            }}
                          />
                        </div>
                        {cardFacts.lease ? (
                          <p className="mt-1.5 text-[0.7rem] text-[#718399]">
                            Ends {formatDate(cardFacts.lease.end)}
                          </p>
                        ) : null}
                      </div>
                      {renewal ? (
                        <p className="rounded-[10px] border border-[#f6dfb6] bg-[#fff8ea] px-3 py-2 text-xs font-semibold text-[#8a5207]">
                          {renewal.count} renewal
                          {renewal.count === 1 ? "" : "s"} due · next{" "}
                          {formatDate(renewal.nextDue)}
                        </p>
                      ) : null}
                      <div className="mt-auto flex items-center justify-between border-t border-[#eef3f8] pt-3 text-xs font-semibold text-[#1769d1]">
                        <span>
                          {title(property.propertyType || "property")}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          Open <ChevronRight size={15} />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </section>
          ) : (
            <section className="mt-4 rounded-[18px] border border-dashed border-[#d8e4f0] bg-[#f9fbfd] p-10 text-center">
              <Building2 className="mx-auto text-[#7b8ca2]" size={28} />
              <p className="mt-3 font-semibold text-[#20364d]">
                No{" "}
                {stockView === "renewals"
                  ? "upcoming renewals"
                  : "managed properties"}{" "}
                in this view
              </p>
              <p className="mt-1 text-sm text-[#60758b]">
                {stockView === "renewals"
                  ? "No active lease is due to renew in the next 90 days."
                  : "Add a property before creating units, mandates, or vacancies."}
              </p>
              {stockView === "all" ? (
                <button
                  type="button"
                  onClick={() => setDrawer(true)}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#0f2743] px-3 text-sm font-semibold text-white"
                >
                  <Plus size={16} />
                  Add property
                </button>
              ) : null}
            </section>
          )}
        </section>
      </section>
      <CreatePropertyDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        form={form}
        update={update}
        submit={submit}
        creating={creating}
      />
    </main>
  );
}
