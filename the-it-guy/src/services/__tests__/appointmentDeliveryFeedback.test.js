import { describe,expect,it } from 'vitest'
import { buildAppointmentSaveFeedback } from '../appointmentSaveFeedbackService'
const result={sendInviteEmails:true,remindersEnabled:true,attachCalendarInvite:true,delivery:{verified:true,jobs:[{channel:'email',event_kind:'invite',status:'queued'},{channel:'email',event_kind:'reminder:custom_30m',status:'queued'}]}}
describe('Durable calendar delivery feedback',()=>{
 it('reports committed jobs without claiming they were sent or attachments delivered',()=>{
  const feedback=buildAppointmentSaveFeedback(result)
  expect(feedback).toContain('Email: 1 queued.');expect(feedback).toContain('1 reminder jobs scheduled.')
  expect(feedback).not.toMatch(/Email sent|ICS attached|delivered/)
 })
 it('keeps invitations off independent from scheduled reminders',()=>{
  const feedback=buildAppointmentSaveFeedback({...result,sendInviteEmails:false,delivery:{verified:true,jobs:result.delivery.jobs.slice(1)}})
  expect(feedback).toContain('Invitations off.');expect(feedback).toContain('1 reminder jobs scheduled.')
 })
 it('does not label an empty verified queue as successful delivery',()=>{
  expect(buildAppointmentSaveFeedback({...result,delivery:{verified:true,jobs:[]}})).toContain('No email jobs queued.')
 })
})
