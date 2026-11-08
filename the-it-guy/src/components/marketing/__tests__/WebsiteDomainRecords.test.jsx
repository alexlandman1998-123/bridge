// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { websiteDomainRecords } from '../websiteDomainRecords'
import { WebsiteDomainManager } from '../WebsiteWorkspace'
vi.mock('../../../services/websiteWorkspaceService',()=>({manageWebsiteDomain:vi.fn()}))
afterEach(cleanup)
const domain={id:'domain',hostname:'www.example.test',domain_kind:'custom',status:'pending',dns_instructions:{apexName:'example.test',verification:[{type:'TXT',domain:'_vercel.example.test',value:'owner-proof'}],configuration:{recommendedCNAME:[{rank:2,value:'secondary.vercel.test'},{rank:1,value:'primary.vercel.test'}],recommendedIPv4:[{rank:1,value:['192.0.2.1']}]}}}
it('shows exact ownership and preferred routing records in the domain connection screen',()=>{
 render(<WebsiteDomainManager siteId="site" domains={[domain]} onChanged={()=>{}}/> )
 const table=within(screen.getByRole('table',{name:'DNS records for www.example.test'}))
 expect(table.getByText('owner-proof')).toBeTruthy();expect(table.getByText('primary.vercel.test')).toBeTruthy()
 expect(table.queryByText('secondary.vercel.test')).toBeNull();expect(table.queryByText('192.0.2.1')).toBeNull()
})
it('uses provider A records for an apex without mixing a CNAME into the same hostname',()=>{
 const rows=websiteDomainRecords({...domain,hostname:'example.test'})
 expect(rows.some(row=>row.type==='A'&&row.value==='192.0.2.1')).toBe(true)
 expect(rows.some(row=>row.type==='CNAME')).toBe(false)
})
it('does not invent generic routing records when the provider has supplied none',()=>{
 expect(websiteDomainRecords({...domain,dns_instructions:{}})).toEqual([])
})
