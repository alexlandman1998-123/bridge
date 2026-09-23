#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const scriptDirectory = new URL('.', import.meta.url)
const defaultBaselineFile = fileURLToPath(new URL('../docs/kingdom-production-baseline.json', scriptDirectory))
const defaultOrigin = 'https://www.kingdomrealestate.co.za'
const routes = ['/', '/properties', '/valuation', '/about', '/contact', '/blog', '/areas', '/calculators', '/preapproval', '/robots.txt', '/sitemap.xml']

function usage() {
  console.log('Usage: node scripts/kingdom-production-baseline.mjs [--record] [--origin https://www.kingdomrealestate.co.za] [--baseline path]')
}

function argumentValue(argumentsList, flag) {
  const index = argumentsList.indexOf(flag)
  return index === -1 ? undefined : argumentsList[index + 1]
}

function normalizedOrigin(value) {
  const origin = new URL(value || defaultOrigin)
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Origin must be an HTTPS origin without a path, query, or fragment.')
  return origin.origin
}

function documentValue(document, pattern) {
  return (document.match(pattern)?.[1] || '').replace(/\s+/g, ' ').trim()
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function inspectHtml(body) {
  const navigation = [...body.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter((href) => href.startsWith('/') && !href.startsWith('//'))
    .filter((href, index, all) => all.indexOf(href) === index)
    .sort()
  return {
    title: documentValue(body, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description: documentValue(body, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i),
    canonical: documentValue(body, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["'][^>]*>/i),
    navigation,
    hasLeadForm: /<form\b/i.test(body) && /(?:email|phone|enquir|contact)/i.test(body),
  }
}

async function capture(origin) {
  const pages = {}
  for (const route of routes) {
    const response = await fetch(new URL(route, origin), { redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'Arch9-Kingdom-Baseline/1.0 (+read-only)' } })
    const body = await response.text()
    const html = response.headers.get('content-type')?.includes('text/html')
    pages[route] = {
      status: response.status,
      finalUrl: response.url,
      contentType: response.headers.get('content-type')?.split(';')[0] || '',
      ...(html ? inspectHtml(body) : { bodySha256: sha256(body) }),
    }
  }
  return { origin, routes: pages }
}

function compare(expected, actual) {
  const differences = []
  for (const route of routes) {
    const before = expected.routes?.[route]
    const after = actual.routes[route]
    if (!before) {
      differences.push(`${route}: missing from baseline`)
      continue
    }
    for (const key of ['status', 'finalUrl', 'contentType', 'title', 'description', 'canonical', 'hasLeadForm', 'bodySha256']) {
      if ((before[key] ?? null) !== (after[key] ?? null)) differences.push(`${route}: ${key} changed`)
    }
    if (JSON.stringify(before.navigation || []) !== JSON.stringify(after.navigation || [])) differences.push(`${route}: internal navigation changed`)
  }
  return differences
}

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  usage()
  process.exit(0)
}

try {
  const origin = normalizedOrigin(argumentValue(args, '--origin'))
  const baselineFile = argumentValue(args, '--baseline') || defaultBaselineFile
  const captured = await capture(origin)
  if (args.includes('--record')) {
    const baseline = { contract: 'arch9-kingdom-production-baseline-v1', recordedAt: new Date().toISOString(), ...captured }
    await writeFile(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`)
    console.log(`Recorded read-only Kingdom baseline: ${baselineFile}`)
    process.exit(0)
  }
  const baseline = JSON.parse(await readFile(baselineFile, 'utf8'))
  if (baseline.contract !== 'arch9-kingdom-production-baseline-v1') throw new Error('Baseline contract is not recognised.')
  if (baseline.origin !== origin) throw new Error(`Baseline origin ${baseline.origin} does not match requested origin ${origin}.`)
  const differences = compare(baseline, captured)
  if (differences.length) {
    console.error('Kingdom production baseline FAILED:')
    for (const difference of differences) console.error(`- ${difference}`)
    process.exit(1)
  }
  console.log(`Kingdom production baseline passed (${routes.length} read-only routes).`)
} catch (error) {
  console.error(`Kingdom production baseline could not complete: ${error.message}`)
  process.exit(1)
}
