import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sidebarSource = await readFile(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8')
const rolesSource = await readFile(new URL('../src/lib/roles.js', import.meta.url), 'utf8')

assert.ok(
  rolesSource.includes("key: 'agency_pipeline'") && rolesSource.includes("to: '/pipeline/leads'"),
  'Agent pipeline navigation should keep a default landing route.',
)
assert.ok(
  rolesSource.includes("key: 'pipeline_leads'") && rolesSource.includes("key: 'pipeline_calendar'"),
  'Agent pipeline navigation should keep children.',
)

assert.ok(
  sidebarSource.includes('to={item.to}'),
  'Sidebar parent menu labels should navigate to their default route.',
)
assert.ok(
  sidebarSource.includes('[item.key]: true'),
  'Clicking a parent menu label should keep its submenu expanded while navigating.',
)
assert.ok(
  sidebarSource.includes("aria-label={`${menuExpanded ? 'Collapse' : 'Expand'} ${item.label} menu`}"),
  'Parent menu chevron should remain an explicit expand/collapse control.',
)

console.log('sidebar parent navigation checks passed')
