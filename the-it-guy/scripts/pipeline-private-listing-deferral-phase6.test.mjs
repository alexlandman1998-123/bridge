import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const pipelinePath = path.resolve('src/pages/agency/AgencyPipelinePage.jsx')
const buyerLifecyclePath = path.resolve('src/lib/buyerLifecycleService.js')

const pipelineSource = fs.readFileSync(pipelinePath, 'utf8')
const buyerLifecycleSource = fs.readFileSync(buyerLifecyclePath, 'utf8')

assert.doesNotMatch(
  pipelineSource,
  /from\s+['"]\.\.\/\.\.\/services\/privateListingService['"]/,
  'AgencyPipelinePage should not statically import privateListingService',
)

assert.doesNotMatch(
  pipelineSource,
  /from\s+['"]\.\.\/\.\.\/services\/sellerPortalActivationService['"]/,
  'AgencyPipelinePage should not statically import sellerPortalActivationService',
)

assert.doesNotMatch(
  pipelineSource,
  /from\s+['"]\.\.\/\.\.\/services\/leadEmailCaptureService['"]/,
  'AgencyPipelinePage should not statically import leadEmailCaptureService',
)

assert.match(
  pipelineSource,
  /import\(['"]\.\.\/\.\.\/services\/privateListingService['"]\)/,
  'AgencyPipelinePage should dynamically import privateListingService actions',
)

assert.match(
  pipelineSource,
  /import\(['"]\.\.\/\.\.\/services\/sellerPortalActivationService['"]\)/,
  'AgencyPipelinePage should dynamically import seller portal activation actions',
)

assert.match(
  pipelineSource,
  /import\(['"]\.\.\/\.\.\/services\/leadEmailCaptureService['"]\)/,
  'AgencyPipelinePage should dynamically import lead email capture actions',
)

assert.doesNotMatch(
  buyerLifecycleSource,
  /from\s+['"]\.\.\/services\/privateListingService\.js['"]/,
  'buyerLifecycleService should not statically import privateListingService',
)

assert.match(
  buyerLifecycleSource,
  /import\(['"]\.\.\/services\/privateListingService\.js['"]\)/,
  'buyerLifecycleService should dynamically import privateListingService when marking listings under offer',
)

console.log('pipeline private listing deferral phase 6 checks passed')
