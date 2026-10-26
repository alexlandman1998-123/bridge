// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import MobileTodayLeadScroller from '../MobileTodayLeadScroller.jsx'
import { buildMobileToday } from '../../../services/mobileTodayModel.js'
import { buildBuyerIntakeNotes } from '../../../services/buyerIntakeModel.js'

afterEach(cleanup)
const now = new Date('2026-10-20T10:00:00Z')
const today = buildMobileToday({ now, profile: { id: 'me' }, tasks: [
  { taskId: 'one', assignedAgentId: 'me', title: 'Call Sarah', dueDate: '2026-10-19', status: 'In Progress' },
] })
const props = { today, leads: [], leadsAvailable: true, onOpen: vi.fn(), onRefresh: vi.fn() }

it('moves confirmed completed tasks below open tasks and removes the extra panel labels', async () => {
  const extra = { ...today.taskChecklist[0], id: 'task:two', taskId: 'two', title: 'Second task' }
  render(<MobileTodayLeadScroller {...props} today={{ ...today, taskChecklist: [...today.taskChecklist, extra] }} onUpdateTask={vi.fn().mockResolvedValue({})} />)
  expect(screen.queryByText('YOUR DAILY CHECKLIST')).toBeNull()
  expect(screen.queryByText('YOUR NEXT CONVERSATION')).toBeNull()
  expect(screen.queryByRole('group', { name: 'Home panels' })).toBeNull()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Complete Call Sarah' }))
  await waitFor(() => expect(screen.getAllByRole('checkbox').map(box => box.getAttribute('aria-label'))).toEqual(['Complete Second task', 'Reopen Call Sarah']))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Reopen Call Sarah' }))
  await waitFor(() => expect(screen.getAllByRole('checkbox')[0].getAttribute('aria-label')).toBe('Complete Call Sarah'))
})

it('only marks a buyer contacted after a confirmed journey save and offers retry after failure', async () => {
  const onContactLead = vi.fn().mockRejectedValueOnce(new Error('conflict')).mockResolvedValueOnce({})
  render(<MobileTodayLeadScroller {...props} onContactLead={onContactLead} leads={[{ leadId: 'one', leadCategory: 'buyer', contactName: 'Sarah' }, { leadId: 'seller', leadCategory: 'seller', contactName: 'Seller' }]} />)
  expect(screen.queryByRole('button', { name: 'Mark Seller as contacted' })).toBeNull()
  const button = screen.getByRole('button', { name: 'Mark Sarah as contacted' })
  fireEvent.click(button)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Couldn’t save contact status. Please retry or refresh the lead.')
  expect(button.disabled).toBe(false)
  fireEvent.click(button)
  await waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('true'))
  expect(button.disabled).toBe(true)
  expect(onContactLead).toHaveBeenCalledTimes(2)
})

it('waits for a confirmed save, blocks repeated taps and supports undo', async () => {
  let resolve
  const onUpdateTask = vi.fn().mockImplementationOnce(() => new Promise(done => { resolve = done })).mockResolvedValueOnce({})
  render(<MobileTodayLeadScroller {...props} onUpdateTask={onUpdateTask} />)
  const box = screen.getByRole('checkbox', { name: 'Complete Call Sarah' })
  fireEvent.click(box)
  expect(box.checked).toBe(false)
  expect(box.disabled).toBe(true)
  expect(onUpdateTask).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'one', originalStatus: 'In Progress' }), true)
  resolve({})
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Reopen Call Sarah' }).checked).toBe(true))
  expect(screen.getByText('Call Sarah').closest('.mobile-checklist-task').classList.contains('is-completed')).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Reopen Call Sarah' }))
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Complete Call Sarah' }).checked).toBe(false))
  expect(onUpdateTask).toHaveBeenLastCalledWith(expect.objectContaining({ taskId: 'one', originalStatus: 'In Progress' }), false)
})

it('keeps the prior state after a failed save and lets the user retry', async () => {
  const onUpdateTask = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({})
  const onProgress = vi.fn()
  render(<MobileTodayLeadScroller {...props} onUpdateTask={onUpdateTask} onProgress={onProgress} />)
  fireEvent.click(screen.getByRole('checkbox'))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Couldn’t save. Please try again.')
  expect(screen.getByRole('checkbox').checked).toBe(false)
  expect(onProgress).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox'))
  await waitFor(() => expect(screen.getByRole('checkbox').checked).toBe(true))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(onProgress).toHaveBeenCalledWith('task', expect.objectContaining({ taskId: 'one' }), true)
})

it('shows source branding and exact contact actions without sending a message', () => {
  const onOpen = vi.fn()
  render(<MobileTodayLeadScroller {...props} onOpen={onOpen} leads={[
    { leadId: 'lead/one', contactName: 'Sarah Green', contactPhone: '082 123 4567', leadSource: 'Property24', propertyAddress: '18 Oak Avenue' },
    { leadId: 'lead-two', contactName: 'No phone', contactPhone: 'invalid', leadSource: 'Private Property' },
  ]} />)
  expect(screen.getByRole('img', { name: 'Property24' })).toBeTruthy()
  expect(screen.getByRole('img', { name: 'Private Property' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Call Sarah Green' }).getAttribute('href')).toBe('tel:+27821234567')
  expect(screen.getByRole('link', { name: 'WhatsApp Sarah Green' }).getAttribute('href')).toBe('https://wa.me/27821234567')
  expect(screen.queryByRole('link', { name: 'Call No phone' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Sarah Green' }))
  expect(onOpen).toHaveBeenCalledWith('/mobile/lead/lead%2Fone')
})

it('distinguishes unavailable tasks and leads from an empty day', () => {
  const onRefresh = vi.fn()
  render(<MobileTodayLeadScroller {...props} today={{ ...today, available: { followUps: false } }} leadsAvailable={false} onRefresh={onRefresh} />)
  expect(screen.queryByText('You’re all caught up.')).toBeNull()
  expect(within(screen.getByRole('region', { name: 'New leads' })).queryByText('No new leads yet.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry tasks' }))
  expect(onRefresh).toHaveBeenCalledOnce()
})

it('shows saved qualification submission evidence on Home and removes lead avatars', () => {
  const notes = buildBuyerIntakeNotes({ qualification: { qualifiedAt: '2026-10-20T09:00:00Z', answers: { budget: 'R 2m', areaInterest: 'Waverley' } } })
  const { container } = render(<MobileTodayLeadScroller {...props} leads={[
    { leadId: 'submitted', leadCategory: 'buyer', contactName: 'Sarah', notes },
    { leadId: 'pending', leadCategory: 'buyer', contactName: 'John', stage: 'Qualified', budget: 2000000 },
    { leadId: 'seller', leadCategory: 'seller', contactName: 'Seller' },
  ]} />)
  const articles = screen.getAllByRole('article')
  expect(within(articles[0]).getByText('Buyer qualification submitted')).toBeTruthy()
  expect(within(articles[0]).getByText('Yes')).toBeTruthy()
  expect(within(articles[1]).getByText('No')).toBeTruthy()
  expect(within(articles[2]).queryByText('Buyer qualification submitted')).toBeNull()
  expect(container.querySelector('.mobile-home-lead-avatar')).toBeNull()
})

it('opens and closes task capture over Home without navigating away', async () => {
  const onOpen = vi.fn()
  render(<MobileTodayLeadScroller {...props} onOpen={onOpen} />)
  expect(screen.queryByText('Today’s tasks and anything overdue.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Add task' }))
  expect(await screen.findByRole('heading', { name: 'Schedule follow-up' })).toBeTruthy()
  expect(screen.getByRole('textbox', { name: 'Follow-up title' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Tasks for today' })).toBeTruthy()
  expect(onOpen).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Close create sheet' }))
  expect(screen.queryByRole('heading', { name: 'Schedule follow-up' })).toBeNull()
  expect(onOpen).not.toHaveBeenCalled()
})

it('opens lead creation from the matching plus button', () => {
  const onOpen = vi.fn()
  render(<MobileTodayLeadScroller {...props} onOpen={onOpen} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add lead' }))
  expect(onOpen).toHaveBeenCalledWith('/mobile/leads?create=lead')
})
