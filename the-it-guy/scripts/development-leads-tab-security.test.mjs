import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const detailSource = readFileSync(resolve(root, 'src/pages/DevelopmentDetail.jsx'), 'utf8')
const apiSource = readFileSync(resolve(root, 'src/lib/api.js'), 'utf8')

assert.match(
  detailSource,
  /const DEVELOPMENT_TABS = \[\s*\{ id: 'overview', label: 'Overview' \},\s*\{ id: 'units', label: 'Units' \},\s*\{ id: 'leads', label: 'Leads' \},\s*\{ id: 'transactions', label: 'Transactions' \},\s*\{ id: 'performance', label: 'Performance' \},\s*\{ id: 'marketing', label: 'Marketing' \},\s*\{ id: 'configuration', label: 'Configuration' \},\s*\]/,
  'development tabs should be ordered as Overview, Units, Leads, Transactions, Performance, Marketing, Configuration',
)

assert.ok(
  !detailSource.includes("{ id: 'documents', label: 'Documents' }"),
  'Documents should be removed from the development page menu',
)

assert.ok(
  !detailSource.includes("setActiveTab('documents')"),
  'development page shortcuts should not route users to the removed Documents tab',
)

assert.ok(
  detailSource.includes("import { listDeveloperLeadIntake } from '../services/developerLeadService'"),
  'development leads should come from the existing developer lead intake service',
)

assert.ok(
  apiSource.includes('id, organisation_id, name, planned_units'),
  'development detail fetch should expose the owning developer organisation id for lead intake',
)

assert.ok(
  detailSource.includes('function developmentLeadBelongsToDevelopment'),
  'development lead filtering should check whether the intake lead belongs to this development',
)

assert.ok(
  detailSource.includes('data?.development?.organisation_id || data?.development?.organisationId'),
  'development leads should use the development owner workspace before falling back to the active workspace',
)

assert.ok(
  detailSource.includes('return Boolean(normalizeDevelopmentLeadText(lead.sourceLeadId) && assignedKeys.some((key) => accessKeys.has(key)))'),
  'buyer lead navigation should require a source lead and a current-user assigned agent match',
)

assert.ok(
  detailSource.includes("navigate(`/pipeline/leads/${encodeURIComponent(sourceLeadId)}`)"),
  'assigned agents should click through to the normal buyer lead module',
)

assert.ok(
  detailSource.includes("if (!canViewDetails) return 'Contact hidden'"),
  'non-receiving users should not see buyer contact details',
)

assert.ok(
  detailSource.includes("{activeTab === 'leads'"),
  'development detail page should render a Leads tab panel',
)

assert.ok(
  detailSource.includes('Open buyer lead') && detailSource.includes('Protected'),
  'lead rows should clearly distinguish openable leads from protected leads',
)

console.log('development leads tab security checks passed')
