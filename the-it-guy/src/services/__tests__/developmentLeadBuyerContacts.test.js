import { createClient } from '@supabase/supabase-js'
import { expect, it } from 'vitest'
import { enrichDevelopmentLeadBuyerContacts } from '../developmentBuyerLeadService.js'

const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
it('uses the shared CRM buyer identity while retaining protection for other agencies', async () => {
  const requests = []
  const client = createClient('http://localhost:55555', 'local-fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => {
      const url = new URL(String(input)); requests.push(url)
      const data = url.pathname.endsWith('/leads') ? [{ lead_id: id(2), contact_id: id(3) }]
        : [{ contact_id: id(3), first_name: 'Naledi', last_name: 'Buyer', email: 'buyer@example.test', phone: '0700000000' }]
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
    } },
  })
  const own = { developerOrgId: id(1), leadOwner: 'developer', sourceLeadId: id(2), buyerFullName: 'Old summary' }
  const foreign = { ...own, leadOwner: 'agency', sourceAgencyOrgId: id(9), buyerFullName: 'Protected buyer' }
  const result = await enrichDevelopmentLeadBuyerContacts(id(1), [own, foreign], { client })
  expect(result[0]).toMatchObject({ buyerFullName: 'Naledi Buyer', buyerEmail: 'buyer@example.test' })
  expect(result[1]).toBe(foreign)
  expect(requests).toHaveLength(2)
  expect(requests.every(url => url.searchParams.get('organisation_id') === `eq.${id(1)}`)).toBe(true)
  requests.length = 0
  expect(await enrichDevelopmentLeadBuyerContacts(id(1), [foreign], { client })).toEqual([foreign])
  expect(requests).toHaveLength(0)
})


it('recovers only the active agency’s own masked buyer links', async () => {
  const requests = []
  const client = createClient('http://localhost:55555', 'local-fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => {
      const url = new URL(String(input)); requests.push(url)
      const table = url.pathname.split('/').pop()
      const data = table === 'developer_leads' ? [{ developer_lead_id: id(5), source_lead_id: id(2) }]
        : table === 'leads' ? [{ lead_id: id(2), contact_id: id(3) }]
        : [{ contact_id: id(3), first_name: 'Mila', last_name: 'Buyer', email: '', phone: '0700000000' }]
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
    } },
  })
  const own = { developerLeadId: id(5), developerOrgId: id(8), leadOwner: 'agency', sourceAgencyOrgId: id(1), buyerFullName: 'Protected buyer' }
  const foreign = { ...own, developerLeadId: id(6), sourceAgencyOrgId: id(9) }
  const result = await enrichDevelopmentLeadBuyerContacts(id(1), [own, foreign], { client })
  expect(result[0]).toMatchObject({ sourceLeadId: id(2), buyerFullName: 'Mila Buyer', buyerEmail: '' })
  expect(result[1]).toBe(foreign)
  expect(requests).toHaveLength(3)
  expect(requests[0].searchParams.get('source_agency_org_id')).toBe(`eq.${id(1)}`)
  expect(requests[0].searchParams.get('developer_lead_id')).toBe(`in.(${id(5)})`)
  expect(requests.slice(1).every(url => url.searchParams.get('organisation_id') === `eq.${id(1)}`)).toBe(true)
})
