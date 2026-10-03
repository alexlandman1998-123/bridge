// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RentalLeadActionsMenu from '../RentalLeadActionsMenu';
afterEach(cleanup);
const lead = { id: 'lead-1', name: 'Amy Tenant', outcome: { status: 'open' } };
function setup() {
  const onOpen = vi.fn(), onLost = vi.fn(), rowClick = vi.fn();
  render(<div onClick={rowClick}><RentalLeadActionsMenu lead={lead} onOpen={onOpen} onLost={onLost} /></div>);
  return { onOpen, onLost, rowClick, trigger: screen.getByRole('button', { name: 'Actions for Amy Tenant' }) };
}
it('runs only the selected action and closes without triggering row navigation', () => {
  const { onOpen, onLost, rowClick, trigger } = setup();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Open lead' }));
  expect(onOpen).toHaveBeenCalledExactlyOnceWith(lead);
  expect(screen.queryByRole('group')).toBeNull();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Mark as lost' }));
  expect(onLost).toHaveBeenCalledExactlyOnceWith(lead);
  expect(screen.queryByRole('group')).toBeNull();
  expect(rowClick).not.toHaveBeenCalled();
});
it('dismisses on outside click, panel padding, toggle, Escape and scrolling', () => {
  const { trigger } = setup();
  for (const dismiss of [() => fireEvent.pointerDown(document.body), () => fireEvent.click(document.body), () => fireEvent.click(screen.getByRole('group')), () => fireEvent.click(trigger), () => fireEvent.keyDown(document, { key: 'Escape' }), () => fireEvent.scroll(window)]) {
    fireEvent.click(trigger);
    expect(screen.getByRole('group')).toBeTruthy();
    dismiss();
    expect(screen.queryByRole('group')).toBeNull();
  }
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});
it('keeps the menu outside the table overflow container', () => {
  const { trigger } = setup();
  fireEvent.click(trigger);
  expect(screen.getByRole('group').parentElement).toBe(document.body);
});
