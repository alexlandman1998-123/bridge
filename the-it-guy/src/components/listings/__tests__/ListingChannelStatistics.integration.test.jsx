// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import ListingChannelStatistics from '../ListingChannelStatistics'
import { createListingStatisticsDatabase, seedStatisticsThroughRetrieval, statisticsFixtureIds } from '../../../../server/tests/fixtures/listingStatisticsDatabase.js'
import { syncPrivatePropertyStatistics } from '../../../../server/services/privatePropertyStatisticsService.js'

const runtime = vi.hoisted(() => ({client:null}))
vi.mock('../../../lib/supabaseClient.js',()=>({isSupabaseConfigured:true,supabase:{rpc:(...args)=>runtime.client.rpc(...args)}}))
const {org,otherOrg,listing,otherListing} = statisticsFixtureIds
const props = {organisationId:org,listingId:listing}
let db, retrieval
beforeAll(async()=>{
  db=await createListingStatisticsDatabase()
  retrieval=await seedStatisticsThroughRetrieval(db)
  runtime.client=retrieval.client
},30_000)
afterEach(cleanup)
afterAll(async()=>db?.close())
const card=(name)=>within(screen.getByRole('article',{name:`${name} statistics`}))

it('renders retrieved, persisted and authenticated SQL totals for all three periods',async()=>{
  render(<ListingChannelStatistics {...props}/>)
  for(const days of [30,7,90]) {
    fireEvent.click(screen.getByRole('radio',{name:`${days} days`}))
    await card('Property24').findByText(String(days*2))
    expect(card('Private Property').getByText(String(days*3))).toBeTruthy()
    expect(card('Private Property').getByText(`${days} of ${days} days covered`)).toBeTruthy()
    expect(card('Website').getByText('9')).toBeTruthy()
    expect(card('Website').getByText('Website enquiries').nextElementSibling.textContent).toBe('1')
    expect(card('Private Property').getByLabelText('Phone contacts unavailable').textContent).toBe('—')
    expect(card('Property24').getByText('SMS contacts').nextElementSibling.textContent).toBe('0')
  }
},15_000)
it('keeps persisted totals on supplier delay/failure and repeated upserts',async()=>{
  const original = (await db.query('select count(*)::int as n from private_property_listing_statistics_daily')).rows[0].n
  const now=new Date(retrieval.now.getTime()+61*60*1000)
  const pull=()=>syncPrivatePropertyStatistics({...retrieval,config:retrieval.config,now,days:7,maxRequests:2})
  await pull()
  expect((await db.query('select count(*)::int as n from private_property_listing_statistics_daily')).rows[0].n).toBe(original)
  await db.exec('truncate private_property_statistics_attempts')
  retrieval.supplier.pending=true
  expect(await pull()).toMatchObject({status:'partial',storedCount:0,pendingCount:2})
  await db.exec('truncate private_property_statistics_attempts')
  retrieval.supplier.pending=false; retrieval.supplier.failed=true
  await expect(pull()).rejects.toThrow()
  render(<ListingChannelStatistics {...props}/>)
  await card('Private Property').findByText('90')
  expect(card('Private Property').getByText('Latest sync failed. Showing saved counts.')).toBeTruthy()
},15_000)
it('renders withdrawal history and clears it when ownership changes',async()=>{
  await db.exec("update property24_listing_syncs set is_on_portal=false; update private_property_listing_syncs set is_on_portal=false; update website_listing_publications set status='withdrawn'")
  const rendered=render(<ListingChannelStatistics {...props}/>)
  await card('Property24').findByText('60')
  expect(screen.getAllByText('Currently not published · Historical activity')).toHaveLength(3)
  rendered.rerender(<ListingChannelStatistics organisationId={otherOrg} listingId={otherListing}/>)
  await screen.findByText('Channel statistics could not be loaded.')
  expect(card('Property24').queryByText('60')).toBeNull()
  expect(card('Private Property').queryByText('90')).toBeNull()
  expect(card('Website').queryByText('9')).toBeNull()
})
it('shows a missing stored day as partial and excludes activity from today',async()=>{
  await db.query('delete from private_property_listing_statistics_daily where statistic_date=$1',[retrieval.window.endDate])
  await db.query(`insert into property24_listing_statistics_daily(organisation_id,private_listing_id,environment,statistic_date,view_count)
    values($1,$2,'production',(now() at time zone 'Africa/Johannesburg')::date,999)`,[org,listing])
  render(<ListingChannelStatistics {...props}/>)
  await card('Property24').findByText('60')
  expect(card('Private Property').getByText('87')).toBeTruthy()
  expect(card('Private Property').getByText('29 of 30 days covered · Partial count')).toBeTruthy()
  expect(card('Private Property').getByText('Partial data')).toBeTruthy()
  fireEvent.click(screen.getByRole('radio',{name:'7 days'}))
  await card('Private Property').findByText('18')
  expect(card('Property24').getByText('14')).toBeTruthy()
  expect(card('Private Property').getByText('6 of 7 days covered · Partial count')).toBeTruthy()
},15_000)
