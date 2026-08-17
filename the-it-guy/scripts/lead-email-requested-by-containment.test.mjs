import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const emailCaptureSource = await readFile(path.join(repoRoot, 'src/services/leadEmailCaptureService.js'), 'utf8')
assert.match(emailCaptureSource, /'requested by name'/)
assert.match(emailCaptureSource, /'requested by'/)
assert.match(emailCaptureSource, /function extractName[\s\S]*requested by[\s\S]*enquiry by/)
assert.match(emailCaptureSource, /function parseProperty24Email[\s\S]*requested by[\s\S]*customer name/)
assert.match(emailCaptureSource, /requestedByName/)

const agencyPageSource = await readFile(path.join(repoRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
assert.match(agencyPageSource, /function resolveLeadRequestedByName/)
assert.match(agencyPageSource, /requestedByName = resolveLeadRequestedByName\(lead\)/)
assert.match(agencyPageSource, /max-h-\[18rem\].*overflow-y-auto.*\[overflow-wrap:anywhere\]/s)

const activityWorkspaceSource = await readFile(path.join(repoRoot, 'src/components/lead-activity/LeadActivityWorkspace.jsx'), 'utf8')
assert.match(activityWorkspaceSource, /max-h-56.*overflow-y-auto.*\[overflow-wrap:anywhere\]/s)

console.log('lead email requested-by parsing and containment checks passed')
