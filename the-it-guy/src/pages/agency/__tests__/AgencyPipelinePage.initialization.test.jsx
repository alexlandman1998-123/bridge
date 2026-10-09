// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AgencyPipelinePage from '../AgencyPipelinePage'

vi.mock('../../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    role: 'agent',
    profile: { id: 'initialization-agent', fullName: 'Test Agent' },
    currentWorkspace: { id: 'initialization-org', organisationId: 'initialization-org', workspaceType: 'agency' },
    currentMembership: { organisationId: 'initialization-org', role: 'agent' },
    workspace: { id: 'all', type: 'agency' },
  }),
}))

describe('pipeline workspace first render', () => {
  // Server rendering evaluates every hook dependency without running effects
  // or making remote requests. This exercises the actual workspace controller.
  it.each([
    ['lead workspace', '/pipeline/leads/example-lead', 'leads', '/pipeline/leads/:leadId'],
    ['calendar', '/pipeline/calendar', 'calendar', '/pipeline/calendar'],
    ['pipeline', '/pipeline', 'pipeline', '/pipeline'],
  ])('initializes %s without accessing state before its declaration', (_, path, initialViewMode, route) => {
    const render = () => renderToString(createElement(MemoryRouter, { initialEntries: [path] },
      createElement(Routes, null,
        createElement(Route, { path: route, element: createElement(AgencyPipelinePage, { initialViewMode }) }),
      ),
    ))
    expect(render).not.toThrow()
    expect(render()).toBeTruthy()
  })
})
