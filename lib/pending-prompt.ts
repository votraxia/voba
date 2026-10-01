/**
 * One-prompt handoff from the public landing page into the authenticated app.
 *
 * A visitor who describes a store before signing in shouldn't lose what they
 * wrote, so the prompt is stashed in `sessionStorage` while they authenticate and
 * read back once by the dashboard. Session-scoped (not localStorage) and cleared
 * on read, so it never leaks between people sharing a browser.
 */

const KEY = 'theme-builder:pending-prompt';

/** Longest prompt we keep — matches the server-side prompt bound. */
const MAX_LENGTH = 2000;

export function savePendingPrompt(prompt: string): void {
  const trimmed = prompt.trim().slice(0, MAX_LENGTH);
  if (!trimmed) return;
  try {
    window.sessionStorage.setItem(KEY, trimmed);
  } catch {
    // Storage can be unavailable (private mode / blocked cookies) — the user
    // simply retypes the prompt, so this is non-fatal.
  }
}

/** Read and clear the stored prompt. Returns an empty string when there is none. */
export function takePendingPrompt(): string {
  try {
    const value = window.sessionStorage.getItem(KEY);
    if (value) window.sessionStorage.removeItem(KEY);
    return value ?? '';
  } catch {
    // Storage unavailable — nothing to restore.
    return '';
  }
}
