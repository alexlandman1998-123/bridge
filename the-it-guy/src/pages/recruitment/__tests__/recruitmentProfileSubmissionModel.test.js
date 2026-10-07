import { expect,it } from 'vitest'
import { applicationRequirements, applicationSummary } from '../recruitmentApplicationModel'
import { recruitmentReadiness } from '../recruitmentModel'
import { validProfile } from './helpers/recruitmentProfileFixture'
it('shows the submitted questionnaire without inventing qualifications, monthly deal rates or operating areas',()=>{
  const application={version:'recruitment-application-v1',questionnaireVersion:'recruitment-profile-v1',answers:validProfile()}
  const summary=applicationSummary(application)
  expect(summary).toContainEqual(['Properties listed (last 12 months)','0'])
  expect(summary).toContainEqual(['Date of birth','1990-06-15'])
  expect(summary).toContainEqual(['License status','Valid'])
  expect(summary.some(([label])=>label==='Average deals / month')).toBe(false)
  expect(applicationRequirements(application)).toHaveLength(4)
  expect(applicationRequirements(application)[1].note).toContain('does not capture qualifications')
  const readiness=recruitmentReadiness({application_json:application,application_submitted_at:'2026-10-07'})
  expect(readiness.items.find(item=>item.key==='qualifications').complete).toBe(false)
  expect(readiness.items.find(item=>item.key==='area').complete).toBe(false)
})
