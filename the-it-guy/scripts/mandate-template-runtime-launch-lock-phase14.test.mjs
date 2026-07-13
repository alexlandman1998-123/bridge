import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  MANDATE_TEMPLATE_LAUNCH_READINESS_VERSION,
  buildMandateTemplateRuntimeLaunchReadiness,
} from '../src/core/documents/mandateTemplateLaunchReadiness.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-runtime-launch-lock-phase14'],
  'node scripts/mandate-template-runtime-launch-lock-phase14.test.mjs',
  'package.json should expose the mandate template runtime launch lock Phase 14 contract.',
)

function validation(action = 'preview') {
  return {
    packetType: 'mandate',
    validationAction: action,
    mandateTemplateVariant: 'company_full_title',
    placeholders: {
      mandate_template_variant: 'company_full_title',
    },
  }
}

const defaultTemplate = {
  id: 'mandate-default-live',
  template_key: 'mandate_default',
  template_label: 'Default Mandate',
}

const routeTemplate = {
  id: 'mandate-company-full-title-live',
  template_key: 'mandate_company_full_title',
  template_label: 'Company Full Title Mandate',
}

const previewFallback = buildMandateTemplateRuntimeLaunchReadiness(validation('preview'), {
  source: 'mandate_scenario_fallback',
  packetType: 'mandate',
  template: defaultTemplate,
  mandateScenarioProfile: {
    templateVariant: 'company_full_title',
  },
  mandateTemplateRouting: {
    mandateTemplateVariant: 'company_full_title',
  },
})
assert.equal(previewFallback.readinessVersion, MANDATE_TEMPLATE_LAUNCH_READINESS_VERSION)
assert.equal(previewFallback.status, 'attention')
assert.equal(previewFallback.shouldBlockGeneration, false)
assert.equal(previewFallback.canGenerateWithoutFallback, false)
assert.ok(previewFallback.warnings.some((issue) => issue.code === 'MANDATE_LAUNCH_RUNTIME_ROUTE_FALLBACK'))

const generateFallback = buildMandateTemplateRuntimeLaunchReadiness(validation('generate'), {
  source: 'mandate_scenario_fallback',
  packetType: 'mandate',
  template: defaultTemplate,
  mandateScenarioProfile: {
    templateVariant: 'company_full_title',
  },
  mandateTemplateRouting: {
    mandateTemplateVariant: 'company_full_title',
  },
})
assert.equal(generateFallback.status, 'blocked')
assert.equal(generateFallback.shouldBlockGeneration, true)
assert.equal(generateFallback.canGenerateWithoutFallback, false)
assert.ok(generateFallback.blockers.some((issue) => issue.code === 'MANDATE_LAUNCH_RUNTIME_ROUTE_FALLBACK'))
assert.ok(generateFallback.blockerMessages.some((message) => message.includes('Publish the route-specific mandate template')))

const exactRoute = buildMandateTemplateRuntimeLaunchReadiness(validation('generate'), {
  source: 'mandate_scenario_variant',
  packetType: 'mandate',
  template: routeTemplate,
  mandateScenarioProfile: {
    templateVariant: 'company_full_title',
  },
  mandateTemplateRouting: {
    mandateTemplateVariant: 'company_full_title',
  },
})
assert.equal(exactRoute.status, 'ready')
assert.equal(exactRoute.shouldBlockGeneration, false)
assert.equal(exactRoute.canGenerateWithoutFallback, true)
assert.equal(exactRoute.blockers.length, 0)

const missingTemplate = buildMandateTemplateRuntimeLaunchReadiness(validation('generate'), {
  source: 'none',
  packetType: 'mandate',
  template: null,
  mandateScenarioProfile: {
    templateVariant: 'company_full_title',
  },
})
assert.equal(missingTemplate.status, 'blocked')
assert.ok(missingTemplate.blockers.some((issue) => issue.code === 'MANDATE_LAUNCH_RUNTIME_TEMPLATE_MISSING'))

const launchReadinessSource = await readFile(new URL('../src/core/documents/mandateTemplateLaunchReadiness.js', import.meta.url), 'utf8')
for (const token of [
  'buildMandateTemplateRuntimeLaunchReadiness',
  'MANDATE_LAUNCH_RUNTIME_ROUTE_FALLBACK',
  'MANDATE_LAUNCH_RUNTIME_TEMPLATE_MISSING',
  'shouldBlockGeneration',
  'canGenerateWithoutFallback',
]) {
  assert.ok(launchReadinessSource.includes(token), `Launch readiness source should include runtime token ${token}.`)
}

const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
for (const token of [
  'buildMandateTemplateRuntimeLaunchReadiness',
  'formatMandateTemplateLaunchReadinessIssue',
  'mapMandateTemplateLaunchReadinessIssue',
  "source: 'mandate_template_launch_readiness'",
  'mandateTemplateLaunchReadiness',
  "const hasMandateTemplateLaunchReadinessBlockingIssues = (validation.critical || []).some((issue) => issue?.source === 'mandate_template_launch_readiness')",
  'MANDATE_TEMPLATE_LAUNCH_READINESS_BLOCKED',
  'Mandate template launch readiness is blocked. Publish the correct route template before generation.',
]) {
  assert.ok(packetServiceSource.includes(token), `packetService should include runtime launch lock token ${token}.`)
}

const launchReadinessIndex = packetServiceSource.indexOf('const launchReadiness = buildMandateTemplateRuntimeLaunchReadiness(validation, templateResolution')
const launchBlockerIndex = packetServiceSource.indexOf('const launchReadinessBlockers =', launchReadinessIndex)
const criticalIndex = packetServiceSource.indexOf('...launchReadinessBlockers', launchBlockerIndex)
const bypassIndex = packetServiceSource.indexOf('hasMandateTemplateLaunchReadinessBlockingIssues')
const errorIndex = packetServiceSource.indexOf('MANDATE_TEMPLATE_LAUNCH_READINESS_BLOCKED')
assert.ok(launchReadinessIndex > -1 && launchBlockerIndex > launchReadinessIndex, 'Runtime launch readiness should be evaluated after template resolution.')
assert.ok(criticalIndex > launchBlockerIndex, 'Runtime launch readiness blockers should be added to validation critical issues.')
assert.ok(bypassIndex > criticalIndex, 'Generation bypass should evaluate runtime launch readiness blockers.')
assert.ok(errorIndex > bypassIndex, 'Runtime launch readiness failures should throw a specific generation error.')

console.log('Mandate template runtime launch lock Phase 14 contract passed.')
