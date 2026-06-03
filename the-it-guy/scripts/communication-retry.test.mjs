import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const serviceSource = await fs.readFile(new URL('../src/services/communicationDeliveryService.js', import.meta.url), 'utf8')

assert.match(serviceSource, /export async function retryCommunicationDelivery/)
assert.match(serviceSource, /Only failed communication deliveries can be retried/)
assert.match(serviceSource, /validateCommunicationSend/)
assert.match(serviceSource, /createCommunicationDelivery/)
assert.match(serviceSource, /status: 'prepared'/)
assert.doesNotMatch(serviceSource, /update\([^)]*original|overwrite original|deleteCommunicationDelivery/i)

const propertySharingSource = await fs.readFile(new URL('../src/services/leadPropertySharingService.js', import.meta.url), 'utf8')
assert.match(propertySharingSource, /prepareCommunicationDelivery/)
assert.match(propertySharingSource, /markCommunicationDeliverySent/)
assert.match(propertySharingSource, /markCommunicationDeliveryFailed/)
assert.match(propertySharingSource, /validateCommunicationSend/)

console.log('communication retry tests passed')
