import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const controller = readFileSync(resolve(root, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const leadListPage = readFileSync(resolve(root, 'src/pages/agency/LeadListPage.jsx'), 'utf8')

assert.match(
  controller,
  /const LeadListPage = lazy\(\(\) => import\('\.\/LeadListPage'\)\)/,
  'the lead list should load through a dedicated lazy boundary',
)
assert.match(
  controller,
  /const shouldRenderLeadListPage = !isCalendarMode && !isLeadWorkspaceRoute/,
  'the extracted list should only render for the list route',
)
assert.match(
  controller,
  /const LEGACY_LEAD_LIST_RENDER_ENABLED = false/,
  'the legacy inline list must remain disabled during the compatibility window',
)
assert.match(controller, /<LeadListPage[\s\S]*?rows=\{leadListPageRows\}/)
assert.match(controller, /<LeadListPage[\s\S]*?kanbanColumns=\{leadListKanbanColumns\}/)
assert.match(controller, /<LeadListPage[\s\S]*?onFiltersChange=/)
assert.match(controller, /<LeadListPage[\s\S]*?onMoveLead=/)
assert.match(controller, /<LeadListPage[\s\S]*?onArchiveLead=/)
assert.match(controller, /<LeadListPage[\s\S]*?onDeleteLead=/)

assert.match(leadListPage, /data-testid="agency-lead-list-page"/)
assert.match(leadListPage, /id="agency-lead-filters"/)
assert.match(leadListPage, /viewMode === 'kanban'/)
assert.match(leadListPage, /role="tablist"/)
assert.match(leadListPage, /onDragStart=/)
assert.match(leadListPage, /onDrop=/)
assert.match(leadListPage, /onPageChange\(currentPage - 1\)/)
assert.match(leadListPage, /onPageChange\(currentPage \+ 1\)/)

console.log('seller leads list extraction phase 2 checks passed')
