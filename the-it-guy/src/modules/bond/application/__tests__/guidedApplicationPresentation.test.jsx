import { applyGuidedBondApplicationMetadata, createGuidedBondApplicationMetadataPatch } from '../guided/phase2GuidedFlow.js'
import { useEffect, useState } from 'react'
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import AssetsScreen from '../guided/AssetsScreen.jsx'
import LiabilitiesScreen from '../guided/LiabilitiesScreen.jsx'
import { calculateLiabilityTotal } from '../flow/bondApplicationDerivedValues.js'
import { buildBondApplicationReviewSections } from '../submission/bondApplicationSubmissionViewModel.js'
import GuidedBondApplication, { IncomeBankScreen, MonthlyCommitmentsScreen } from '../guided/GuidedBondApplication.jsx'
import { getDemoClientPortalSeedData } from '../../../../lib/onboardingDemoLinks.js'
import { buildBondApplicationState, toLegacyBondApplication, fromLegacyBondApplication } from '../legacy/bondApplicationLegacyAdapter.js'
import { validateBondApplicationScreen } from '../flow/bondApplicationScreenValidation.js'
import { resolveBondApplicationFlow } from '../flow/resolveBondApplicationFlow.js'
beforeEach(() => { vi.stubGlobal('scrollTo', vi.fn()) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const portal = getDemoClientPortalSeedData('demo-buyer-portal').portalData
it.each([
  ['tax owed', 'Tax authority and tax type', 'SARS income tax', 'tax'],
  ['unpaid bills', 'Who do you owe and what is the bill for?', 'Municipal arrears', 'unpaid_bills'],
  ['private loans', 'Who did you borrow from?', 'Family loan', 'private_loan'],
  ['other amounts owed', 'Who do you owe and what is it for?', 'Other personal obligation', 'other'],
])('captures and reopens guided %s with balance and repayment', async (button, label, description, type) => {
  let latest
  function Harness() {
    const [state, setState] = useState(() => fromLegacyBondApplication({}))
    useEffect(() => { latest = state }, [state])
    return <LiabilitiesScreen state={state} updateRepeatableGroup={(_, liabilities) => setState(previous => ({ ...previous, participants: { ...previous.participants, primaryApplicant: { ...previous.participants.primaryApplicant, liabilities } } }))} />
  }
  render(<Harness />)
  expect(screen.getAllByRole('button', { name: /^Add / })).toHaveLength(4)
  fireEvent.click(screen.getByRole('button', { name: `Add ${button}`, exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Save amount owed' }))
  expect(screen.getAllByRole('alert')).toHaveLength(2)
  fireEvent.change(screen.getByLabelText(`${label} *`), { target: { value: description } })
  fireEvent.change(screen.getByLabelText('Outstanding amount (R) *'), { target: { value: '5000' } })
  fireEvent.change(screen.getByLabelText('Monthly repayment (R) (optional)'), { target: { value: '-5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save amount owed' }))
  expect(screen.getByRole('alert').textContent).toContain('R0 or more')
  fireEvent.change(screen.getByLabelText('Monthly repayment (R) (optional)'), { target: { value: '500' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save amount owed' }))
  const reloaded = buildBondApplicationState({ onboardingFormData: { formData: { bond_application: toLegacyBondApplication(latest) } } })
  expect(reloaded.participants.primaryApplicant.liabilities[0]).toMatchObject({ type, description, value: '5000', monthlyPayment: '500' })
  expect(validateBondApplicationScreen({ applicationState: reloaded, screenKey: 'liabilities' }).valid).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: `Edit ${description}` }))
  expect(screen.getByLabelText('Outstanding amount (R) *').value).toBe('5000')
  fireEvent.change(screen.getByLabelText('Outstanding amount (R) *'), { target: { value: '4000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save amount owed' }))
  expect(fromLegacyBondApplication(toLegacyBondApplication(latest)).participants.primaryApplicant.liabilities[0].value).toBe('4000')
  fireEvent.click(screen.getByRole('button', { name: `Remove ${description}` }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove item' }))
  expect(fromLegacyBondApplication(toLegacyBondApplication(latest)).participants.primaryApplicant.liabilities).toEqual([])
})
it('keeps edited imported liabilities authoritative and does not resurrect removed balances', () => {
  const state = fromLegacyBondApplication({ assets_liabilities: { other_liabilities_value: '5000', other_liabilities_description: 'Old balance', total_assets: '12000' }, unrelated: { keep: true } })
  state.participants.primaryApplicant.liabilities[0] = { ...state.participants.primaryApplicant.liabilities[0], type: 'tax', description: 'Updated balance', value: '4000' }
  let legacy = toLegacyBondApplication(state)
  expect(fromLegacyBondApplication(legacy).participants.primaryApplicant.liabilities).toHaveLength(1)
  expect(fromLegacyBondApplication(legacy).participants.primaryApplicant.liabilities[0].description).toBe('Updated balance')
  expect(legacy.assets_liabilities.net_asset_value).toBe('8000')
  const reloaded = fromLegacyBondApplication(legacy)
  reloaded.participants.primaryApplicant.liabilities = []
  legacy = toLegacyBondApplication(reloaded)
  expect(fromLegacyBondApplication(legacy).participants.primaryApplicant.liabilities).toEqual([])
  expect(legacy.assets_liabilities.total_liabilities).toBe('0')
  expect(legacy.unrelated).toEqual({ keep: true })
})
it('continues from Assets through empty liabilities to Credit history', async () => {
  const state = buildBondApplicationState(portal)
  expect(state.participants.primaryApplicant.liabilities).toEqual([])
  state.participants.primaryApplicant.assets = [{ id: 'vehicle', type: 'vehicle', description: 'Toyota Corolla', value: '210000', year: '2021' }]
  const draft = applyGuidedBondApplicationMetadata(toLegacyBondApplication(state), createGuidedBondApplicationMetadataPatch({ currentScreenKey: 'assets' }))
  render(<GuidedBondApplication portal={{ ...portal, onboardingFormData: { formData: { bond_application: draft } } }} token="assets-continue" preview showHandoffNotices={false} saveClientPortalOnboardingDraft={vi.fn().mockResolvedValue({ ok: true })} />)
  fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await screen.findByRole('heading', { name: 'What else do you owe?', exact: true })
  expect(screen.queryByText('Other liabilities 1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await screen.findByRole('heading', { name: 'Credit history', exact: true })
})
it('imports only meaningful liabilities and gives existing balances readable descriptions', () => {
  const legacy = { assets_liabilities: { liabilities_total: null, other_liabilities_value: '5000', other_liabilities_description: '', total_liabilities: '0' } }
  const state = fromLegacyBondApplication(legacy)
  expect(state.participants.primaryApplicant.liabilities).toEqual([{ legacyKey: 'other_liabilities', description: 'Other liabilities previously captured', value: '5000' }])
  expect(validateBondApplicationScreen({ applicationState: state, screenKey: 'liabilities' }).valid).toBe(true)
  expect(toLegacyBondApplication(state).assets_liabilities).toMatchObject(legacy.assets_liabilities)
})
it('shows errors for incomplete saved liabilities so Continue has an actionable explanation', async () => {
  const state = buildBondApplicationState(portal)
  state.participants.primaryApplicant.liabilities = [{ id: 'incomplete', description: 'Example liability', value: '' }]
  const draft = applyGuidedBondApplicationMetadata(toLegacyBondApplication(state), createGuidedBondApplicationMetadataPatch({ currentScreenKey: 'liabilities' }))
  render(<GuidedBondApplication portal={{ ...portal, onboardingFormData: { formData: { bond_application: draft } } }} token="liability-errors" preview showHandoffNotices={false} saveClientPortalOnboardingDraft={vi.fn().mockResolvedValue({ ok: true })} />)
  fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await screen.findByRole('alert')
  expect(screen.getByRole('alert').textContent).toContain('Enter amount. Select Edit')
  fireEvent.click(screen.getByRole('button', { name: 'Edit Example liability', exact: true }))
  fireEvent.change(screen.getByLabelText('Outstanding amount (R) *'), { target: { value: '5000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save amount owed' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await screen.findByRole('heading', { name: 'Credit history', exact: true })
})
it('shows one active section, editable prefill and one Continue action that saves before advancing', async () => {
  const save = vi.fn().mockResolvedValue({ ok: true })
  render(<GuidedBondApplication portal={portal} token="preview" preview showHandoffNotices={false} saveClientPortalOnboardingDraft={save} />)
  expect(screen.getAllByRole('heading', { name: 'Bond application', exact: true })).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: 'Continue', exact: true })).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Hide application' })).toBeNull()
  expect(screen.queryByText('Missing required sections')).toBeNull()
  fireEvent.change(screen.getByLabelText('Bond required'), { target: { value: '2400000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await screen.findByRole('heading', { name: 'How are you applying?' })
  expect(save).toHaveBeenCalled()
  expect(JSON.stringify(save.mock.calls[0][0].formData)).toContain('2400000')
  expect(screen.queryByLabelText('Bond required')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await waitFor(() => expect(screen.getByRole('heading', { name: 'How are you applying?' })).toBeTruthy())
  expect(screen.queryByRole('button', { name: 'Update my details' })).toBeNull()
})
it('keeps the active section and shows a save failure instead of advancing', async () => {
  const save = vi.fn().mockRejectedValue(new Error('Could not save application'))
  render(<GuidedBondApplication portal={portal} token="preview" showHandoffNotices={false} saveClientPortalOnboardingDraft={save} />)
  fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('We could not save'))
  expect(screen.getByRole('heading', { name: 'Your purchase' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'How are you applying?' })).toBeNull()
})
it('counts required answer paths once even when they appear on confirmation and editing screens', () => {
  const flow = resolveBondApplicationFlow({ applicationState: buildBondApplicationState(portal) })
  const questions = flow.screens.filter(item => !item.transitionOnly && !['documents', 'review_sign'].includes(item.stepKey)).flatMap(item => item.questions.filter(question => question.required))
  expect(flow.progress.totalRequired).toBe(new Set(questions.map(question => question.path)).size)
})
it('preserves navigation and edits across portal refreshes, and Back exits the first step', async () => {
  const save = vi.fn().mockResolvedValue({ ok: true })
  const onBack = vi.fn()
  const props = { token: 'preview', preview: true, showHandoffNotices: false, saveClientPortalOnboardingDraft: save, onBackToPortal: onBack }
  const view = render(<GuidedBondApplication {...props} portal={portal} />)
  fireEvent.change(screen.getByLabelText('Bond required'), { target: { value: '2400000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await screen.findByRole('heading', { name: 'How are you applying?' })
  expect(screen.getByRole('progressbar', { name: 'Position in details' }).getAttribute('aria-valuenow')).toBe('2')
  view.rerender(<GuidedBondApplication {...props} portal={structuredClone(portal)} />)
  expect(screen.getByRole('heading', { name: 'How are you applying?' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }))
  await screen.findByRole('heading', { name: 'Your purchase' })
  expect(screen.getByLabelText('Bond required').value).toBe('2400000')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Back', exact: true }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }))
  await waitFor(() => expect(onBack).toHaveBeenCalledOnce())
})
it('opens missing prefilled details on Continue and returns to the screen actually visited', async () => {
  const save = vi.fn().mockResolvedValue({ ok: true })
  render(<GuidedBondApplication portal={portal} token="preview" preview showHandoffNotices={false} saveClientPortalOnboardingDraft={save} />)
  fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await screen.findByRole('heading', { name: 'How are you applying?' })
  fireEvent.click(screen.getByRole('radio', { name: 'I am applying alone Continue in the guided application.' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await screen.findByRole('heading', { name: 'We have these details from your onboarding.' })
  const position = screen.getByRole('progressbar', { name: 'Position in details' }).getAttribute('aria-valuenow')
  fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await screen.findByRole('heading', { name: 'Update your details' })
  expect(screen.getByRole('progressbar', { name: 'Position in details' }).getAttribute('aria-valuenow')).toBe(position)
  expect(screen.getByText('Enter surname.')).toBeTruthy()
  fireEvent.change(screen.getByLabelText(/^Surname/), { target: { value: 'Example' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await screen.findByRole('heading', { name: 'How do you currently earn your main income?' })
  fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }))
  await screen.findByRole('heading', { name: 'Update your details' })
  expect(screen.getByLabelText(/^Surname/).value).toBe('Example')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Back', exact: true }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }))
  await screen.findByRole('heading', { name: 'We have these details from your onboarding.' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Back', exact: true }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }))
  await screen.findByRole('heading', { name: 'How are you applying?' })
})

it('prefills the shared marital choices and preserves marriage regime through save and reload', () => {
  const state = buildBondApplicationState({ onboardingFormData: { formData: { purchasers: [{ marital_status: 'married', marital_regime: 'out_of_community_with_accrual' }] } } })
  expect(state.participants.primaryApplicant.personal.marital_status).toBe('married')
  expect(state.participants.primaryApplicant.marital.regime).toBe('out_of_community_with_accrual')
  const reloaded = fromLegacyBondApplication(toLegacyBondApplication(state))
  expect(reloaded.participants.primaryApplicant.marital.regime).toBe('out_of_community_with_accrual')
})
it('saves inline commitments without a Save item action and round-trips amounts', () => {
  let latest
  function Harness() {
    const [state, setState] = useState(() => buildBondApplicationState(portal))
    useEffect(() => { latest = state }, [state])
    return <MonthlyCommitmentsScreen state={state} updateRepeatableGroup={(path, records) => setState(previous => ({ ...previous, participants: { ...previous.participants, primaryApplicant: { ...previous.participants.primaryApplicant, monthlyCommitments: records } } }))} />
  }
  render(<Harness />)
  fireEvent.click(screen.getByRole('radio', { name: 'Yes', exact: true }))
  fireEvent.change(screen.getByRole('combobox', { name: /Type of monthly cost/ }), { target: { value: 'insurance' } })
  fireEvent.change(screen.getByLabelText('Monthly amount (R)'), { target: { value: '450' } })
  expect(screen.queryByRole('button', { name: 'Save item' })).toBeNull()
  const reloaded = fromLegacyBondApplication(toLegacyBondApplication(latest))
  expect(reloaded.participants.primaryApplicant.monthlyCommitments.find(item => item.description === 'Insurance').monthlyAmount).toBe('450')
  latest.participants.primaryApplicant.monthlyCommitments = [{legacyKey: 'groceries', description: 'Groceries', monthlyAmount: '900'}]
  expect(toLegacyBondApplication(latest).income_deductions_expenses.primary.groceries).toBe('900')
})

it('does not block additional costs on hidden expenses captured earlier', () => {
  const state = buildBondApplicationState(portal)
  state.participants.primaryApplicant.monthlyCommitments = [{legacyKey:'groceries', description:'Groceries', monthlyAmount:null}]
  expect(validateBondApplicationScreen({applicationState:state, screenKey:'monthly_other_commitments'}).valid).toBe(true)
  state.participants.primaryApplicant.monthlyCommitments.push({id:'cost', guidedItemId:'cost', description:'', monthlyAmount:''})
  const invalid = validateBondApplicationScreen({applicationState:state, screenKey:'monthly_other_commitments'})
  expect(invalid.valid).toBe(false)
  expect(invalid.issues.map(item => item.path)).toEqual(['participants.primaryApplicant.monthlyCommitments.1.description', 'participants.primaryApplicant.monthlyCommitments.1.monthlyAmount'])
  state.participants.primaryApplicant.monthlyCommitments[1] = {id:'cost', guidedItemId:'cost', description:'Insurance', monthlyAmount:'450'}
  expect(validateBondApplicationScreen({applicationState:state, screenKey:'monthly_other_commitments'}).valid).toBe(true)
})

it('Continue passes additional costs with no extras and shows actionable errors for unfinished extras', async () => {
  const legacy = toLegacyBondApplication(buildBondApplicationState(portal))
  legacy.income_deductions_expenses.primary.groceries = null
  const draft = applyGuidedBondApplicationMetadata(legacy, createGuidedBondApplicationMetadataPatch({ currentScreenKey: 'monthly_other_commitments' }))
  const testPortal = {...portal, onboardingFormData:{formData:{bond_application:draft}}}
  const save = vi.fn().mockResolvedValue({ok:true})
  const view = render(<GuidedBondApplication portal={testPortal} token="additional-costs" preview showHandoffNotices={false} saveClientPortalOnboardingDraft={save} />)
  fireEvent.click(screen.getByRole('button', {name:'Continue',exact:true}))
  await screen.findByRole('heading', {name:'Monthly commitment summary'})
  view.unmount()
  render(<GuidedBondApplication portal={testPortal} token="additional-costs" preview showHandoffNotices={false} saveClientPortalOnboardingDraft={save} />)
  fireEvent.click(screen.getByRole('radio', {name:'Yes',exact:true}))
  fireEvent.click(screen.getByRole('button', {name:'Continue',exact:true}))
  expect(screen.getByText('Enter commitment.')).toBeTruthy()
  expect(screen.getByText('Enter monthly amount.')).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox', {name:/Type of monthly cost/}), {target:{value:'insurance'}})
  fireEvent.change(screen.getByLabelText(/^Monthly amount/), {target:{value:'450'}})
  fireEvent.click(screen.getByRole('button', {name:'Continue',exact:true}))
  await screen.findByRole('heading', {name:'Monthly commitment summary'})
  expect(JSON.stringify(save.mock.calls.at(-1)[0].formData)).toContain('Insurance')
})

it('asks only for the income bank, saves the selection and advances without account details', async () => {
  const legacy = toLegacyBondApplication(buildBondApplicationState(portal))
  legacy.banking_liabilities = {}
  legacy._guided_repeatables = {...legacy._guided_repeatables, bank_accounts: []}
  const draft = applyGuidedBondApplicationMetadata(legacy, createGuidedBondApplicationMetadataPatch({currentScreenKey:'bank_accounts'}))
  const save = vi.fn().mockResolvedValue({ok:true})
  const openDocuments = vi.fn()
  render(<GuidedBondApplication portal={{...portal,onboardingFormData:{formData:{bond_application:draft}}}} token="bank-selector" preview showHandoffNotices={false} saveClientPortalOnboardingDraft={save} onOpenDocuments={openDocuments} />)
  expect(screen.getByRole('heading', {name:'Where do you receive your income?'})).toBeTruthy()
  expect(screen.queryByLabelText('Account number')).toBeNull()
  expect(screen.queryByLabelText('Current balance')).toBeNull()
  expect(screen.queryByRole('button', {name:'Add bank account'})).toBeNull()
  fireEvent.change(screen.getByRole('combobox', {name:/Your income bank/}), {target:{value:'FNB'}})
  expect(screen.queryByRole('button', {name:'Open Documents',exact:true})).toBeNull()
  expect(openDocuments).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', {name:'Continue',exact:true}))
  await screen.findByRole('heading', {name:'Existing debts'})
  expect(save.mock.calls.at(-1)[0].formData.bond_application.banking_liabilities.primary_bank_name).toBe('FNB')
})

it.each(['permanent_employee', 'contract_employee', 'retired'])('requests three months of income statements for %s with an inline picker and no redirect', (employmentType) => {
  const state = buildBondApplicationState(portal)
  state.participants.primaryApplicant.employment.occupation_status = employmentType
  render(<IncomeBankScreen state={state} updateRepeatableGroup={vi.fn()} />)
  expect(screen.getByText(/latest 3 consecutive months of bank statements/)).toBeTruthy()
  expect(screen.getByText(/Sending will be available here once/)).toBeTruthy()
  expect(screen.getByLabelText('Choose bank statements').getAttribute('type')).toBe('file')
  expect(screen.getByRole('button', { name: 'Send statements to bond consultant' }).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: 'Open Documents' })).toBeNull()
})

it('selects multiple statements inline without sending, saving or claiming receipt, and lets the buyer remove a file', () => {
  const update = vi.fn()
  render(<IncomeBankScreen state={buildBondApplicationState(portal)} updateRepeatableGroup={update} />)
  const january = new File(['statement-one'], 'January.pdf', { type: 'application/pdf', lastModified: 1 })
  const february = new File(['statement-two'], 'February.pdf', { type: 'application/pdf', lastModified: 2 })
  const input = screen.getByLabelText('Choose bank statements')
  expect(input.multiple).toBe(true)
  fireEvent.change(input, { target: { files: [january, february] } })
  expect(screen.getByText('January.pdf')).toBeTruthy()
  expect(screen.getByText('February.pdf')).toBeTruthy()
  expect(screen.getAllByText('Selected · not sent')).toHaveLength(2)
  expect(update).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { files: [january] } })
  expect(screen.getAllByText('January.pdf')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Remove January.pdf' }))
  expect(screen.queryByText('January.pdf')).toBeNull()
  expect(screen.getByText('February.pdf')).toBeTruthy()
  expect(screen.queryByText('Already received')).toBeNull()
})

it.each(['self_employed', 'self-employed', 'own_business'])('requests six months of personal and business statements for %s', (employmentType) => {
  const state = buildBondApplicationState(portal)
  state.participants.primaryApplicant.employment.occupation_status = employmentType
  render(<IncomeBankScreen state={state} updateRepeatableGroup={vi.fn()} />)
  expect(screen.getByText(/latest 6 consecutive months of personal bank statements/)).toBeTruthy()
  expect(screen.getByText(/If you use a business bank account/)).toBeTruthy()
  expect(screen.queryByText(/latest 3 consecutive months of bank statements/)).toBeNull()
})

it('adds and edits a vehicle in a focused modal and preserves the details on reload', () => {
  let latest
  function Harness() {
    const [state, setState] = useState(() => fromLegacyBondApplication({ assets_liabilities: { vehicles: null, investments: '', fixed_property: null } }))
    useEffect(() => { latest = state }, [state])
    return <AssetsScreen state={state} updateRepeatableGroup={(_, assets) => setState(previous => ({ ...previous, participants: { ...previous.participants, primaryApplicant: { ...previous.participants.primaryApplicant, assets } } }))} />
  }
  render(<Harness />)
  expect(screen.queryByText('Assets 1')).toBeNull()
  expect(screen.getByText(/Assets are things you own/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Add vehicles' }))
  const dialog = screen.getByRole('dialog', { name: 'Add vehicle' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save vehicle' }))
  expect(within(dialog).getByText('Enter vehicle make and model.')).toBeTruthy()
  fireEvent.change(screen.getByLabelText(/Vehicle make and model/), { target: { value: 'Toyota Corolla' } })
  fireEvent.change(screen.getByLabelText(/Year/), { target: { value: '2021' } })
  fireEvent.change(screen.getByLabelText(/Estimated current value/), { target: { value: '210000' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save vehicle' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText('Toyota Corolla')).toBeTruthy()
  let reloaded = fromLegacyBondApplication(toLegacyBondApplication(latest))
  expect(reloaded.participants.primaryApplicant.assets).toHaveLength(1)
  expect(reloaded.participants.primaryApplicant.assets[0]).toMatchObject({ type: 'vehicle', description: 'Toyota Corolla', year: '2021', value: '210000' })
  expect(buildBondApplicationState({ onboardingFormData: { formData: { bond_application: toLegacyBondApplication(latest) } } }).participants.primaryApplicant.assets[0]).toMatchObject({ description: 'Toyota Corolla', year: '2021' })
  fireEvent.click(screen.getByRole('button', { name: 'Edit Toyota Corolla' }))
  fireEvent.change(screen.getByLabelText(/Estimated current value/), { target: { value: '205000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save vehicle' }))
  reloaded = fromLegacyBondApplication(toLegacyBondApplication(latest))
  expect(reloaded.participants.primaryApplicant.assets).toHaveLength(1)
  expect(reloaded.participants.primaryApplicant.assets[0].value).toBe('205000')
})

it('removes an imported asset without resurrecting it on reload, while preserving unrelated legacy information', () => {
  const state = fromLegacyBondApplication({ assets_liabilities: { vehicles: '50000', investments: null }, unrelated: { keep: true } })
  const update = vi.fn((_, assets) => { state.participants.primaryApplicant.assets = assets })
  render(<AssetsScreen state={state} updateRepeatableGroup={update} />)
  expect(screen.getByText('Vehicles previously captured')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Remove Vehicles previously captured' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove item' }))
  const legacy = toLegacyBondApplication(state)
  expect(legacy.unrelated).toEqual({ keep: true })
  expect(legacy.assets_liabilities.total_assets).toBe('0')
  expect(fromLegacyBondApplication(legacy).participants.primaryApplicant.assets).toEqual([])
})

it('editing an imported debt replaces its old details once and preserves the branch through the normal reload', () => {
  const state = fromLegacyBondApplication({ credit_history: { has_debts: 'yes', owns_property: 'no' }, banking_liabilities: { retail_account_name: 'Example store', retail_current_balance: '1000', retail_monthly_payment: '100', retail_settled: 'no' } })
  expect(state.participants.primaryApplicant.debts[0]).toMatchObject({ type: 'store_account', bank: 'Example store', outstandingBalance: '1000', monthlyInstalment: '100' })
  state.participants.primaryApplicant.debts[0] = { ...state.participants.primaryApplicant.debts[0], id: 'edited-store', source: 'guided', outstandingBalance: '800' }
  const legacy = toLegacyBondApplication(state)
  const reloaded = buildBondApplicationState({ onboardingFormData: { formData: { bond_application: legacy } } })
  expect(reloaded.participants.primaryApplicant.debts).toHaveLength(1)
  expect(reloaded.participants.primaryApplicant.debts[0].outstandingBalance).toBe('800')
  expect(reloaded.participants.primaryApplicant.credit).toMatchObject({ has_debts: 'yes', owns_property: 'no' })
  reloaded.participants.primaryApplicant.debts = []
  expect(fromLegacyBondApplication(toLegacyBondApplication(reloaded)).participants.primaryApplicant.debts).toEqual([])
})

it.each([
  ['Add savings', 'Add savings account', /Bank and savings account name/, /Current balance/, 'savings'],
  ['Add investments', 'Add investment', /Provider and investment name/, /Estimated current value/, 'investments'],
  ['Add retirement funds', 'Add retirement fund', /Provider and fund name/, /Estimated current value/, 'retirement_investment'],
  ['Add business interests', 'Add business interest', /Business name/, /Estimated current value/, 'business_interest'],
  ['Add other', 'Add other asset', /What do you own/, /Estimated current value/, 'other'],
])('captures %s with familiar labels and saves its category and value', (button, title, descriptionLabel, valueLabel, type) => {
  const update = vi.fn()
  render(<AssetsScreen state={fromLegacyBondApplication({})} updateRepeatableGroup={update} />)
  fireEvent.click(screen.getByRole('button', { name: button }))
  const dialog = screen.getByRole('dialog', { name: title })
  fireEvent.change(within(dialog).getByLabelText(descriptionLabel), { target: { value: 'Example holding' } })
  fireEvent.change(within(dialog).getByLabelText(valueLabel), { target: { value: '50000' } })
  if (type === 'business_interest') fireEvent.change(within(dialog).getByLabelText(/Your ownership share/), { target: { value: '25' } })
  fireEvent.click(within(dialog).getByRole('button', { name: /^Save/ }))
  expect(update.mock.calls[0][1][0]).toMatchObject({ type, description: 'Example holding', value: '50000' })
  if (type === 'business_interest') expect(update.mock.calls[0][1][0].ownershipPercentage).toBe('25')
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('property Yes requires an entry; a bond requires balance and repayment while an unbonded property does not', () => {
  const state = buildBondApplicationState(portal)
  state.participants.primaryApplicant.credit.owns_property = 'yes'
  state.participants.primaryApplicant.existingProperties = []
  expect(validateBondApplicationScreen({ applicationState: state, screenKey: 'existing_properties' }).valid).toBe(false)
  state.participants.primaryApplicant.existingProperties = [{ address: '1 Example Road', estimatedValue: '1000000', hasBond: 'no', willBeSold: 'no' }]
  expect(validateBondApplicationScreen({ applicationState: state, screenKey: 'existing_properties' }).valid).toBe(true)
  state.participants.primaryApplicant.existingProperties[0].hasBond = 'yes'
  expect(validateBondApplicationScreen({ applicationState: state, screenKey: 'existing_properties' }).issues.map(item => item.path)).toEqual(['participants.primaryApplicant.existingProperties.0.outstandingBondBalance', 'participants.primaryApplicant.existingProperties.0.monthlyBondRepayment'])
  Object.assign(state.participants.primaryApplicant.existingProperties[0], { outstandingBondBalance: '300000', monthlyBondRepayment: '3500' })
  expect(validateBondApplicationScreen({ applicationState: state, screenKey: 'existing_properties' }).valid).toBe(true)
  const reloaded = fromLegacyBondApplication(toLegacyBondApplication(state))
  expect(reloaded.participants.primaryApplicant.existingProperties[0]).toMatchObject({ hasBond: 'yes', monthlyBondRepayment: '3500' })
})

it('debts Yes captures every required detail and No hides saved debts and excludes their balances from totals', () => {
  const state = buildBondApplicationState(portal)
  state.participants.primaryApplicant.credit.has_debts = 'yes'
  state.participants.primaryApplicant.debts = []
  expect(validateBondApplicationScreen({ applicationState: state, screenKey: 'debts' }).valid).toBe(false)
  state.participants.primaryApplicant.debts = [{ id: 'loan', type: 'personal_loan', bank: 'Example Bank', outstandingBalance: '10000', monthlyInstalment: '500', settled: 'no' }]
  expect(validateBondApplicationScreen({ applicationState: state, screenKey: 'debts' }).valid).toBe(true)
  const baseline = calculateLiabilityTotal(state)
  state.participants.primaryApplicant.credit.has_debts = 'no'
  state.participants.primaryApplicant.credit.owns_property = 'no'
  const screens = resolveBondApplicationFlow({ applicationState: state }).screens.map(item => item.key)
  expect(screens).not.toContain('debts')
  expect(screens).not.toContain('existing_properties')
  expect(calculateLiabilityTotal(state)).toBe(baseline - 10000)
  const summary = buildBondApplicationReviewSections({ applicationState: state }).find(item => item.key === 'accounts_assets').summary
  expect(summary).toContain('0 debts')
  expect(summary).toContain('0 properties')
  const reloaded = fromLegacyBondApplication(toLegacyBondApplication(state))
  expect(reloaded.participants.primaryApplicant.credit.has_debts).toBe('no')
  expect(reloaded.participants.primaryApplicant.debts).toHaveLength(1)
})

it('shows conditional property bond fields and prevents saving an incomplete bonded property', async () => {
  const state = buildBondApplicationState(portal)
  state.participants.primaryApplicant.credit.owns_property = 'yes'
  state.participants.primaryApplicant.existingProperties = []
  const draft = applyGuidedBondApplicationMetadata(toLegacyBondApplication(state), createGuidedBondApplicationMetadataPatch({ currentScreenKey: 'existing_properties' }))
  expect(buildBondApplicationState({ ...portal, onboardingFormData: { formData: { bond_application: draft } } }).participants.primaryApplicant.credit.owns_property).toBe('yes')
  render(<GuidedBondApplication portal={{ ...portal, onboardingFormData: { formData: { bond_application: draft } } }} token="property-conditions" preview showHandoffNotices={false} saveClientPortalOnboardingDraft={vi.fn().mockResolvedValue({ ok: true })} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add property' }))
  fireEvent.change(screen.getByLabelText('Property address'), { target: { value: '1 Example Road' } })
  fireEvent.change(screen.getByLabelText('Estimated value'), { target: { value: '1000000' } })
  fireEvent.change(screen.getByLabelText('Does this property have an outstanding bond?'), { target: { value: 'yes' } })
  expect(screen.getByLabelText('Outstanding bond balance')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Save item' }))
  expect(screen.getByText('Enter outstanding bond balance.')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Does this property have an outstanding bond?'), { target: { value: 'no' } })
  expect(screen.queryByLabelText('Outstanding bond balance')).toBeNull()
  expect(screen.queryByLabelText('Monthly bond repayment')).toBeNull()
  fireEvent.change(screen.getByRole('combobox', { name: /^Will this property be sold/ }), { target: { value: 'no' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save item' }))
  expect(screen.getByText('1 Example Road')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await screen.findByRole('heading', { name: 'What do you own?' })
})
