// Form state and workflow handlers remain in the lead workspace controller.
import Modal from "../../components/ui/Modal"
import Button from "../../components/ui/Button"
import { Home, UserRound, FileText } from "lucide-react"
import { SELLER_LEAD_OWNERSHIP_ROUTES, resolveSellerLeadOwnershipRoute } from "../../lib/sellerLeadOwnershipSetupModel"
import Field from "../../components/ui/Field"
import AddressInput from "../../components/location/AddressInput"
import { sellerYesNoValue } from "../../lib/sellerFicaOnboardingFields"
import SellerFicaQuestions from "../../components/onboarding/SellerFicaQuestions"
import { addListingSellerProfileDraftPerson, updateListingSellerProfileDraftPerson, removeListingSellerProfileDraftPerson } from "../../lib/listingSellerProfileBuilderModel"

export default function SellerLeadProfileDialog({ closeSellerLeadEditModal, error, handleSaveSellerLeadEditDetails, isLeadDetailSaving, normalizeKey, normalizeText, selectSellerLeadOwnershipRoute, selectedLeadIsSeller, sellerLeadEditModal, sellerLeadEditMode, sellerLeadEditSubtitle, sellerLeadEditTitle, sellerLeadOwnershipRoute, sellerProfileEditForm, sellerProfileEditIsCompany, sellerProfileEditIsForeign, sellerProfileEditIsNatural, sellerProfileEditIsTrust, setSellerProfileEditForm, titleCaseWorkspaceValue, updateSellerProfileEditField }) {
  return (
<Modal
        open={sellerLeadEditModal.open && selectedLeadIsSeller}
        onClose={closeSellerLeadEditModal}
        title={sellerLeadEditTitle}
        subtitle={sellerLeadEditSubtitle}
        className="!max-w-[760px]"
        footer={(
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeSellerLeadEditModal} disabled={isLeadDetailSaving}>
              Cancel
            </Button>
            <Button type="submit" form="kingstons-seller-lead-edit-form" disabled={isLeadDetailSaving}>
              {isLeadDetailSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}
      >
        <form id="kingstons-seller-lead-edit-form" className="grid gap-5" onSubmit={(event) => void handleSaveSellerLeadEditDetails(event)}>
          {error ? <p role="alert" className="rounded-[12px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          <section className="rounded-[18px] border border-[#dfe8f2] bg-[#fbfdff] p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#eaf7ef] text-[#167348]">
                {sellerLeadEditMode === 'property' || sellerLeadEditMode === 'characteristics' || sellerLeadEditMode === 'features' || sellerLeadEditMode === 'defects' ? <Home className="h-5 w-5" /> : sellerLeadEditMode === 'personal' || sellerLeadEditMode === 'profile' ? <UserRound className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              </span>
              <div>
                <h4 className="text-sm font-semibold text-[#102033]">{sellerLeadEditTitle}</h4>
                <p className="mt-1 text-xs leading-5 text-[#60758b]">
                  Changes are saved to this seller lead and reused by the seller workspace.
                </p>
              </div>
            </div>

            {sellerLeadEditMode === 'personal' || sellerLeadEditMode === 'profile' ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <fieldset className="grid gap-3 sm:col-span-2">
                  <legend className="text-sm font-semibold text-[#20364c]">Who is the legal owner?</legend>
                  <p className="-mt-1 text-xs leading-5 text-[#60758b]">Choose the owner, not merely the person receiving the onboarding link. The primary contact and legal signers can be different people.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SELLER_LEAD_OWNERSHIP_ROUTES.map((route) => {
                      const selected = resolveSellerLeadOwnershipRoute(sellerProfileEditForm) === route.value
                      return (
                        <button
                          key={route.value}
                          type="button"
                          onClick={() => selectSellerLeadOwnershipRoute(route.value)}
                          className={`rounded-[12px] border px-3 py-2.5 text-left transition ${selected ? 'border-[#168452] bg-[#ecfaf1] text-[#0f6840]' : 'border-[#dbe6f2] bg-white text-[#29435d] hover:border-[#a9c9b8]'}`}
                        >
                          <span className="block text-sm font-semibold">{route.label}</span>
                          <span className="mt-0.5 block text-xs leading-4 text-[#60758b]">{route.description || 'Select this legal ownership route.'}</span>
                        </button>
                      )
                    })}
                  </div>
                </fieldset>

                {sellerProfileEditIsNatural ? (
                  <>
                    <Field placeholder="First name" value={sellerProfileEditForm.firstName} onChange={(event) => updateSellerProfileEditField('firstName', event.target.value)} />
                    <Field placeholder="Last name" value={sellerProfileEditForm.lastName} onChange={(event) => updateSellerProfileEditField('lastName', event.target.value)} />
                    <Field placeholder="Phone" value={sellerProfileEditForm.phone} onChange={(event) => updateSellerProfileEditField('phone', event.target.value)} />
                    <Field placeholder="Email" value={sellerProfileEditForm.email} onChange={(event) => updateSellerProfileEditField('email', event.target.value)} />
                    <Field placeholder="ID number" value={sellerProfileEditForm.idNumber} onChange={(event) => updateSellerProfileEditField('idNumber', event.target.value)} />
                    <Field type="date" placeholder="Date of birth" value={sellerProfileEditForm.dateOfBirth} onChange={(event) => updateSellerProfileEditField('dateOfBirth', event.target.value)} />
                    <Field placeholder="Nationality" value={sellerProfileEditForm.nationality} onChange={(event) => updateSellerProfileEditField('nationality', event.target.value)} />
                    <Field placeholder="Marital status" value={sellerProfileEditForm.maritalStatus} onChange={(event) => updateSellerProfileEditField('maritalStatus', event.target.value)} />
                    <Field placeholder="Alternative number" className="sm:col-span-2" value={sellerProfileEditForm.alternativeNumber} onChange={(event) => updateSellerProfileEditField('alternativeNumber', event.target.value)} />
                  </>
                ) : null}

                {sellerLeadOwnershipRoute === 'multiple_owners' ? (
                  <>
                    <Field as="textarea" rows={3} placeholder="Additional owners — one full name per line" className="sm:col-span-2" value={sellerProfileEditForm.multipleOwnersText} onChange={(event) => updateSellerProfileEditField('multipleOwnersText', event.target.value)} />
                    <p className="-mt-1 text-xs leading-5 text-[#60758b] sm:col-span-2">The primary contact above receives the onboarding link. Each owner will be captured as a required signer in the next signing phase.</p>
                  </>
                ) : null}

                {sellerLeadOwnershipRoute === 'deceased_estate' ? (
                  <>
                    <Field placeholder="Estate name" value={sellerProfileEditForm.deceasedEstateName} onChange={(event) => updateSellerProfileEditField('deceasedEstateName', event.target.value)} />
                    <Field placeholder="Estate reference" value={sellerProfileEditForm.estateReference} onChange={(event) => updateSellerProfileEditField('estateReference', event.target.value)} />
                    <Field placeholder="Executor name" value={sellerProfileEditForm.executorName} onChange={(event) => updateSellerProfileEditField('executorName', event.target.value)} />
                    <Field placeholder="Executor email" value={sellerProfileEditForm.executorEmail} onChange={(event) => updateSellerProfileEditField('executorEmail', event.target.value)} />
                    <Field placeholder="Executor phone" value={sellerProfileEditForm.executorPhone} onChange={(event) => updateSellerProfileEditField('executorPhone', event.target.value)} />
                    <Field placeholder="Executor authority details" value={sellerProfileEditForm.executorAuthorityDetails} onChange={(event) => updateSellerProfileEditField('executorAuthorityDetails', event.target.value)} />
                  </>
                ) : null}

                {sellerLeadOwnershipRoute === 'power_of_attorney' ? (
                  <>
                    <Field placeholder="Principal / legal owner name" value={sellerProfileEditForm.powerOfAttorneyPrincipalName} onChange={(event) => updateSellerProfileEditField('powerOfAttorneyPrincipalName', event.target.value)} />
                    <Field placeholder="Principal ID / passport number" value={sellerProfileEditForm.powerOfAttorneyPrincipalIdNumber} onChange={(event) => updateSellerProfileEditField('powerOfAttorneyPrincipalIdNumber', event.target.value)} />
                    <Field placeholder="Representative name" value={sellerProfileEditForm.powerOfAttorneyName} onChange={(event) => updateSellerProfileEditField('powerOfAttorneyName', event.target.value)} />
                    <Field placeholder="Representative email" value={sellerProfileEditForm.powerOfAttorneyEmail} onChange={(event) => updateSellerProfileEditField('powerOfAttorneyEmail', event.target.value)} />
                    <Field placeholder="Representative phone" value={sellerProfileEditForm.powerOfAttorneyPhone} onChange={(event) => updateSellerProfileEditField('powerOfAttorneyPhone', event.target.value)} />
                    <Field placeholder="Authority reference / details" value={sellerProfileEditForm.powerOfAttorneyAuthorityDetails} onChange={(event) => updateSellerProfileEditField('powerOfAttorneyAuthorityDetails', event.target.value)} />
                  </>
                ) : null}

                {sellerProfileEditIsCompany ? (
                  <>
                    <Field placeholder="Company name" value={sellerProfileEditForm.companyName} onChange={(event) => updateSellerProfileEditField('companyName', event.target.value)} />
                    <Field placeholder="Company registration number" value={sellerProfileEditForm.companyRegistrationNumber} onChange={(event) => updateSellerProfileEditField('companyRegistrationNumber', event.target.value)} />
                    <AddressInput placeholder="Registered address" className="sm:col-span-2" value={sellerProfileEditForm.companyRegisteredAddress} onChange={(event) => updateSellerProfileEditField('companyRegisteredAddress', event.target.value)} />
                    <Field as="textarea" rows={3} placeholder="Directors" className="sm:col-span-2" value={sellerProfileEditForm.companyDirectorsText} onChange={(event) => updateSellerProfileEditField('companyDirectorsText', event.target.value)} />
                    <Field placeholder="Authorised signatory" value={sellerProfileEditForm.authorisedSignatoryName} onChange={(event) => updateSellerProfileEditField('authorisedSignatoryName', event.target.value)} />
                    <Field placeholder="Signatory capacity" value={sellerProfileEditForm.authorisedSignatoryCapacity} onChange={(event) => updateSellerProfileEditField('authorisedSignatoryCapacity', event.target.value)} />
                    <Field placeholder="Signatory email" value={sellerProfileEditForm.authorisedSignatoryEmail} onChange={(event) => updateSellerProfileEditField('authorisedSignatoryEmail', event.target.value)} />
                    <Field placeholder="Signatory phone" value={sellerProfileEditForm.authorisedSignatoryPhone} onChange={(event) => updateSellerProfileEditField('authorisedSignatoryPhone', event.target.value)} />
                    <Field placeholder="Signatory ID / passport" value={sellerProfileEditForm.authorisedSignatoryIdNumber || ''} onChange={(event) => updateSellerProfileEditField('authorisedSignatoryIdNumber', event.target.value)} />
                    <Field placeholder="Signatory nationality" value={sellerProfileEditForm.authorisedSignatoryNationality || ''} onChange={(event) => updateSellerProfileEditField('authorisedSignatoryNationality', event.target.value)} />
                    <AddressInput placeholder="Signatory address" className="sm:col-span-2" value={sellerProfileEditForm.authorisedSignatoryAddress} onChange={(event) => updateSellerProfileEditField('authorisedSignatoryAddress', event.target.value)} />
                    <Field type="date" placeholder="Resolution date" value={sellerProfileEditForm.companyResolutionDate} onChange={(event) => updateSellerProfileEditField('companyResolutionDate', event.target.value)} />
                    <Field placeholder="Authority basis" value={sellerProfileEditForm.companyAuthorityBasis} onChange={(event) => updateSellerProfileEditField('companyAuthorityBasis', event.target.value)} />
                  </>
                ) : null}

                {sellerProfileEditIsTrust ? (
                  <>
                    <Field placeholder="Trust name" value={sellerProfileEditForm.trustName} onChange={(event) => updateSellerProfileEditField('trustName', event.target.value)} />
                    <Field placeholder="Trust registration number" value={sellerProfileEditForm.trustRegistrationNumber} onChange={(event) => updateSellerProfileEditField('trustRegistrationNumber', event.target.value)} />
                    <AddressInput placeholder="Registered address" className="sm:col-span-2" value={sellerProfileEditForm.trustRegisteredAddress} onChange={(event) => updateSellerProfileEditField('trustRegisteredAddress', event.target.value)} />
                    <Field as="textarea" rows={3} placeholder="Trustees" className="sm:col-span-2" value={sellerProfileEditForm.trusteesText} onChange={(event) => updateSellerProfileEditField('trusteesText', event.target.value)} />
                    <Field placeholder="Authorised trustee" value={sellerProfileEditForm.authorisedTrusteeName} onChange={(event) => updateSellerProfileEditField('authorisedTrusteeName', event.target.value)} />
                    <Field placeholder="Trustee capacity" value={sellerProfileEditForm.authorisedTrusteeCapacity} onChange={(event) => updateSellerProfileEditField('authorisedTrusteeCapacity', event.target.value)} />
                    <Field placeholder="Trustee email" value={sellerProfileEditForm.authorisedTrusteeEmail} onChange={(event) => updateSellerProfileEditField('authorisedTrusteeEmail', event.target.value)} />
                    <Field placeholder="Trustee phone" value={sellerProfileEditForm.authorisedTrusteePhone} onChange={(event) => updateSellerProfileEditField('authorisedTrusteePhone', event.target.value)} />
                    <Field placeholder="Trustee ID / passport" value={sellerProfileEditForm.authorisedTrusteeIdNumber || ''} onChange={(event) => updateSellerProfileEditField('authorisedTrusteeIdNumber', event.target.value)} />
                    <Field placeholder="Trustee nationality" value={sellerProfileEditForm.authorisedTrusteeNationality || ''} onChange={(event) => updateSellerProfileEditField('authorisedTrusteeNationality', event.target.value)} />
                    <AddressInput placeholder="Trustee address" className="sm:col-span-2" value={sellerProfileEditForm.authorisedTrusteeAddress} onChange={(event) => updateSellerProfileEditField('authorisedTrusteeAddress', event.target.value)} />
                    <Field placeholder="Authority basis" className="sm:col-span-2" value={sellerProfileEditForm.trustAuthorityBasis} onChange={(event) => updateSellerProfileEditField('trustAuthorityBasis', event.target.value)} />
                  </>
                ) : null}

                {sellerProfileEditIsForeign ? (
                  <>
                    <Field placeholder="Foreign country / jurisdiction" value={sellerProfileEditForm.foreignOwnerCountry} onChange={(event) => updateSellerProfileEditField('foreignOwnerCountry', event.target.value)} />
                    <Field placeholder="Residency / signing status" value={sellerProfileEditForm.foreignResidencyStatus} onChange={(event) => updateSellerProfileEditField('foreignResidencyStatus', event.target.value)} />
                    {sellerProfileEditIsCompany || sellerProfileEditIsTrust ? (
                      <Field placeholder="Foreign registration number" className="sm:col-span-2" value={sellerProfileEditForm.foreignRegistrationNumber} onChange={(event) => updateSellerProfileEditField('foreignRegistrationNumber', event.target.value)} />
                    ) : (
                      <Field placeholder="Foreign passport number" className="sm:col-span-2" value={sellerProfileEditForm.foreignPassportNumber} onChange={(event) => updateSellerProfileEditField('foreignPassportNumber', event.target.value)} />
                    )}
                  </>
                ) : null}
              </div>
            ) : null}

            {sellerLeadEditMode === 'address' ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <AddressInput placeholder="Street" className="sm:col-span-2" value={sellerProfileEditForm.residentialStreet} onChange={(event) => updateSellerProfileEditField('residentialStreet', event.target.value)} />
                <Field placeholder="Suburb" value={sellerProfileEditForm.residentialSuburb} onChange={(event) => updateSellerProfileEditField('residentialSuburb', event.target.value)} />
                <Field placeholder="City" value={sellerProfileEditForm.residentialCity} onChange={(event) => updateSellerProfileEditField('residentialCity', event.target.value)} />
                <Field placeholder="Province" value={sellerProfileEditForm.residentialProvince} onChange={(event) => updateSellerProfileEditField('residentialProvince', event.target.value)} />
                <Field placeholder="Postal code" value={sellerProfileEditForm.residentialPostalCode} onChange={(event) => updateSellerProfileEditField('residentialPostalCode', event.target.value)} />
                <Field placeholder="Country" className="sm:col-span-2" value={sellerProfileEditForm.residentialCountry} onChange={(event) => updateSellerProfileEditField('residentialCountry', event.target.value)} />
              </div>
            ) : null}

            {sellerLeadEditMode === 'tax' ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-[#2a4057]">SA resident<Field as="select" value={sellerYesNoValue(sellerProfileEditForm.saResident)} onChange={(event) => updateSellerProfileEditField('saResident', event.target.value)}><option value="">Not captured</option><option value="yes">Yes</option><option value="no">No</option></Field></label>
                <Field placeholder="Income tax number" value={sellerProfileEditForm.incomeTaxNumber} onChange={(event) => updateSellerProfileEditField('incomeTaxNumber', event.target.value)} />
                <label className="grid gap-1 text-xs font-semibold text-[#607387]">VAT registered<Field as="select" value={sellerYesNoValue(sellerProfileEditForm.vatRegistered)} onChange={(event) => updateSellerProfileEditField('vatRegistered', event.target.value)}><option value="">Not captured</option><option value="yes">Yes</option><option value="no">No</option></Field></label>
                <label className="grid gap-1 text-sm font-medium text-[#2a4057]">POPI consent<Field as="select" value={sellerProfileEditForm.popiConsent} onChange={(event) => updateSellerProfileEditField('popiConsent', event.target.value)}><option value="" disabled={Boolean(sellerProfileEditForm.popiConsent)}>Not captured</option><option value="Accepted">Seller gave consent</option><option value="No">Seller has not given consent</option></Field><span className="text-xs text-[#607387]">Record the seller's permission to process these details. This does not sign any document.</span></label>
                <div className="sm:col-span-2"><SellerFicaQuestions form={sellerProfileEditForm} onChange={updateSellerProfileEditField} onAddPerson={(key, roleTitle) => setSellerProfileEditForm((previous) => addListingSellerProfileDraftPerson(previous, key, roleTitle))} onUpdatePerson={(key, index, field, value) => setSellerProfileEditForm((previous) => updateListingSellerProfileDraftPerson(previous, key, index, field, value))} onRemovePerson={(key, index) => setSellerProfileEditForm((previous) => removeListingSellerProfileDraftPerson(previous, key, index))} /></div>
              </div>
            ) : null}

            {sellerLeadEditMode === 'ownership' ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field placeholder="Ownership type" value={sellerProfileEditForm.ownershipType} onChange={(event) => updateSellerProfileEditField('ownershipType', event.target.value)} />
                <Field placeholder="Ownership scheme" value={sellerProfileEditForm.ownershipScheme} onChange={(event) => updateSellerProfileEditField('ownershipScheme', event.target.value)} />
                <Field placeholder="HOA / estate" value={sellerProfileEditForm.estateOrHoa} onChange={(event) => updateSellerProfileEditField('estateOrHoa', event.target.value)} />
                <Field placeholder="Bond exists" value={sellerProfileEditForm.bondExists} onChange={(event) => updateSellerProfileEditField('bondExists', event.target.value)} />
                <Field placeholder="Mortgage bank" className="sm:col-span-2" value={sellerProfileEditForm.mortgageBank} onChange={(event) => updateSellerProfileEditField('mortgageBank', event.target.value)} />
              </div>
            ) : null}

            {sellerLeadEditMode === 'property' ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <AddressInput placeholder="Property address" className="sm:col-span-2" value={sellerProfileEditForm.propertyAddress} onChange={(event) => updateSellerProfileEditField('propertyAddress', event.target.value)} />
                <Field placeholder="Property type" value={sellerProfileEditForm.propertyType} onChange={(event) => updateSellerProfileEditField('propertyType', event.target.value)} />
                <Field as="select" aria-label="Property title type" value={sellerProfileEditForm.ownershipScheme} onChange={(event) => {
                  const value = event.target.value
                  setSellerProfileEditForm((previous) => ({
                    ...previous,
                    ownershipScheme: value,
                    sectionalTitle: value ? (['sectional_title', 'share_block'].includes(value) ? 'Yes' : 'No') : '',
                  }))
                }}>
                  <option value="">Property title type — not captured</option>
                  {sellerProfileEditForm.ownershipScheme && !['full_title', 'sectional_title', 'share_block', 'freehold', 'agricultural_holding', 'other'].includes(sellerProfileEditForm.ownershipScheme) ? (
                    <option value={sellerProfileEditForm.ownershipScheme}>{titleCaseWorkspaceValue(sellerProfileEditForm.ownershipScheme)}</option>
                  ) : null}
                  {['full_title', 'sectional_title', 'share_block', 'freehold', 'agricultural_holding', 'other'].map((value) => (
                    <option key={value} value={value}>{titleCaseWorkspaceValue(value)}</option>
                  ))}
                </Field>
                <Field placeholder="Complex / Estate / Scheme" value={sellerProfileEditForm.estateComplexName} onChange={(event) => {
                  const value = event.target.value
                  setSellerProfileEditForm((previous) => ({ ...previous, estateComplexName: value, schemeName: value }))
                }} />
                <Field placeholder="Erf / Stand number" value={sellerProfileEditForm.erfNumber} onChange={(event) => updateSellerProfileEditField('erfNumber', event.target.value)} />
                {(['sectional_title', 'share_block'].includes(normalizeKey(sellerProfileEditForm.ownershipScheme).replace(/[\s-]+/g, '_')) ||
                  (!normalizeText(sellerProfileEditForm.ownershipScheme) && normalizeKey(sellerProfileEditForm.sectionalTitle) === 'yes')) ? <>
                <Field as="select" aria-label="Sectional title" value={sellerProfileEditForm.sectionalTitle} onChange={(event) => updateSellerProfileEditField('sectionalTitle', event.target.value)}>
                  <option value="">Sectional title — not captured</option>
                  <option value="Yes">Sectional title — Yes</option>
                  <option value="No">Sectional title — No</option>
                </Field>
                <Field placeholder="Section number" value={sellerProfileEditForm.sectionNumber} onChange={(event) => updateSellerProfileEditField('sectionNumber', event.target.value)} />
                <Field placeholder="Unit number" value={sellerProfileEditForm.unitNumber} onChange={(event) => updateSellerProfileEditField('unitNumber', event.target.value)} />
                </> : null}
                <Field placeholder="Suburb" value={sellerProfileEditForm.propertySuburb} onChange={(event) => updateSellerProfileEditField('propertySuburb', event.target.value)} />
                <Field placeholder="City" value={sellerProfileEditForm.propertyCity} onChange={(event) => updateSellerProfileEditField('propertyCity', event.target.value)} />
                <Field placeholder="Province" value={sellerProfileEditForm.propertyProvince} onChange={(event) => updateSellerProfileEditField('propertyProvince', event.target.value)} />
                <Field placeholder="Postal code" value={sellerProfileEditForm.propertyPostalCode} onChange={(event) => updateSellerProfileEditField('propertyPostalCode', event.target.value)} />
              </div>
            ) : null}

            {sellerLeadEditMode === 'characteristics' ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field placeholder="Estimated asking price" value={sellerProfileEditForm.askingPrice} onChange={(event) => updateSellerProfileEditField('askingPrice', event.target.value)} />
                <Field placeholder="Bedrooms" value={sellerProfileEditForm.bedrooms} onChange={(event) => updateSellerProfileEditField('bedrooms', event.target.value)} />
                <Field placeholder="Bathrooms" value={sellerProfileEditForm.bathrooms} onChange={(event) => updateSellerProfileEditField('bathrooms', event.target.value)} />
                <Field placeholder="Garages" value={sellerProfileEditForm.garages} onChange={(event) => updateSellerProfileEditField('garages', event.target.value)} />
                <Field placeholder="Parking" value={sellerProfileEditForm.parking} onChange={(event) => updateSellerProfileEditField('parking', event.target.value)} />
                <Field placeholder="Erf size" value={sellerProfileEditForm.erfSize} onChange={(event) => updateSellerProfileEditField('erfSize', event.target.value)} />
                <Field placeholder="Floor size" value={sellerProfileEditForm.floorSize} onChange={(event) => updateSellerProfileEditField('floorSize', event.target.value)} />
                <Field placeholder="Levies" value={sellerProfileEditForm.levies} onChange={(event) => updateSellerProfileEditField('levies', event.target.value)} />
                <Field placeholder="Rates and taxes" value={sellerProfileEditForm.ratesAndTaxes} onChange={(event) => updateSellerProfileEditField('ratesAndTaxes', event.target.value)} />
              </div>
            ) : null}

            {sellerLeadEditMode === 'features' ? (
              <div className="mt-4">
                <Field
                  as="textarea"
                  rows={5}
                  placeholder="Features, separated by commas or new lines"
                  value={sellerProfileEditForm.propertyFeaturesText}
                  onChange={(event) => updateSellerProfileEditField('propertyFeaturesText', event.target.value)}
                />
              </div>
            ) : null}

            {sellerLeadEditMode === 'defects' ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field placeholder="Roof" value={sellerProfileEditForm.roofDefect} onChange={(event) => updateSellerProfileEditField('roofDefect', event.target.value)} />
                <Field placeholder="Plumbing" value={sellerProfileEditForm.plumbingDefect} onChange={(event) => updateSellerProfileEditField('plumbingDefect', event.target.value)} />
                <Field placeholder="Electrical" value={sellerProfileEditForm.electricalDefect} onChange={(event) => updateSellerProfileEditField('electricalDefect', event.target.value)} />
                <Field placeholder="Damp" value={sellerProfileEditForm.dampDefect} onChange={(event) => updateSellerProfileEditField('dampDefect', event.target.value)} />
                <Field placeholder="Cracks" value={sellerProfileEditForm.cracks} onChange={(event) => updateSellerProfileEditField('cracks', event.target.value)} />
                <Field placeholder="Pest damage" value={sellerProfileEditForm.pestDamage} onChange={(event) => updateSellerProfileEditField('pestDamage', event.target.value)} />
                <Field placeholder="Other defects" className="sm:col-span-2" value={sellerProfileEditForm.otherDefects} onChange={(event) => updateSellerProfileEditField('otherDefects', event.target.value)} />
              </div>
            ) : null}

            {sellerLeadEditMode === 'notes' ? (
              <div className="mt-4">
                <Field as="textarea" rows={5} placeholder="Seller notes" value={sellerProfileEditForm.agentNotes} onChange={(event) => updateSellerProfileEditField('agentNotes', event.target.value)} />
              </div>
            ) : null}
          </section>
        </form>
      </Modal>
  )
}
