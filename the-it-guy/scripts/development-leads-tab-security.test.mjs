import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const detailSource = readFileSync(resolve(root, 'src/pages/DevelopmentDetail.jsx'), 'utf8')
const apiSource = readFileSync(resolve(root, 'src/lib/api.js'), 'utf8')
const developmentTabsSource = detailSource.match(/const DEVELOPMENT_TABS = \[[\s\S]*?\n\]/)?.[0] || ''

assert.match(
  developmentTabsSource,
  /const DEVELOPMENT_TABS = \[\s*\{ id: 'overview', label: 'Overview' \},\s*\{ id: 'availability', label: 'Availability' \},\s*\{ id: 'leads', label: 'Leads' \},\s*\{ id: 'transactions', label: 'Transactions' \},\s*\{ id: 'performance', label: 'Performance' \},\s*\{ id: 'marketing', label: 'Marketing' \},\s*\{ id: 'snags', label: 'Snags' \},\s*\{ id: 'configuration', label: 'Configuration' \},?\s*\]/,
  'development tabs should be ordered as Overview, Availability, Leads, Transactions, Performance, Marketing, Snags, Configuration',
)

assert.ok(
  !developmentTabsSource.includes("{ id: 'documents', label: 'Documents' }"),
  'Documents should be removed from the development page menu',
)

assert.ok(
  !detailSource.includes("setActiveTab('documents')"),
  'development page shortcuts should not route users to the removed Documents tab',
)

assert.match(
  detailSource,
  /import\s*\{[^}]*\blistDeveloperLeadIntake\b[^}]*\}\s*from\s*'\.\.\/services\/developerLeadService'/,
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
  detailSource.includes('return Boolean(normalizeDevelopmentLeadText(lead.developerLeadId))'),
  'development lead navigation should use the developer lead workspace identifier',
)

assert.ok(
  detailSource.includes("navigate(`/developer/leads/${encodeURIComponent(lead.developerLeadId)}`)"),
  'development lead rows should click through to the developer lead module workspace',
)

assert.ok(
  detailSource.includes('function canViewDevelopmentLeadPrivateDetails') &&
    /assignedKeys\.some\(\(?key\)?\s*=>\s*accessKeys\.has\(key\)\)/.test(detailSource),
  'buyer private details should still require a current-user assigned agent match',
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
  detailSource.includes('Open developer lead') && detailSource.includes('Protected'),
  'lead rows should clearly distinguish openable leads from protected leads',
)

assert.ok(
  !detailSource.includes('{formatNumber(developmentLeadFunnelItems.total)} leads'),
  'the development lead total pill should be removed',
)
assert.ok(
  detailSource.includes('<DevelopmentLeadViewSwitch') &&
    detailSource.includes("developmentLeadView === 'kanban'") &&
    detailSource.includes("developmentLeadView === 'list'"),
  'development leads should offer mutually exclusive list and kanban views',
)
assert.ok(
  detailSource.includes('name: getDevelopmentLeadDisplayName(lead, canViewDetails)') &&
    detailSource.includes('contactLine: getDevelopmentLeadContactLine(lead, canViewDetails)') &&
    detailSource.includes('const contactLine = getDevelopmentLeadContactLine(lead, canViewDetails)'),
  'both views must use the assigned-agent privacy check for buyer contact details',
)
console.log('development leads tab security checks passed')
