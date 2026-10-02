import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AgentWorkspace } from '../../../pages/Agents.jsx'
import PartnerBusinessDistributionPanel from '../../dashboard/PartnerBusinessDistributionPanel.jsx'

vi.mock('../../../lib/dashboardSecondaryApi', () => ({
  loadAgencyAgentCardLink: vi.fn(),
  loadAgencyAgentCardInsights: vi.fn(),
  saveAgencyAgentCardLink: vi.fn(),
}))

const agent = {
  id: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000001',
  organisationId: '00000000-0000-4000-8000-000000000002',
  firstName: 'Matthew', lastName: 'Jansen', role: 'agent', status: 'active',
  email: 'matthew.j@revo.co.za', phone: '+27 79 480 1200',
  deals: [], pipelineRows: [], developmentListings: [], privateListings: [],
}
function render(props = {}) {
  return renderToStaticMarkup(<MemoryRouter><AgentWorkspace agent={agent} {...props} /></MemoryRouter>)
}

describe('Agent overview', () => {
  it('shows the saved contact details as working email and phone links', () => {
    const html = render()
    expect(html).toContain('mailto:matthew.j@revo.co.za')
    expect(html).toContain('tel:+27794801200')
    expect(html).not.toContain('calling is not connected')
    expect(html).not.toContain('messaging is not connected')
  })

  it('keeps workload and monthly results separate without repeated placeholders', () => {
    const html = render()
    expect(html).not.toContain('Follow-Up Compliance')
    expect(html).not.toContain('vs last month')
    expect(html).not.toContain('Financial Performance')
    expect(html.match(/>Pipeline Value<\/p>/g)).toHaveLength(1)
    expect(html).not.toContain('Deals Closed')
    expect(html).toContain('Projected Commission')
    expect(html).toContain('Estimate at 3%')
  })

  it('offers card generation only to managers, without inventing a public URL', () => {
    expect(render({ canManageSettings: true })).toContain('Generate card')
    expect(render({ canManageSettings: false })).not.toContain('Generate card')
    expect(render({ canManageSettings: true })).not.toContain('/card/matthew-jansen')
    expect(render()).not.toContain('Contact clicks')
  })

  it('shows only this agent’s tasks and offers expansion for more than six', () => {
    const tasks = Array.from({ length: 8 }, (_, index) => ({
      id: `task-${index}`, title: `Own task ${index}`, assignedAgentId: agent.userId, status: 'pending',
    }))
    tasks.push({ id: 'other', title: 'Other agent task', assignedAgentId: 'another-agent', status: 'pending' })
    const html = render({ workspaceSnapshot: { tasks } })
    expect(html).toContain('Own task 5')
    expect(html).not.toContain('Own task 6')
    expect(html).not.toContain('Other agent task')
    expect(html.match(/>View all<\/button>/g)).toHaveLength(2)
  })

  it('uses a compact agent distribution empty state without redundant explanatory text', () => {
    const html = renderToStaticMarkup(<PartnerBusinessDistributionPanel scope="agent" />)
    expect(html).toContain('Partner Business Distribution')
    expect(html.match(/No deals yet/g)).toHaveLength(3)
    expect(html).not.toContain('Agent distribution')
    expect(html).not.toContain('selected dashboard scope')
    expect(html).not.toContain('will populate')
    expect(html).not.toContain('conic-gradient')
    expect(html).not.toContain('Coverage')
  })

  it('retains real partner charts when this agent has assigned deals', () => {
    const section = { totalDeals: 1, assignedDeals: 1, items: [{ label: 'Selected attorney', count: 1, percentage: 100 }] }
    const html = renderToStaticMarkup(<PartnerBusinessDistributionPanel scope="agent" distribution={{ meta: { totalTransactions: 1 }, attorneys: section }} />)
    expect(html).toContain('Selected attorney')
    expect(html).toContain('conic-gradient')
    expect(html).not.toContain('Deals Analysed')
  })
})
