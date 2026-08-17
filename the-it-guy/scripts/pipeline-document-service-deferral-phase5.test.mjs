import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const pipelinePath = path.resolve('src/pages/agency/AgencyPipelinePage.jsx')
const privateListingServicePath = path.resolve('src/services/privateListingService.js')
const packetStatusResolverPath = path.resolve('src/core/documents/packetStatusResolver.js')

const pipelineSource = fs.readFileSync(pipelinePath, 'utf8')
const privateListingSource = fs.readFileSync(privateListingServicePath, 'utf8')
const packetStatusSource = fs.readFileSync(packetStatusResolverPath, 'utf8')

assert.doesNotMatch(
  pipelineSource,
  /from\s+['"]\.\.\/\.\.\/core\/documents\/packetService['"]/,
  'AgencyPipelinePage should not statically import packetService',
)

assert.doesNotMatch(
  pipelineSource,
  /from\s+['"]\.\.\/\.\.\/lib\/documentPacketsApi['"]/,
  'AgencyPipelinePage should not statically import documentPacketsApi',
)

assert.match(
  pipelineSource,
  /import\(['"]\.\.\/\.\.\/core\/documents\/packetService['"]\)/,
  'AgencyPipelinePage should dynamically import packetService actions',
)

assert.match(
  pipelineSource,
  /import\(['"]\.\.\/\.\.\/lib\/documentPacketsApi['"]\)/,
  'AgencyPipelinePage should dynamically import document packet actions',
)

assert.doesNotMatch(
  privateListingSource,
  /from\s+['"]\.\.\/core\/documents\/packetService['"]/,
  'privateListingService should not statically import packetService',
)

assert.doesNotMatch(
  privateListingSource,
  /from\s+['"]\.\.\/lib\/documentPacketsApi['"]/,
  'privateListingService should not statically import documentPacketsApi',
)

assert.match(
  privateListingSource,
  /import\(['"]\.\.\/core\/documents\/packetService['"]\)/,
  'privateListingService should dynamically import packetService',
)

assert.match(
  privateListingSource,
  /import\(['"]\.\.\/lib\/documentPacketsApi['"]\)/,
  'privateListingService should dynamically import documentPacketsApi',
)

assert.doesNotMatch(
  packetStatusSource,
  /from\s+['"]\.\.\/\.\.\/lib\/documentPacketsApi['"]/,
  'packetStatusResolver should not statically import documentPacketsApi',
)

assert.match(
  packetStatusSource,
  /import\(['"]\.\.\/\.\.\/lib\/documentPacketsApi['"]\)/,
  'packetStatusResolver should dynamically import documentPacketsApi for async status resolution',
)

console.log('pipeline document service deferral phase 5 checks passed')
