// @vitest-environment node
import { expect, it } from 'vitest'
import { createObservedSupabaseFetch, createOpeningRequestTrace, databaseTiming } from '../openingRequestTrace.js'

it('measures consumed UTF-8 response bytes, database timing and usable time without changing responses', async () => {
  let time = 10
  const samples = []
  const collector = createOpeningRequestTrace({ now: () => time, onReport: sample => samples.push(sample) })
  collector.begin('/documents', { startedAt: 0 })
  const json = JSON.stringify({ name: 'Café 🏡' })
  const fetch = createObservedSupabaseFetch({ collector, getPath: () => '/documents', fetchImpl: async () => {
    time = 25
    return new Response(json, { headers: { 'server-timing': 'parse;dur=1, transaction;dur=3.5' } })
  } })
  const response = await fetch('https://fixture.local/rest/v1/units?select=id')
  expect(response instanceof Response).toBe(true)
  expect(await response.json()).toEqual({ name: 'Café 🏡' })
  expect(response.bodyUsed).toBe(true)
  time = 60
  collector.usable('/documents')
  expect(samples.at(-1)).toMatchObject({ usableMs: 60, requestCount: 1, databaseTransactionMs: 3.5,
    responseBodyBytes: new TextEncoder().encode(json).length, databaseTimingMeasuredCount: 1 })
  expect(samples.at(-1).requests[0]).toMatchObject({ headersMs: 15, totalMs: 15 })
})

it('distinguishes different projections, filters, pages, credentials and methods; does not persist them', async () => {
  const collector = createOpeningRequestTrace()
  const fetch = createObservedSupabaseFetch({ collector, getPath: () => '/pipeline/leads/private-lead', fetchImpl: async () => new Response('[]') })
  const url = 'https://fixture.local/rest/v1/leads?select=id&email=eq.private@example.test'
  for (const [target, init] of [[url, { headers: { authorization: 'Bearer secret-a' } }],
    [url, { headers: { authorization: 'Bearer secret-a' } }],
    [url + '&offset=25', { headers: { authorization: 'Bearer secret-a' } }],
    [url.replace('select=id', 'select=name'), { headers: { authorization: 'Bearer secret-a' } }],
    [url, { headers: { authorization: 'Bearer secret-b' } }], [url, { headers: { authorization: 'Bearer secret-a', 'x-bridge-client-portal-token': 'private-capability' } }], [url, { method: 'POST' }]]) {
    await (await fetch(target, init)).text()
  }
  const report = collector.report()
  expect(report.duplicateRequestCount).toBe(1)
  expect(report.databaseTransactionMs).toBeNull()
  expect(report.databaseTimingMeasuredCount).toBe(0)
  const exported = JSON.stringify(report)
  for (const privateValue of ['private-lead', 'private@example.test', 'secret-a', 'secret-b', 'private-capability', 'select=']) expect(exported).not.toContain(privateValue)
})

it('keeps unavailable/unread sizes unknown and preserves abort and HTTP failure behavior', async () => {
  const collector = createOpeningRequestTrace()
  const fetch = createObservedSupabaseFetch({ collector, getPath: () => '/documents', fetchImpl: async () => new Response('Denied', { status: 403 }) })
  const response = await fetch('https://fixture.local/rest/v1/units')
  expect(collector.report().responseSizeMeasuredCount).toBe(0)
  expect(collector.report().requests[0].responseBodyBytes).toBeNull()
  expect(response.status).toBe(403)
  expect(await response.text()).toBe('Denied')
  expect(collector.report().requests[0].failed).toBe(true)
  const error = new DOMException('Cancelled', 'AbortError')
  const aborted = createObservedSupabaseFetch({ collector, getPath: () => '/documents', fetchImpl: async () => { throw error } })
  await expect(aborted('https://fixture.local/rest/v1/contacts')).rejects.toBe(error)
  expect(collector.report().requests.at(-1).failed).toBe(true)
  expect(databaseTiming('jwt;dur=20, response;dur=7')).toBeNull()
})

it('retains early requests when the router supplies the timing origin and stops counting after usable', async () => {
  const collector = createOpeningRequestTrace({ now: () => 50 })
  const fetch = createObservedSupabaseFetch({ collector, getPath: () => '/documents', fetchImpl: async () => new Response('[]') })
  await (await fetch('https://fixture.local/rest/v1/units')).text()
  collector.begin('/documents', { startedAt: 0, timingOrigin: 'navigation_start' })
  collector.usable('/documents')
  await (await fetch('https://fixture.local/rest/v1/units')).text()
  expect(collector.report()).toMatchObject({ usableMs: 50, requestCount: 1, timingOrigin: 'navigation_start' })
})

it('bounds retained request details while reporting when measurements were truncated', async () => {
  const collector = createOpeningRequestTrace()
  const fetch = createObservedSupabaseFetch({ collector, getPath: () => '/documents', fetchImpl: async () => new Response('[]') })
  for (let i = 0; i < 151; i++) await fetch(`https://fixture.local/rest/v1/units?id=eq.${i}`)
  expect(collector.report()).toMatchObject({ requestCount: 151, droppedRequestCount: 1, responseSizeMeasuredCount: 0 })
  expect(collector.report().requests).toHaveLength(150)
})
