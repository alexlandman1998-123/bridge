import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'), repoRoot=path.resolve(appRoot,'..')
const migration=await readFile(path.join(repoRoot,'supabase/migrations/20260905102934_bond_application_portal_phase8_external_submission_record.sql'),'utf8')
const api=await readFile(path.join(appRoot,'src/lib/api.js'),'utf8')
assert.match(migration,/bond_application_external_submission_records/)
assert.match(migration,/bridge_record_bond_application_external_submission_phase8/)
assert.match(migration,/v_assessment\.status <> 'ready'/)
assert.match(migration,/automaticBankSubmission',false/)
assert.match(migration,/externalOnly',true/)
assert.match(api,/recordBondApplicationExternalSubmission/)
console.log('Bond application portal Phase 8 external-submission checks passed.')
