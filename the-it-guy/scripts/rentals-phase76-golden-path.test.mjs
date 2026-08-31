import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { evaluateRentalGoldenPathAcceptance, RENTAL_GOLDEN_PATH_STEPS } from '../src/services/rentals/rentalGoldenPathAcceptance.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const app = await read('src/App.jsx')
const domain = await read('src/services/rentals/rentalDomainContract.js')
const moveOut = await read('../supabase/migrations/20260831101508_rental_move_out_workflow.sql')
const closure = await read('../supabase/migrations/20260831101838_rental_tenancy_closure_and_vacancy.sql')
const screening = await read('../supabase/migrations/20260831102441_rental_screening_operations.sql')
const rollout = await read('../supabase/migrations/20260831103147_rental_controlled_rollout_cohorts.sql')

for (const route of ['/agent/rentals/portfolio/properties', '/agent/rentals/vacancies', '/agent/rentals/applications', '/agent/rentals/tenancies', '/agent/rentals/maintenance', '/agent/rentals/inspections']) assert.ok(app.includes(route), `Missing golden-path route: ${route}`)
for (const command of ['create_vacancy', 'submit_rental_application', 'approve_rental_application', 'create_tenancy_from_application', 'activate_tenancy', 'close_tenancy_and_create_vacancy']) assert.ok(domain.includes(command), `Missing lifecycle command: ${command}`)
for (const token of ['rental_start_move_out_workflow', 'rental_record_move_out_checklist_item']) assert.ok(moveOut.includes(token), `Missing move-out control: ${token}`)
for (const token of ['rental_close_tenancy', 'p_create_vacancy']) assert.ok(closure.includes(token), `Missing closure control: ${token}`)
for (const token of ['rental_create_screening_case', 'automatic_decision']) assert.ok(screening.includes(token), `Missing human screening guard: ${token}`)
for (const token of ['rental_set_rollout_control', 'environment_flag_required']) assert.ok(rollout.includes(token), `Missing rollout guard: ${token}`)

const blocked = evaluateRentalGoldenPathAcceptance({ portfolio: true })
assert.equal(blocked.status, 'not_ready')
assert.ok(blocked.blockers.includes('exit'))
const accepted = evaluateRentalGoldenPathAcceptance(Object.fromEntries(RENTAL_GOLDEN_PATH_STEPS.map(({ key }) => [key, true])))
assert.equal(accepted.status, 'ready_for_pilot_review')
assert.equal(accepted.blockers.length, 0)
assert.match(accepted.guardrail, /Sales/)
console.log('Rentals Phase 76 golden-path acceptance checks passed.')
