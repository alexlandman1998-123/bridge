import {
  LANDLORD_PROFILE_FIELDS,
  LANDLORD_PERSON_FIELDS,
  LANDLORD_PROPERTY_FIELDS,
  LANDLORD_CONDITIONAL_OPTIONS,
  rentalLandlordPropertyFieldVisible,
} from '../../../../services/rentals/rentalLandlordOnboardingModel.js'
const title = (value) =>
  value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (letter) => letter.toUpperCase())
export default function RentalLandlordDiscoveryForm({
  data,
  onChange,
  disabled = false,
}) {
  const field = (row, key, update, prefix = '') => (
    <label key={key} className="grid gap-1 text-sm">
      <span>{title(key)}</span>
      {LANDLORD_CONDITIONAL_OPTIONS[key] ? <select
        aria-label={`${prefix}${title(key)}`}
        value={row[key] ?? ''}
        disabled={disabled}
        onChange={(event) => update(key, event.target.value)}
        className="min-w-0 rounded-lg border p-2"
      ><option value="">Choose {title(key).toLowerCase()}</option>{LANDLORD_CONDITIONAL_OPTIONS[key].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <input
        aria-label={`${prefix}${title(key)}`}
        value={row[key] ?? ''}
        disabled={disabled}
        onChange={(event) => update(key, event.target.value)}
        className="min-w-0 rounded-lg border p-2"
      />}
    </label>
  )
  const setProfile = (key, value) =>
    onChange({ ...data, profile: { ...data.profile, [key]: value } })
  const legal = ['company', 'close_corporation', 'trust'].includes(
    data.profile?.type,
  )
  return (
    <div className="space-y-5">
      <section className="rounded-xl border p-4">
        <h2 className="font-semibold">Who is the landlord?</h2>
        <label className="mt-3 grid gap-1 text-sm">
          Landlord type
          <select
            aria-label="Landlord type"
            value={data.profile?.type || ''}
            disabled={disabled}
            onChange={(event) => setProfile('type', event.target.value)}
            className="rounded-lg border p-2"
          >
            <option value="">Choose landlord type</option>
            {[
              'individual',
              'multiple_owners',
              'company',
              'close_corporation',
              'trust',
              'foreign_owner',
              'other_entity',
            ].map((type) => (
              <option key={type} value={type}>
                {title(type.replaceAll('_', ' '))}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {LANDLORD_PROFILE_FIELDS.filter(
            (key) =>
              key !== 'type' &&
              (legal ||
                ![
                  'registrationNumber',
                  'tradingName',
                  'authorisedSignatoryName',
                  'authorisedSignatoryCapacity',
                  'authorisedSignatoryIdNumber',
                  'authorisedSignatoryNationality',
                  'authorisedSignatoryEmail',
                  'authorisedSignatoryPhone',
                  'authorityBasis',
                  'resolutionDate',
                ].includes(key)),
          ).map((key) => field(data.profile || {}, key, setProfile))}
        </div>
      </section>
      <section className="rounded-xl border p-4">
        <h2 className="font-semibold">
          Co-owners, trustees and relevant representatives
        </h2>
        {(data.profile?.people || []).map((person, index) => (
          <div key={person.id} className="mt-3 rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {LANDLORD_PERSON_FIELDS.filter((key) => key !== 'id').map((key) =>
                field(
                  person,
                  key,
                  (name, value) =>
                    setProfile(
                      'people',
                      data.profile.people.map((item) =>
                        item.id === person.id
                          ? { ...item, [name]: value }
                          : item,
                      ),
                    ),
                  `Person ${index + 1} `,
                ),
              )}
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                setProfile(
                  'people',
                  data.profile.people.filter((item) => item.id !== person.id),
                )
              }
              className="mt-3 rounded border px-3 py-2 text-sm"
            >
              Remove person {index + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            setProfile('people', [
              ...(data.profile?.people || []),
              { id: crypto.randomUUID(), name: '' },
            ])
          }
          className="mt-3 rounded border px-3 py-2 text-sm"
        >
          Add relevant person
        </button>
      </section>
      {(data.portfolio || []).map((property, index) => (
        <section key={property.id} className="rounded-xl border p-4">
          <h2 className="font-semibold">
            Property {index + 1}: {property.title || property.address}
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Ask your agent to add or remove a property. Each property has its
            own disclosure and mandate evidence.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {LANDLORD_PROPERTY_FIELDS.filter(
              (key) => !['id', 'furnished', 'petsAllowed'].includes(key) && rentalLandlordPropertyFieldVisible(key, property),
            ).map((key) =>
              field(
                property,
                key,
                (name, value) =>
                  onChange({
                    ...data,
                    portfolio: data.portfolio.map((item) =>
                      item.id === property.id
                        ? { ...item, [name]: value }
                        : item,
                    ),
                  }),
                `Property ${index + 1} `,
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
