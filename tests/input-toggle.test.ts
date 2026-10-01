import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import Input from '@/components/Input';

/**
 * Integration check: mounts the real Input component in happy-dom, clicks the
 * password visibility toggle, and asserts the field actually flips between
 * password and text (ref-based toggle) and the icon label follows.
 */
describe('Input password visibility toggle', () => {
  it('toggles the password field between hidden and visible', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    root.render(React.createElement(Input, { type: 'password', label: 'Password' }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const input = container.querySelector('input');
    expect(input).toBeTruthy();
    expect(input?.getAttribute('type')).toBe('password');

    const show = container.querySelector('button[aria-label="Show password"]');
    expect(show).toBeTruthy();

    (show as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(input?.getAttribute('type')).toBe('text');

    const hide = container.querySelector('button[aria-label="Hide password"]');
    expect(hide).toBeTruthy();
    (hide as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(input?.getAttribute('type')).toBe('password');

    root.unmount();
    container.remove();
  });

  it('leaves non-password inputs untouched (no toggle rendered)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    root.render(React.createElement(Input, { type: 'email', label: 'Email' }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(container.querySelector('input')?.getAttribute('type')).toBe('email');
    expect(container.querySelector('button[aria-label="Show password"]')).toBeNull();

    root.unmount();
    container.remove();
  });
});
