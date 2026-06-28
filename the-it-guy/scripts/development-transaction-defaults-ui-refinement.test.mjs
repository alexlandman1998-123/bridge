import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  modal: await readFile(new URL('../src/components/AddDevelopmentModal.jsx', import.meta.url), 'utf8'),
  api: await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
  wizard: await readFile(new URL('../src/components/NewTransactionWizard.jsx', import.meta.url), 'utf8'),
}

assert(files.modal.includes('Commercial Inputs') && files.modal.includes('Optional'), 'Commercial Inputs should be clearly marked optional.')

for (const removedSetupToken of [
  'reservationDepositTreatment',
  'defaultAlterationChargeTreatment',
  'Deposit Treatment',
  'Alteration Cost Treatment',
]) {
  assert(!files.modal.includes(removedSetupToken), `AddDevelopmentModal should not include ${removedSetupToken}.`)
}

for (const requiredModalToken of [
  'Deposit treatment and alteration cost treatment are set on each transaction',
  'pointer-events-none absolute left-4',
  'Default Agent',
  'Developer selling directly',
  'Multiple agents allowed',
  'defaultAgentSource',
  'multipleAgentsAllowed',
  'developerSellingDirectly',
]) {
  assert(files.modal.includes(requiredModalToken), `AddDevelopmentModal should include ${requiredModalToken}.`)
}

for (const requiredApiToken of [
  "defaultAgentSource: 'first_agent'",
  'multipleAgentsAllowed: true',
  'developerSellingDirectly: false',
  "source.defaultAgentSource || source.default_agent_source",
  "source.multipleAgentsAllowed",
  "source.developerSellingDirectly",
]) {
  assert(files.api.includes(requiredApiToken), `api.js should include ${requiredApiToken}.`)
}

for (const requiredWizardToken of [
  "roleType === 'agent'",
  'defaults.defaultAgentSource || defaults.default_agent_source',
  'developerSellingDirectly',
  'developmentDefaultAgent',
  'nextSetup.agentInvolved = true',
  'nextSetup.agentInvolved = false',
]) {
  assert(files.wizard.includes(requiredWizardToken), `NewTransactionWizard should include ${requiredWizardToken}.`)
}

assert(
  !files.wizard.includes('selectedDevelopment?.default_alteration_charge_treatment') &&
    !files.wizard.includes('selectedDevelopment?.reservation_deposit_treatment'),
  'NewTransactionWizard should not inherit deposit treatment or alteration treatment from development setup.',
)

console.log('Development transaction defaults UI refinement contract passed.')
