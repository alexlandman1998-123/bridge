import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const pagePath = path.resolve('src/pages/agency/AgencyPipelinePage.jsx')
const source = fs.readFileSync(pagePath, 'utf8')

assert.doesNotMatch(
  source,
  /import\s+LegalDocumentWorkspace\s+from\s+['"]\.\.\/\.\.\/components\/documents\/LegalDocumentWorkspace['"]/,
  'AgencyPipelinePage should not statically import the heavy legal document workspace',
)

assert.doesNotMatch(
  source,
  /import\s+LeadActivityWorkspace\s+from\s+['"]\.\.\/\.\.\/components\/lead-activity\/LeadActivityWorkspace['"]/,
  'AgencyPipelinePage should not statically import the lead activity workspace',
)

assert.doesNotMatch(
  source,
  /import\s+KingstonsSellerAppointmentsWorkspace\s+from\s+['"]\.\.\/\.\.\/components\/appointments\/KingstonsSellerAppointmentsWorkspace['"]/,
  'AgencyPipelinePage should not statically import the seller appointments workspace',
)

assert.match(
  source,
  /import\s+\{\s*Suspense,[\s\S]*lazy,[\s\S]*\}\s+from\s+['"]react['"]/,
  'AgencyPipelinePage should import React lazy/Suspense for route-internal code splitting',
)

assert.match(
  source,
  /const LegalDocumentWorkspace = lazy\(\(\) => import\(['"]\.\.\/\.\.\/components\/documents\/LegalDocumentWorkspace['"]\)\)/,
  'LegalDocumentWorkspace should be loaded through a lazy dynamic import',
)

assert.match(
  source,
  /const LeadActivityWorkspace = lazy\(\(\) => import\(['"]\.\.\/\.\.\/components\/lead-activity\/LeadActivityWorkspace['"]\)\)/,
  'LeadActivityWorkspace should be loaded through a lazy dynamic import',
)

assert.match(
  source,
  /const KingstonsSellerAppointmentsWorkspace = lazy\(\(\) => import\(['"]\.\.\/\.\.\/components\/appointments\/KingstonsSellerAppointmentsWorkspace['"]\)\)/,
  'KingstonsSellerAppointmentsWorkspace should be loaded through a lazy dynamic import',
)

assert.match(
  source,
  /\{legalWorkspaceOpen \? \(\s*<Suspense/,
  'LegalDocumentWorkspace should only be requested when the legal workspace opens',
)

assert.match(
  source,
  /\{leadWorkspaceTab === 'activity' \? \(\s*<Suspense/,
  'LeadActivityWorkspace should only be requested when the activity tab opens',
)

assert.match(
  source,
  /selectedLeadIsSeller \? \(\s*<Suspense/,
  'KingstonsSellerAppointmentsWorkspace should only be requested for seller appointment tabs',
)

assert.match(
  source,
  /Loading legal document workspace/,
  'Lazy legal workspace loading should have an explicit fallback state',
)

assert.match(
  source,
  /Loading activity workspace/,
  'Lazy activity workspace loading should have an explicit fallback state',
)

assert.match(
  source,
  /Loading seller appointments workspace/,
  'Lazy seller appointments loading should have an explicit fallback state',
)

console.log('pipeline code splitting phase 3 checks passed')
