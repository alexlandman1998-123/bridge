// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ListingAgentChoices from '../ListingAgentChoices'
afterEach(cleanup)
it('selects one agency agent using accessible radio cards without submitting', () => {
 const onChange = vi.fn()
 render(<form><ListingAgentChoices agents={[{ id: 'a', fullName: 'Alex', email: 'alex@example.test' }, { id: 'b', fullName: 'Bob' }]} value="a" onChange={onChange} /></form>)
 expect(screen.getByRole('radio', { name: /Alex/ }).checked).toBe(true)
 fireEvent.click(screen.getByRole('radio', { name: 'Bob' }))
 expect(onChange).toHaveBeenCalledWith('b')
 expect(screen.queryByRole('button')).toBeNull()
})
