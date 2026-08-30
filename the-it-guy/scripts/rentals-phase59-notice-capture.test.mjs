import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const migration = await read('../supabase/migrations/20260830114155_rental_notice_capture.sql')
const repository = await read('src/services/rentals/rentalNoticeRepository.js')
const staffPage = await read('src/pages/rentals/RentalNoticeWorkspacePage.jsx')
const tenantPage = await read('src/pages/rentals/RentalTenantPortalActionsPage.jsx')
const app = await read('src/App.jsx')

for (const value of ['create table public.rental_notices', 'enable row level security', 'create policy rental_notices_read', 'rental_capture_notice', 'rental_submit_portal_notice', 'rental_acknowledge_notice', 'rental_withdraw_notice', 'rental_get_tenancy_notice_status', "status='acknowledged'", "'notice_given',found", 'revoke all on function']) assert.ok(migration.includes(value), `missing ${value}`)
for (const value of ['listRentalNotices', 'captureRentalNotice', 'submitRentalPortalNotice', 'acknowledgeRentalNotice', 'withdrawRentalNotice', 'getRentalTenancyNoticeStatus']) assert.ok(repository.includes(value), `missing repository ${value}`)
for (const value of ['Notice Given', 'Capture notice', 'Acknowledge', 'Withdrawal reason', 'Recording or acknowledging a notice does not end the tenancy']) assert.ok(staffPage.includes(value), `missing staff notice control ${value}`)
for (const value of ['submitRentalTenantNotice', 'Notice submitted. The Rentals team must acknowledge it', 'Evidence link', 'Effective date']) assert.ok(tenantPage.includes(value), `missing tenant notice capture ${value}`)
assert.ok(app.includes('/agent/rentals/tenancies/:tenancyId/notice'), 'missing staff notice route')
console.log('Rentals Phase 59 notice capture checks passed.')
