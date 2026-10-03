import Modal from '../../components/ui/Modal'
import { Building2, Users, X, Loader2, Plus } from 'lucide-react'
import { resolveRentalLeadRole } from '../../services/rentals/rentalLeadPipelineModel'

export const INITIAL_RENTAL_LEAD_FORM = Object.freeze({
  role: "landlord",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  source: "Manual",
  propertyAddress: "",
  propertyType: "",
  expectedMonthlyRent: "",
  desiredArea: "",
  monthlyBudget: "",
  bedrooms: "",
  occupationDate: "",
  pets: "Not captured",
  notes: "",
});

export function LeadRoleButton({ role, active, count, onClick }) {
  const Icon = role === "landlord" ? Building2 : role === "tenant" ? Users : X;
  return <button type="button" data-rental-control="lead-category" aria-pressed={active} onClick={onClick} className={`flex min-h-[48px] min-w-0 items-center gap-3 rounded-[12px] px-4 text-left text-sm font-semibold ${active ? "border border-[#e4ebf2] bg-white text-[#20364d] shadow-sm" : "text-[#60758b]"}`}><Icon size={18} aria-hidden="true" /><span className="flex-1">{role === "landlord" ? "Landlord Leads" : role === "tenant" ? "Tenant Leads" : "Closed Leads"}</span><span className="rounded-full bg-[#edf5ff] px-2.5 py-1 text-xs">{count}</span></button>
}

export default function RentalLeadDialog({
  form,
  onChange,
  onClose,
  onSubmit,
  saving,
  error,
  linkedListing,
  roleLocked = false,
}) {
  const isLandlord = resolveRentalLeadRole(form.role) === "landlord";
  return (
    <Modal open onClose={() => { if (!saving) onClose() }} title={roleLocked ? 'Add Tenant Lead' : 'Create rental lead'} className="max-w-3xl">
      <div className="rental-module">
      <form onSubmit={onSubmit}>
        <fieldset disabled={saving} className="min-w-0 border-0 p-0">
        {linkedListing && !isLandlord ? <p className="mt-4 text-sm text-[#607891]">Property enquiry: <strong>{linkedListing.listingTitle || linkedListing.title || linkedListing.address}</strong></p> : null}
        {!roleLocked ? <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <LeadRoleButton
            role="landlord"
            active={isLandlord}
            onClick={() => onChange("role", "landlord")}
          />
          <LeadRoleButton
            role="tenant"
            active={!isLandlord}
            onClick={() => onChange("role", "tenant")}
          />
        </div> : null}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="form-field">
            <span>First name</span>
            <input
              required
              value={form.firstName}
              onChange={(event) => onChange("firstName", event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Last name</span>
            <input
              value={form.lastName}
              onChange={(event) => onChange("lastName", event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Phone</span>
            <input
              value={form.phone}
              onChange={(event) => onChange("phone", event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => onChange("email", event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Source</span>
            <select
              value={form.source}
              onChange={(event) => onChange("source", event.target.value)}
            >
              <option>Manual</option>
              <option>Property24</option>
              <option>Private Property</option>
              <option>Website</option>
              <option>Referral</option>
              <option>WhatsApp</option>
            </select>
          </label>
          {isLandlord ? (
            <>
              <label className="form-field">
                <span>Property address</span>
                <input
                  required
                  value={form.propertyAddress}
                  onChange={(event) =>
                    onChange("propertyAddress", event.target.value)
                  }
                />
              </label>
              <label className="form-field">
                <span>Property type</span>
                <input
                  value={form.propertyType}
                  onChange={(event) =>
                    onChange("propertyType", event.target.value)
                  }
                  placeholder="Apartment, house..."
                />
              </label>
              <label className="form-field">
                <span>Expected monthly rent</span>
                <input
                  type="number"
                  min="0"
                  value={form.expectedMonthlyRent}
                  onChange={(event) =>
                    onChange("expectedMonthlyRent", event.target.value)
                  }
                />
              </label>
            </>
          ) : (
            <>
              <label className="form-field">
                <span>Desired area</span>
                <input
                  required
                  value={form.desiredArea}
                  onChange={(event) =>
                    onChange("desiredArea", event.target.value)
                  }
                />
              </label>
              <label className="form-field">
                <span>Monthly budget</span>
                <input
                  type="number"
                  min="0"
                  value={form.monthlyBudget}
                  onChange={(event) =>
                    onChange("monthlyBudget", event.target.value)
                  }
                />
              </label>
              <label className="form-field">
                <span>Bedrooms</span>
                <input
                  type="number"
                  min="0"
                  value={form.bedrooms}
                  onChange={(event) => onChange("bedrooms", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Occupation date</span>
                <input
                  type="date"
                  value={form.occupationDate}
                  onChange={(event) =>
                    onChange("occupationDate", event.target.value)
                  }
                />
              </label>
              <label className="form-field">
                <span>Pets</span>
                <select
                  value={form.pets}
                  onChange={(event) => onChange("pets", event.target.value)}
                >
                  <option>Not captured</option>
                  <option>No pets</option>
                  <option>Pets subject to approval</option>
                  <option>Pet friendly required</option>
                </select>
              </label>
            </>
          )}
        </div>
        <label className="form-field mt-4">
          <span>Internal note</span>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(event) => onChange("notes", event.target.value)}
          />
        </label>
        {error ? (
          <p className="mt-4 rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2"><button type="button" className="ui-pill-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            type="submit"
            disabled={saving}
            className="ui-pill-button ui-pill-button-active"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus size={16} aria-hidden="true" />
            )}
            {roleLocked ? 'Add Tenant Lead' : 'Create Rental Lead'}
          </button>
        </div>
        </fieldset>
      </form>
      </div>
    </Modal>
  );
}

