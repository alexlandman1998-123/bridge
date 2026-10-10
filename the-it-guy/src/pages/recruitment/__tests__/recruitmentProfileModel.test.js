import { expect,it } from 'vitest'
import { initialRecruitmentProfile,normalizeRecruitmentProfile,recruitmentProfileErrors,recruitmentProfileSummary,recruitmentProfileSteps } from '../recruitmentProfileModel'
import { validProfile } from './helpers/recruitmentProfileFixture'
import { homeSeekersPackageOptions } from '../recruitmentProfileModel'
import { recruitmentPaymentOptions } from '../../homeSeekersRecruitment'
const now=new Date('2026-10-07T10:00:00Z')
it('shows which questionnaire steps still need valid answers, including conditional FFC details',()=>{
  expect(recruitmentProfileSteps(validProfile()).every(step=>step.complete)).toBe(true)
  const steps=recruitmentProfileSteps({...validProfile(),dateOfBirth:'',ffcNumber:''})
  expect(steps.map(step=>step.complete)).toEqual([false,true,false,true])
})
it('captures the supplied questionnaire, accepts zero and optional WhatsApp, and rejects underage applicants and invalid dates',()=>{
  expect(recruitmentProfileErrors(validProfile(),{required:true,now})).toEqual({})
  for (const dateOfBirth of ['2008-10-08','2026-01-01','1990-02-30','0000-01-01']) expect(recruitmentProfileErrors({...validProfile(),dateOfBirth},{required:true,now})).toHaveProperty('dateOfBirth')
  expect(recruitmentProfileErrors({...validProfile(),dateOfBirth:'2008-10-07'},{required:true,now})).toEqual({})
  expect(recruitmentProfileErrors({...validProfile(),expectedStartDate:'2026-10-07'},{required:true,now})).toHaveProperty('expectedStartDate')
  expect(recruitmentProfileErrors({...validProfile(),expectedStartDate:'2026-10-08'},{required:true,now})).toEqual({})
})
it('validates conditional FFC answers and removes obsolete data when license status changes',()=>{
  expect(recruitmentProfileErrors({...validProfile(),ffcNumber:'',ffcType:''},{required:true,now})).toMatchObject({ffcNumber:expect.any(String),ffcType:expect.any(String)})
  for (const licenseStatus of ['pending','expired']) {
    const answers=normalizeRecruitmentProfile({...validProfile(),licenseStatus})
    expect(answers.ffcNumber).toBe('');expect(answers.ffcType).toBe('')
    expect(recruitmentProfileErrors(answers,{required:true,now})).toEqual({})
  }
})
it('allows incomplete drafts but checks supplied lengths, enums, phones, whole counts and postal codes',()=>{
  expect(recruitmentProfileErrors({email:'applicant@example.test'})).toEqual({})
  expect(recruitmentProfileErrors({}, {page:0,required:true,now})).toHaveProperty('firstName')
  expect(recruitmentProfileErrors({}, {page:0,required:true,now})).not.toHaveProperty('province')
  for (const [key,value] of [['propertiesListed','1000'],['propertiesSold','-1'],['propertiesSold','1.5'],['currentEmployer','a'.repeat(101)],['streetAddress','a'.repeat(201)],['city','a'.repeat(101)],['postalCode','123'],['province','forged'],['licenseStatus','forged'],['southAfricanCitizen','maybe'],['mobileCountryCode','27'],['mobileNumber','1']]) expect(recruitmentProfileErrors({...validProfile(),[key]:value},{required:true,now})).toHaveProperty(key)
  expect(recruitmentProfileErrors({...validProfile(),whatsappNumber:'821234567'},{required:true,now})).toHaveProperty('whatsappCountryCode')
  expect(recruitmentProfileErrors({...validProfile(),whatsappCountryCode:'+44',whatsappNumber:'7700123456'},{required:true,now})).toEqual({})
})
it('uses the Home Seekers website options and requires a preference only at the last Home Seekers step',()=>{
  expect(homeSeekersPackageOptions.slice(0,3)).toEqual(recruitmentPaymentOptions.map(option=>[option.id,option.title]))
  expect(recruitmentProfileErrors(validProfile(),{required:true,homeSeekers:true,now})).toHaveProperty('packagePreference')
  expect(recruitmentProfileErrors(validProfile(),{required:true,page:2,homeSeekers:true,now})).toEqual({})
  expect(recruitmentProfileErrors(validProfile(),{homeSeekers:true,now})).toEqual({})
  for(const [packagePreference,label] of homeSeekersPackageOptions) {
    const answers={...validProfile(),packagePreference}
    expect(recruitmentProfileErrors(answers,{required:true,homeSeekers:true,now})).toEqual({})
    expect(recruitmentProfileSummary(answers)).toContainEqual(['Home Seekers package preference',label])
  }
  for(const packagePreference of ['forged',{},true,23]) expect(recruitmentProfileErrors({...validProfile(),packagePreference},{homeSeekers:true,now})).toHaveProperty('packagePreference')
  expect(recruitmentProfileErrors({...validProfile(),packagePreference:'decide_later'},{now})).toHaveProperty('packagePreference')
  expect(normalizeRecruitmentProfile(validProfile())).not.toHaveProperty('packagePreference')
})
it('prefills the immutable verified email, restores drafts and whitelists without credentials or permissions',()=>{
  const applicant={contact:{firstName:'Website',lastName:'Applicant',email:'website@example.test',phone:'+27821234567'}}
  expect(initialRecruitmentProfile(applicant)).toMatchObject({email:'website@example.test',mobileCountryCode:'+27',mobileNumber:'821234567'})
  expect(initialRecruitmentProfile({...applicant,profile:{answers:{...validProfile(),preferredName:'Alex'}}}).preferredName).toBe('Alex')
  const answers=normalizeRecruitmentProfile({...validProfile(),password:'secret',organisationId:'forged',emailVerified:true})
  expect(answers).not.toHaveProperty('password');expect(answers).not.toHaveProperty('organisationId')
  expect(recruitmentProfileSummary(answers)).toContainEqual(['Properties listed (last 12 months)','0'])
})
