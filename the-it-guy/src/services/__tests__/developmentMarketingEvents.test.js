import { readDomainApiSource } from '../../../scripts/helpers/domainApiSource.mjs'
import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'

// Exercise the real API functions with an in-memory client; no events are written remotely.
const source = readFileSync(new URL('../../domains/developments/readApi.js', import.meta.url), 'utf8') + '\n' + readDomainApiSource()
function setup({ eventError = null, activityError = null } = {}) {
  const stored = []
  const filters = []
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'agent' } } }) },
    from(table) {
      let value
      const builder = {
        insert(payload) { value = payload; if (table === 'marketing_events' && !eventError) stored.push({ id: 'event-1', ...payload }); return builder },
        select() { return builder }, single() { return builder }, order() { return builder },
        eq(key, value) { filters.push([key, value]); return builder },
        then(resolve, reject) { return Promise.resolve(table === 'marketing_events' ? { data: value ? stored[0] : stored, error: eventError } : { error: activityError }).then(resolve, reject) },
      }
      return builder
    },
  }
  const names = ['normalizeDevelopmentMarketingEventRow', 'fetchDevelopmentMarketingEvents', 'createDevelopmentMarketingEvent']
  const code = names.map(name => {
    const signature = `${name.startsWith('normalize') ? 'function' : 'export async function'} ${name}(`
    const start = source.indexOf(signature)
    const declaration = source.indexOf('function ', start)
    const end = source.indexOf('\n}\n', start) + 2
    return source.slice(declaration, end).replace('function ', name.startsWith('normalize') ? 'function ' : 'async function ')
  }).join('\n')
  const warn = vi.fn()
  const functions = new Function('requireClient', 'normalizeTextValue', 'normalizeNullableText', 'isMissingTableError', 'isPermissionDeniedError', 'console', `${code}; return { createDevelopmentMarketingEvent, fetchDevelopmentMarketingEvents }`)(() => client, value => String(value ?? '').trim(), value => String(value ?? '').trim() || null, () => false, () => false, { warn })
  return { ...functions, stored, filters, warn }
}

it.each(['show_day', 'launch'])('saves and reloads the %s event in the same organisation and development', async eventType => {
  const api = setup()
  const result = await api.createDevelopmentMarketingEvent({ developmentId: 'dev', organisationId: 'org', title: 'Launch viewing', eventType, startsAt: '2026-11-15T10:00:00Z' })
  expect(result).toMatchObject({ id: 'event-1', eventType, createdBy: 'agent' })
  expect(api.stored[0]).toMatchObject({ organisation_id: 'org', subject_type: 'development', subject_id: 'dev', event_type: eventType })
  expect(await api.fetchDevelopmentMarketingEvents('dev', 'org')).toEqual([result])
  expect(api.filters).toEqual([['organisation_id', 'org'], ['subject_type', 'development'], ['subject_id', 'dev']])
})

it('returns a saved event when optional activity history fails, rather than inviting a duplicate', async () => {
  const api = setup({ activityError: new Error('History unavailable') })
  expect(await api.createDevelopmentMarketingEvent({ developmentId: 'dev', organisationId: 'org', title: 'Viewing', startsAt: '2026-11-15T10:00:00Z' })).toMatchObject({ id: 'event-1' })
  expect(api.stored).toHaveLength(1)
  expect(api.warn).toHaveBeenCalledTimes(1)
})

it('rejects invalid dates and failed event writes without reporting success', async () => {
  const api = setup({ eventError: new Error('Save denied') })
  await expect(api.createDevelopmentMarketingEvent({ developmentId: 'dev', organisationId: 'org', title: 'Viewing', startsAt: 'bad date' })).rejects.toThrow('date and time')
  await expect(api.createDevelopmentMarketingEvent({ developmentId: 'dev', organisationId: 'org', title: 'Viewing', startsAt: '2026-11-15T10:00:00Z' })).rejects.toThrow('Save denied')
  expect(api.stored).toHaveLength(0)
})
