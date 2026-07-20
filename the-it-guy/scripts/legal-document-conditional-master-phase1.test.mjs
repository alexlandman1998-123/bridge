import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packetService = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const settingsEditor = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const adr = await readFile(new URL('../docs/architecture/adr-002-conditional-master-legal-documents.md', import.meta.url), 'utf8')

const resolverStart = packetService.indexOf('async function resolveTemplateForPacket')
const resolverEnd = packetService.indexOf('function shouldUseNativeGeneration', resolverStart)
const resolverSource = packetService.slice(resolverStart, resolverEnd)

assert.ok(resolverStart > -1 && resolverEnd > resolverStart, 'Standard packet template resolver should exist.')
assert.match(resolverSource, /resolveActivePacketTemplate\(\{/)
assert.doesNotMatch(resolverSource, /resolveMandateScenarioTemplateForPacket\(/)
assert.doesNotMatch(resolverSource, /resolveOtpScenarioTemplateForPacket\(/)

const publicResolverStart = packetService.indexOf('export async function resolveActiveTemplate')
const publicResolverEnd = packetService.indexOf('export async function listPackets', publicResolverStart)
const publicResolverSource = packetService.slice(publicResolverStart, publicResolverEnd)

assert.match(publicResolverSource, /return resolveActivePacketTemplate\(\{/)
assert.doesNotMatch(publicResolverSource, /resolveMandateScenarioTemplateForPacket\(/)
assert.doesNotMatch(publicResolverSource, /resolveOtpScenarioTemplateForPacket\(/)

assert.match(packetService, /const routeKey = 'default'/)
assert.match(packetService, /mandateTemplateLaunchReadiness: null/)
assert.match(settingsEditor, /const LEGACY_SCENARIO_TEMPLATE_ROUTING_UI_ENABLED = false/)
assert.match(settingsEditor, /Conditional master document/)
assert.match(settingsEditor, /One conditional master/)
assert.match(adr, /Scenario facts select conditional sections inside the active master revision/)
assert.match(adr, /They do not select another template/)

console.log('Conditional master legal documents Phase 1 contract passed.')
