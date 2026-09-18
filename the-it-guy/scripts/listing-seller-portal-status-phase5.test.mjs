import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [edge, detail] = await Promise.all([
  readFile(new URL('../../supabase/functions/listing-mandate-signing/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
])

assert.match(edge, /portalInvitations: invitations \|\| \[\]/)
assert.match(edge, /portalTaskPlan: snapshot\(taskPlan\)/)
assert.match(detail, /Seller Portal status/)
assert.match(detail, /portalSignerRows/)
assert.match(detail, /Outstanding portal documents/)

console.log('listing seller portal status phase 5 checks passed.')
