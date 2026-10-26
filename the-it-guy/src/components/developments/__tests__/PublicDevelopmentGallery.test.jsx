// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import PublicDevelopmentGallery from '../PublicDevelopmentGallery.jsx';
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = vi.fn(function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); });
});
afterEach(cleanup);
const images = ['/one.jpg', '/two.jpg', '/three.jpg', '/four.jpg'];
describe('Public development gallery', () => {
  it('opens the selected preview and supports button and keyboard navigation', () => {
    render(<PublicDevelopmentGallery name="Madison Place" images={images} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open image 2 of 4' }));
    const viewer = screen.getByRole('dialog');
    expect(within(viewer).getByRole('img').getAttribute('src')).toBe('/two.jpg');
    fireEvent.click(within(viewer).getByRole('button', { name: 'Next image' }));
    expect(within(viewer).getByRole('img').getAttribute('src')).toBe('/three.jpg');
    fireEvent.keyDown(viewer, { key: 'ArrowLeft' });
    expect(within(viewer).getByRole('img').getAttribute('src')).toBe('/two.jpg');
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(within(viewer).getByRole('button', { name: 'Close gallery' }));
    expect(document.body.style.overflow).toBe('');
  });
  it('handles empty, duplicate and single-image galleries', () => {
    const { rerender, container } = render(<PublicDevelopmentGallery name="Madison Place" />);
    expect(container.innerHTML).toBe('');
    rerender(<PublicDevelopmentGallery name="Madison Place" images={['/one.jpg', '/one.jpg']} />);
    fireEvent.click(screen.getByRole('button', { name: 'View all 1 image' }));
    expect(screen.getByRole('button', { name: 'Next image' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close gallery' }));
  });
});
