// @vitest-environment jsdom
import React from 'react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import OrganisationWorkspaceSwitcher from '../OrganisationWorkspaceSwitcher'

const memberships = [
  { id: 'isell-member', workspaceId: 'isell', workspace: { name: 'I Sell Property' } },
  { id: 'kingdom-member', workspaceId: 'kingdom', workspace: { name: 'Kingdom Realty' } },
]
const currentWorkspace = { id: 'isell', name: 'I Sell Property' }
afterEach(cleanup)

describe('organisation switching', () => {
  it('keeps the selector wired into the sidebar independently of the business line selector', () => {
    const sidebar = readFileSync('src/components/Sidebar.jsx', 'utf8')
    expect(sidebar).toMatch(/<OrganisationWorkspaceSwitcher\s+currentWorkspace=\{workspaceContext.currentWorkspace\}\s+memberships=\{workspaceContext.activeMemberships\}\s+onChange=\{\(workspaceId\) => workspaceContext.setWorkspace\(\{ id: workspaceId \}\)\}/)
  })

  it('lists both businesses and selects the other organisation by its workspace ID', () => {
    const onChange = vi.fn()
    const { rerender } = render(<OrganisationWorkspaceSwitcher currentWorkspace={currentWorkspace} memberships={memberships} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'I Sell Property' }))
    expect(screen.getByRole('menuitemradio', { name: 'I Sell Property' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Kingdom Realty' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('kingdom')
    expect(screen.queryByRole('menu')).toBeNull()
    rerender(<OrganisationWorkspaceSwitcher currentWorkspace={{ id: 'kingdom', name: 'Kingdom Realty' }} memberships={memberships} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kingdom Realty' }))
    expect(screen.getByRole('menuitemradio', { name: 'Kingdom Realty' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'I Sell Property' }))
    expect(onChange).toHaveBeenLastCalledWith('isell')
  })

  it('deduplicates multiple memberships and hides for only one organisation', () => {
    const { rerender } = render(<OrganisationWorkspaceSwitcher currentWorkspace={currentWorkspace} memberships={[...memberships, memberships[0]]} />)
    fireEvent.click(screen.getByRole('button', { name: 'I Sell Property' }))
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(2)
    rerender(<OrganisationWorkspaceSwitcher currentWorkspace={currentWorkspace} memberships={[memberships[0], memberships[0]]} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('closes on Escape or outside click and does not reselect the current organisation', () => {
    const onChange = vi.fn()
    render(<OrganisationWorkspaceSwitcher currentWorkspace={currentWorkspace} memberships={memberships} onChange={onChange} />)
    const trigger = screen.getByRole('button', { name: 'I Sell Property' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'I Sell Property' }))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
