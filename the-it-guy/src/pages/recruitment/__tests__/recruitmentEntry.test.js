import { expect, it } from 'vitest'
import { recruitmentEntryContext, recruitmentNextAction, recruitmentReturnTo, recruitmentStartLocation } from '../recruitmentEntryModel'

it('carries branch and source between pages and rejects a different receiving agency', () => {
  const route = recruitmentStartLocation({entryPoint:'branch',organisationId:'agency',branchId:'branch-one',returnTo:'/agency/branches/branch-one/staff'})
  expect(route.pathname).toBe('/agency/recruitment/new')
  expect(recruitmentEntryContext(route.state,'agency')).toEqual({entryPoint:'branch',branchId:'branch-one',returnTo:'/agency/branches/branch-one/staff',error:''})
  expect(recruitmentEntryContext(route.state,'another').error).toMatch(/Switch to the agency/)
  expect(recruitmentEntryContext(null,'agency').entryPoint).toBe('recruitment')
  expect(recruitmentReturnTo('https://foreign.test')).toBe('/agency/recruitment')
  expect(recruitmentReturnTo('//foreign.test/agency/agents')).toBe('/agency/recruitment')
})
it('shows the next recruitment step separately from pending workspace acceptance', () => {
  expect(recruitmentNextAction({status:'lead_received'})).toBe('Invite to apply')
  expect(recruitmentNextAction({status:'application_submitted'})).toBe('Start application review')
  expect(recruitmentNextAction({status:'contract_signed'})).toBe('Complete onboarding')
  expect(recruitmentNextAction({status:'onboarding_complete',activation_state:'awaiting_acceptance'})).toBe('Await access acceptance')
})
it('preserves Settings and Commercial choices and only returns to known internal entry pages',()=>{
 for(const [entryPoint,returnTo] of [['settings_users','/settings/users'],['commercial_brokers','/commercial/brokers'],['agency_setup','/setup']]) {
  const route=recruitmentStartLocation({entryPoint,returnTo,organisationId:'agency',joiningRole:'commercial_broker',businessWorkspaces:['commercial'],commissionStructureId:'planned',contact:{name:'Existing Contact',email:'contact@example.test'}})
  expect(recruitmentEntryContext(route.state,'agency')).toMatchObject({entryPoint,returnTo,joiningRole:'commercial_broker',businessWorkspaces:['commercial'],commissionStructureId:'planned',contact:{email:'contact@example.test'},error:''})
  expect(recruitmentEntryContext(route.state,'other').error).toMatch(/Switch/)
 }
 expect(recruitmentReturnTo('/settings/users?redirect=https://foreign.test')).toBe('/agency/recruitment')
})
