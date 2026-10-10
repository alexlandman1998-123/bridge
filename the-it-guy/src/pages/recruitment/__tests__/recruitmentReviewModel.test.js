import { expect, it } from 'vitest'
import { recruitmentReviewDraft, recruitmentReviewErrors, recruitmentReviewSummary, reopenRecruitmentStage } from '../recruitmentReviewModel'
const lead = {id:'lead',status:'under_review',review_started_at:'2026-10-05',documents_json:[{path:'org/lead/file'}]}
it('allows approved findings to be blank or short while requiring lead-owned evidence', () => {
  const review = recruitmentReviewDraft(lead)
  review.checks.registration = {status:'verified',notes:'',evidence:['other/lead/file']}
  review.documents[0].status = 'reviewed'
  expect(recruitmentReviewErrors(review,lead)).toEqual(['Supporting evidence must belong to this lead.'])
  review.checks.registration.evidence = ['org/lead/file']
  expect(recruitmentReviewErrors(review,lead)).toEqual([])
  review.checks.registration.notes = 'OK'
  review.documents[0].notes = 'OK'
  expect(recruitmentReviewErrors(review,lead)).toEqual([])
})
it('requires reasons for rejected checks and files and retains limits on optional notes', () => {
  const review = recruitmentReviewDraft(lead)
  review.checks.registration.status = 'needs_information'
  review.documents[0].status = 'needs_information'
  for (const notes of ['', '    ', 'No']) {
    review.checks.registration.notes = notes
    review.documents[0].notes = notes
    expect(recruitmentReviewErrors(review,lead)).toEqual(expect.arrayContaining([expect.stringContaining('rejected check'),expect.stringContaining('rejected document')]))
  }
  review.checks.registration.notes = 'Certificate has expired.'
  review.documents[0].notes = 'Upload a legible copy.'
  expect(recruitmentReviewErrors(review,lead)).toEqual([])
  review.checks.registration = {status:'verified',notes:'x'.repeat(2001),evidence:[]}
  review.documents[0] = {...review.documents[0],status:'reviewed',notes:null}
  expect(recruitmentReviewErrors(review,lead)).toEqual(['Keep check notes to 2,000 characters.','Keep document notes to 2,000 characters.'])
})
it('distinguishes incomplete checks, information requests and readiness without advancing the stage', () => {
  const review = recruitmentReviewDraft(lead)
  for (const check of Object.values(review.checks)) { check.status='verified';check.notes='Reviewed the evidence' }
  expect(recruitmentReviewSummary({...lead,review_json:review}).status).toBe('in_progress')
  review.documents[0] = {...review.documents[0],status:'reviewed',notes:'File reviewed'}
  expect(recruitmentReviewSummary({...lead,review_json:review}).status).toBe('ready_for_approval')
  review.checks.training.status='needs_information'
  expect(recruitmentReviewSummary({...lead,review_json:review}).status).toBe('needs_information')
  expect(reopenRecruitmentStage(lead)).toBe('under_review')
  expect(reopenRecruitmentStage({application_submitted_at:'2026-10-05'})).toBe('application_submitted')
})
it('rejects stale document sets and invalid dates and does not copy caller-provided audit stamps', () => {
  const review = recruitmentReviewDraft({...lead,review_json:{checks:{registration:{status:'pending',notes:'',evidence:[],updatedBy:'forged'}}}})
  expect(review.checks.registration).not.toHaveProperty('updatedBy')
  review.documents=[]; review.followUpOn='2026-02-30'
  expect(recruitmentReviewErrors(review,lead)).toEqual(expect.arrayContaining([expect.stringContaining('current documents'),expect.stringContaining('follow-up date')]))
  expect(recruitmentReviewErrors(review,{...lead,status:'closed_lost'})[0]).toContain('Start the application review')
})
