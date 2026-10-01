'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createEventParser, type BuilderPage } from '@/lib/ai/events';
import { resolveAIModel, type AIModelId } from '@/lib/ai/models';
import { sanitizeGeneratedHtml } from '@/lib/ai/sanitize';
import { applyPatchOperations } from '@/lib/ai/patch';
import {
  createProjectRevision,
  getProjectRevisions,
  restoreRevisionData,
  type RevisionPageSnapshot,
} from '@/lib/revisions';
import { authHeaders } from '@/lib/auth-headers';
import { getProjectPages, savePage, deletePage, clearPages } from '@/lib/pages';
import { saveProjectAIModel } from '@/lib/projects';
import { getProjectMessages, appendMessages, clearMessages } from '@/lib/messages';
import { getProjectTheme, saveTheme, clearTheme } from '@/lib/theme';
import { captureAndSaveThumbnail } from '@/lib/thumbnail';

/**
 * Client-side builder state: chat messages, page tabs, and the live preview,
 * all driven by the NDJSON stream from `/api/ai`. This is the only place that
 * talks to the AI route so the editor components stay presentational.
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export type PageStatus = 'idle' | 'generating' | 'ready';

export interface PageState extends BuilderPage {
  html: string;
  status: PageStatus;
}

/** Lightweight revision metadata exposed to the UI. */
export interface RevisionInfo {
  id: string;
  label: string;
  createdAt: string;
}

interface BuilderContextValue {
  messages: ChatMessage[];
  pages: PageState[];
  activePageId: string | null;
  activePage: PageState | null;
  /** The project's global stylesheet, applied to every page's preview. */
  themeCss: string;
  /** The project's shared style guide (brand, palette, component classes), if generated. */
  styleGuide: string | null;
  /** The AI model this project generates with (a catalog id). */
  aiModel: AIModelId;
  /**
   * Switch the project's AI model. Applies to later generations and is persisted
   * on the project; resolves false when the choice could not be saved.
   */
  setAiModel: (id: string) => Promise<boolean>;
  isStreaming: boolean;
  generatingPageId: string | null;
  isImageGenerating: boolean;
  error: string | null;
  sendMessage: (text: string, options?: SendMessageOptions) => void;
  setActivePage: (id: string) => void;
  closePage: (id: string) => void;
  /**
   * Apply an in-preview inline edit to a page's HTML (from the iframe editor).
   * Sanitizes, updates state, and persists just that page. Returns the sanitized
   * HTML so the caller can avoid echoing it straight back into the iframe.
   */
  updatePageHtml: (pageId: string, html: string) => string;
  newChat: () => void;
  /** Force-save the current state now; resolves to true when it persisted. */
  saveNow: () => Promise<boolean>;
  /** True while the last save attempt failed (no error mid-turn). */
  saveError: boolean;
  /** True while a save is in flight. */
  saving: boolean;
  /** Revision history for undo/restore (AGENTS.md §8). */
  revisions: RevisionInfo[];
  /** True while a revision is being restored. */
  isRestoring: boolean;
  /** Capture a snapshot now (called before a risky change). */
  captureRevision: (label: string) => void;
  /** Undo to the previous revision (returns true when one was restored). */
  undo: () => Promise<boolean>;
  /** Restore a specific revision by id. */
  restoreRevision: (id: string) => Promise<boolean>;
}

const BuilderContext = createContext<BuilderContextValue | null>(null);

interface SendMessageOptions {
  source?: 'chat' | 'image-edit';
}

interface BuilderSnapshot {
  messages: ChatMessage[];
  pages: PageState[];
  activePageId: string | null;
  kickedOff: boolean;
}

export function useBuilder(): BuilderContextValue {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error('useBuilder must be used within <BuilderProvider>.');
  return ctx;
}

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function getStorageKey(projectId: string): string {
  return `builder-session:${projectId}`;
}

function readSnapshot(projectId: string): BuilderSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(getStorageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BuilderSnapshot>;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      pages: Array.isArray(parsed.pages) ? parsed.pages : [],
      activePageId: typeof parsed.activePageId === 'string' ? parsed.activePageId : null,
      kickedOff: parsed.kickedOff === true,
    };
  } catch {
    return null;
  }
}

function writeSnapshot(projectId: string, snapshot: BuilderSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    // Large projects (HTML-heavy pages) can exceed the sessionStorage quota —
    // persistence must degrade gracefully instead of throwing inside an effect.
    window.sessionStorage.setItem(getStorageKey(projectId), JSON.stringify(snapshot));
  } catch {
    // Quota exceeded or storage disabled — the DB remains the source of truth.
  }
}

/** Merge planned tabs into existing pages without duplicating ids. */
function mergePages(existing: PageState[], planned: BuilderPage[]): PageState[] {
  const byId = new Map(existing.map((p) => [p.id, p]));
  for (const page of planned) {
    if (!byId.has(page.id)) {
      byId.set(page.id, { ...page, html: '', status: 'idle' });
    }
  }
  return Array.from(byId.values());
}

export function BuilderProvider({
  projectId,
  initialPrompt,
  initialAiModel,
  children,
}: {
  projectId: string;
  initialPrompt?: string;
  /** The project's saved model selection (null = never chosen → app default). */
  initialAiModel?: string | null;
  children: ReactNode;
}) {
  // State starts empty so the first client render matches the server-rendered
  // HTML (no hydration mismatch). The saved session is restored in an effect
  // after mount — see below.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pages, setPages] = useState<PageState[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [themeCss, setThemeCss] = useState('');
  // The model this project generates with. Mirrored in a ref so the streaming
  // request reads the latest value without re-creating `sendMessage`.
  const [aiModel, setAiModelState] = useState<AIModelId>(() => resolveAIModel(initialAiModel));
  const aiModelRef = useRef<AIModelId>(resolveAIModel(initialAiModel));
  const [isStreaming, setIsStreaming] = useState(false);
  const [generatingPageId, setGeneratingPageId] = useState<string | null>(null);
  const [isImageGenerating, setIsImageGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // Save-state surfaced to the UI so a failed persist is never silent.
  const [saveError, setSaveError] = useState(false);
  // Mirror for non-reactive reads inside async callbacks.
  const stateSaveErrorRef = useRef(false);
  const updateSaveError = useCallback((failed: boolean) => {
    stateSaveErrorRef.current = failed;
    setSaveError(failed);
  }, []);
  const [saving, setSaving] = useState(false);
  // Revision history (AGENTS.md §8): newest first.
  const [revisions, setRevisions] = useState<RevisionInfo[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);

  // Mirror of state read inside the async streaming loop (avoids stale closures).
  const stateRef = useRef({ messages, pages, activePageId });
  useEffect(() => {
    stateRef.current = { messages, pages, activePageId };
  }, [messages, pages, activePageId]);

  const kickedOff = useRef(false);
  const hydratedRef = useRef(false);

  // Persistence bookkeeping (see the persist effect below).
  const persistedMessageCountRef = useRef(0); // messages already written to the DB
  const pagesDirtyRef = useRef(false); // a page changed this turn and needs saving
  const erroredRef = useRef(false); // the current turn hit an error
  const persistArmedRef = useRef(false); // a completed turn is waiting to be persisted
  // The project's global theme: kept in a ref so the streaming request can read
  // it without re-subscribing, plus a dirty flag for persistence.
  const themeRef = useRef<{ css: string; styleGuide: string } | null>(null);
  const themeDirtyRef = useRef(false);
  // HTML last rasterized into the project's preview thumbnail — so an unchanged
  // page never triggers a redundant re-capture.
  const lastThumbnailHtmlRef = useRef<string | null>(null);
  // Capture a revision snapshot before a new turn changes the build, so every
  // accepted change is reversible (AGENTS.md §8). A ref keeps the snapshot
  // handoff between the pre-turn hook and the post-turn persist.
  const preTurnSnapshotRef = useRef<RevisionPageSnapshot[] | null>(null);

  // Load this project's saved pages + chat once, after mount. The database is the
  // source of truth across sessions; a same-session sessionStorage snapshot is
  // only a fallback (e.g. a reload mid-generation, before the turn was saved).
  // Setting state from async here is intentional; initial state is empty so SSR
  // hydration stays consistent.
  useEffect(() => {
    let active = true;

    const finish = () => {
      if (!active) return;
      hydratedRef.current = true;
      setHydrated(true);
    };

    (async () => {
      // Re-sync the model selection with this project. The provider only mounts
      // once the project has loaded, so this normally matches the initial value —
      // it matters when navigating straight from one editor to another, where the
      // component is reused and the previous project's choice would linger.
      const resolvedModel = resolveAIModel(initialAiModel);
      aiModelRef.current = resolvedModel;
      setAiModelState(resolvedModel);

      try {
        const [dbPages, dbMessages, dbTheme] = await Promise.all([
          getProjectPages(projectId),
          getProjectMessages(projectId),
          getProjectTheme(projectId),
        ]);
        if (!active) return;

        // Restore the project's global theme (if any) so every page renders with
        // the shared design system, and the next turn reuses it.
        if (dbTheme) {
          themeRef.current = { css: dbTheme.css, styleGuide: dbTheme.style_guide };
          setThemeCss(dbTheme.css);
        }

        if (dbPages.length > 0 || dbMessages.length > 0) {
          const loadedPages: PageState[] = dbPages.map((row) => ({
            id: row.page_key,
            label: row.label,
            type: row.type,
            path: row.path,
            html: row.html,
            status: row.html ? 'ready' : 'idle',
          }));
          const loadedMessages: ChatMessage[] = dbMessages.map((row) => ({
            id: newId(),
            role: row.role,
            content: row.content,
          }));
          setMessages(loadedMessages);
          setPages(loadedPages);
          setActivePageId(loadedPages[0]?.id ?? null);
          persistedMessageCountRef.current = loadedMessages.length;
          kickedOff.current = true; // a saved project must not re-run its founding prompt
          finish();
          return;
        }
      } catch {
        // Fall through to the sessionStorage fallback below.
      }

      if (!active) return;
      const snapshot = readSnapshot(projectId);
      if (snapshot) {
        setMessages(snapshot.messages);
        setPages(snapshot.pages);
        setActivePageId(snapshot.activePageId);
        kickedOff.current = snapshot.kickedOff;
      }
      finish();
    })();

    return () => {
      active = false;
    };
  }, [projectId, initialAiModel]);

  // Persist the session — but only after hydration, so we never overwrite a
  // saved session with the empty initial state.
  useEffect(() => {
    if (!hydratedRef.current) return;
    writeSnapshot(projectId, {
      messages,
      pages,
      activePageId,
      kickedOff: kickedOff.current,
    });
  }, [projectId, messages, pages, activePageId]);

  const abortRef = useRef<AbortController | null>(null);
  // Accumulated raw HTML per streaming page + a throttled flush to the preview.
  const rawHtmlRef = useRef<Record<string, string>>({});
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Debounced DB writes for inline edits, so dragging a style slider persists
  // once it settles instead of on every input event.
  const editPersistTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const sendMessage = useCallback((text: string, options?: SendMessageOptions) => {
    const content = text.trim();
    if (!content || abortRef.current) return;

    const priorMessages = stateRef.current.messages;
    const outgoing = [...priorMessages, { role: 'user' as const, content }];
    const isImageEditRequest = options?.source === 'image-edit';

    // Snapshot the current build BEFORE the turn can change it, so the change
    // is reversible (AGENTS.md §8: every accepted edit creates a revision).
    preTurnSnapshotRef.current = stateRef.current.pages.map((p, i) => ({
      pageKey: p.id,
      label: p.label,
      type: p.type,
      path: p.path,
      html: p.html,
      status: p.status,
      position: i,
    }));

    const assistantId = newId();
    erroredRef.current = false;
    setError(null);
    setIsImageGenerating(isImageEditRequest);
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: 'user', content },
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const updateAssistant = (updater: (text: string) => string) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: updater(m.content) } : m))
      );

    (async () => {
      try {
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({
            messages: outgoing.map(({ role, content }) => ({ role, content })),
            pages: stateRef.current.pages.map(({ id, label, type, path }) => ({ id, label, type, path })),
            activePageId: stateRef.current.activePageId,
            // Send only the open page's HTML so a scoped edit can target its
            // existing ids without regenerating the whole page.
            activePageHtml:
              stateRef.current.pages.find((p) => p.id === stateRef.current.activePageId)?.html ?? null,
            // The project's shared theme (if generated). Lets the server reuse the
            // same design system and skip regenerating it.
            theme: themeRef.current,
            // The project's model choice; the server validates it against the
            // curated catalog before use.
            model: aiModelRef.current,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Request failed (${res.status}).`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = createEventParser();

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const event of parser.push(decoder.decode(value, { stream: true }))) {
            switch (event.type) {
              case 'message':
                updateAssistant(() => event.text);
                break;
              case 'theme':
                // Store the project's global stylesheet; it applies to every page.
                themeRef.current = { css: event.css, styleGuide: event.styleGuide };
                themeDirtyRef.current = true;
                setThemeCss(event.css);
                break;
              case 'plan':
                pagesDirtyRef.current = true;
                setPages((prev) => mergePages(prev, event.pages));
                break;
              case 'page_start':
                pagesDirtyRef.current = true;
                rawHtmlRef.current[event.page.id] = '';
                setPages((prev) =>
                  mergePages(prev, [event.page]).map((p) =>
                    p.id === event.page.id ? { ...p, status: 'generating', html: '' } : p
                  )
                );
                setActivePageId(event.page.id);
                setGeneratingPageId(event.page.id);
                break;
              case 'page_delta': {
                const pageId = event.pageId;
                rawHtmlRef.current[pageId] = (rawHtmlRef.current[pageId] ?? '') + event.chunk;
                // Throttle preview updates (~8/sec) so we sanitize + re-render a
                // handful of times, not once per streamed token.
                if (flushTimerRef.current == null) {
                  flushTimerRef.current = setTimeout(() => {
                    flushTimerRef.current = null;
                    const html = sanitizeGeneratedHtml(rawHtmlRef.current[pageId] ?? '');
                    setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, html } : p)));
                  }, 120);
                }
                break;
              }
              case 'page_end': {
                if (flushTimerRef.current != null) {
                  clearTimeout(flushTimerRef.current);
                  flushTimerRef.current = null;
                }
                delete rawHtmlRef.current[event.pageId];
                setPages((prev) =>
                  prev.map((p) =>
                    p.id === event.pageId ? { ...p, html: event.html, status: 'ready' } : p
                  )
                );
                setGeneratingPageId(null);
                break;
              }
              case 'page_patch': {
                // Scoped edit: apply the operations to the existing page HTML in
                // place, so unrelated sections are preserved (no regeneration).
                const pageId = event.pageId;
                pagesDirtyRef.current = true;
                setPages((prev) =>
                  prev.map((p) =>
                    p.id === pageId
                      ? {
                          ...p,
                          html: sanitizeGeneratedHtml(applyPatchOperations(p.html, event.operations)),
                          status: 'ready',
                        }
                      : p
                  )
                );
                setActivePageId(pageId);
                break;
              }
              case 'error':
                erroredRef.current = true;
                setError(event.message);
                updateAssistant((t) => t || 'Something went wrong while generating.');
                break;
              case 'done':
                break;
            }
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          erroredRef.current = true;
          setError(err instanceof Error ? err.message : 'Generation failed.');
          updateAssistant((t) => t || 'Something went wrong. Please try again.');
        }
      } finally {
        // Arm persistence only for a clean turn; the persist effect saves the
        // final committed state once streaming stops.
        persistArmedRef.current = !controller.signal.aborted && !erroredRef.current;
        abortRef.current = null;
        setIsStreaming(false);
        setIsImageGenerating(false);
        setGeneratingPageId(null);
      }
    })();
  }, []);

  // Persist a completed turn to the database: append any not-yet-saved chat
  // messages and upsert changed pages. Only one page/message set is written per
  // turn, so a small edit saves just the page it touched — never the whole
  // project (AGENTS.md §8).
  const persistTurn = useCallback(
    async (currentPages: PageState[], currentMessages: ChatMessage[]) => {
      let snapshot: RevisionPageSnapshot[] | null = null;
      try {
        setSaving(true);

        // Save the project's global theme first, so pages that reference its
        // shared classes are never persisted ahead of the stylesheet itself.
        if (themeDirtyRef.current && themeRef.current) {
          themeDirtyRef.current = false;
          await saveTheme(projectId, themeRef.current);
        }

        const alreadySaved = persistedMessageCountRef.current;
        const newMessages = currentMessages.slice(alreadySaved);
        if (newMessages.length > 0) {
          await appendMessages(
            projectId,
            newMessages.map((m, i) => ({
              role: m.role,
              content: m.content,
              position: alreadySaved + i,
            }))
          );
          persistedMessageCountRef.current = alreadySaved + newMessages.length;
        }

        if (pagesDirtyRef.current) {
          pagesDirtyRef.current = false;
          await Promise.all(
            currentPages.map((p, i) =>
              savePage(projectId, {
                pageKey: p.id,
                label: p.label,
                type: p.type,
                path: p.path,
                html: p.html,
                status: p.status,
                position: i,
              })
            )
          );

          // The build changed — capture the pre-turn snapshot as a revision so
          // the user can undo (AGENTS.md §8). Best-effort: a failed revision
          // never blocks persistence of the pages themselves.
          snapshot = preTurnSnapshotRef.current;
          preTurnSnapshotRef.current = null;
          if (snapshot && snapshot.length >= 0) {
            try {
              const row = await createProjectRevision(projectId, {
                label: newMessages.find((m) => m.role === 'user')?.content.slice(0, 80) ?? 'Update',
                pages: snapshot,
              });
              setRevisions((prev) =>
                [
                  { id: row.id, label: row.label, createdAt: row.created_at },
                  ...prev,
                ].slice(0, 30)
              );
            } catch {
              // Revision history is a safety net, not a hard dependency.
            }
          }
        }

        updateSaveError(false);
      } catch {
        // Surface the failure instead of swallowing it — the user must know
        // their work is only in-memory until a save succeeds.
        updateSaveError(true);
      } finally {
        setSaving(false);
      }

      // Refresh the project's card thumbnail from the home (or first ready) page
      // once a turn settles. Fully best-effort and non-blocking — a capture
      // failure never affects generation or persistence (AGENTS.md §8).
      const previewPage =
        currentPages.find((p) => p.type === 'home' && p.status === 'ready' && p.html.trim()) ??
        currentPages.find((p) => p.status === 'ready' && p.html.trim());
      if (previewPage && previewPage.html !== lastThumbnailHtmlRef.current) {
        lastThumbnailHtmlRef.current = previewPage.html;
        void captureAndSaveThumbnail(projectId, previewPage.html, themeRef.current?.css ?? '');
      }
    },
    [projectId, updateSaveError]
  );

  // When a turn finishes streaming, save the final committed state. Runs after
  // `isStreaming` flips false, so `pages`/`messages` are fully up to date.
  useEffect(() => {
    if (isStreaming || !persistArmedRef.current) return;
    persistArmedRef.current = false;
    void persistTurn(pages, messages);
  }, [isStreaming, pages, messages, persistTurn]);

  // Auto-send the project's founding prompt exactly once — after the saved
  // session has been restored, so a completed project doesn't re-generate.
  useEffect(() => {
    if (!hydrated || kickedOff.current) return;
    if (initialPrompt && initialPrompt.trim()) {
      kickedOff.current = true;
      sendMessage(initialPrompt);
    }
  }, [hydrated, initialPrompt, sendMessage]);

  // Inline edits from the sandboxed preview: the iframe owns the DOM and posts
  // back the whole edited body. Sanitize it (same pipeline as generated/patch
  // HTML — AGENTS.md §9), update state, and persist just this one page.
  const updatePageHtml = useCallback(
    (pageId: string, html: string): string => {
      const clean = sanitizeGeneratedHtml(html);
      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, html: clean, status: 'ready' } : p))
      );

      const timers = editPersistTimersRef.current;
      if (timers[pageId]) clearTimeout(timers[pageId]);
      timers[pageId] = setTimeout(() => {
        delete timers[pageId];
        const page = stateRef.current.pages.find((p) => p.id === pageId);
        if (!page) return;
        const index = stateRef.current.pages.findIndex((p) => p.id === pageId);
        void savePage(projectId, {
          pageKey: page.id,
          label: page.label,
          type: page.type,
          path: page.path,
          html: clean,
          status: 'ready',
          position: index < 0 ? 0 : index,
        }).catch(() => {});
      }, 600);

      return clean;
    },
    [projectId]
  );

  const setActivePage = useCallback((id: string) => setActivePageId(id), []);

  // Switch the project's AI model. Optimistic so the very next message uses the
  // new model, and reverted if the save fails — the picker must never claim a
  // model that isn't actually persisted on the project.
  const setAiModel = useCallback(
    async (id: string): Promise<boolean> => {
      const next = resolveAIModel(id);
      const previous = aiModelRef.current;
      if (next === previous) return true;

      aiModelRef.current = next;
      setAiModelState(next);

      try {
        await saveProjectAIModel(projectId, next);
        return true;
      } catch {
        aiModelRef.current = previous;
        setAiModelState(previous);
        return false;
      }
    },
    [projectId]
  );

  // Force-save the current state right now (the editor's Save button). Persists
  // theme, chat, pages, and the thumbnail — the same path as the automatic
  // post-turn save — and reports whether it fully succeeded.
  const saveNow = useCallback(async (): Promise<boolean> => {
    if (stateRef.current.pages.length === 0 && stateRef.current.messages.length === 0) {
      return true; // nothing to save
    }
    pagesDirtyRef.current = true;
    try {
      await persistTurn(stateRef.current.pages, stateRef.current.messages);
      // persistTurn flips saveError on failure; read the latest flag from a
      // state snapshot rather than adding it as a dependency (it would change
      // identity on every save and re-create this callback mid-flight).
      return !stateSaveErrorRef.current;
    } catch {
      return false;
    }
  }, [persistTurn]);

  // Snapshot the current pages as a manual revision ("Save version").
  const captureRevision = useCallback(
    (label: string) => {
      const snapshot: RevisionPageSnapshot[] = stateRef.current.pages.map((p, i) => ({
        pageKey: p.id,
        label: p.label,
        type: p.type,
        path: p.path,
        html: p.html,
        status: p.status,
        position: i,
      }));
      if (snapshot.length === 0) return;
      void createProjectRevision(projectId, { label, pages: snapshot })
        .then((row) => {
          setRevisions((prev) =>
            [{ id: row.id, label: row.label, createdAt: row.created_at }, ...prev].slice(0, 30)
          );
        })
        .catch(() => {
          // Best-effort — the snapshot still lives in the page state.
        });
    },
    [projectId]
  );

  const applyRestoredPages = useCallback((snapshot: RevisionPageSnapshot[]) => {
    const restored: PageState[] = snapshot.map((p) => ({
      id: p.pageKey,
      label: p.label,
      type: p.type,
      path: p.path,
      html: p.html,
      status: p.html ? 'ready' : 'idle',
    }));
    setPages(restored);
    setActivePageId((current) =>
      restored.some((p) => p.id === current) ? current : restored[0]?.id ?? null
    );
  }, []);

  // Restore a specific revision: rewrites the saved pages, refreshes history.
  const restoreRevision = useCallback(
    async (id: string): Promise<boolean> => {
      if (isStreaming || isRestoring) return false;
      setIsRestoring(true);
      try {
        // First snapshot the CURRENT state, so the restore itself is reversible.
        const currentSnapshot: RevisionPageSnapshot[] = stateRef.current.pages.map((p, i) => ({
          pageKey: p.id,
          label: p.label,
          type: p.type,
          path: p.path,
          html: p.html,
          status: p.status,
          position: i,
        }));
        if (currentSnapshot.length > 0) {
          try {
            await createProjectRevision(projectId, {
              label: 'Before restore',
              pages: currentSnapshot,
            });
          } catch {
            // Non-fatal.
          }
        }

        // Pull the full revision (list responses may be trimmed) and apply it.
        const all = await getProjectRevisions(projectId);
        const target = all.find((r) => r.id === id);
        if (!target || !Array.isArray(target.pages)) {
          return false;
        }
        await restoreRevisionData(projectId, target.pages);
        applyRestoredPages(target.pages);

        const history = all.map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at }));
        setRevisions(history);
        updateSaveError(false);
        return true;
      } catch {
        updateSaveError(true);
        return false;
      } finally {
        setIsRestoring(false);
      }
    },
    [projectId, isStreaming, isRestoring, applyRestoredPages, updateSaveError]
  );

  // Undo: restore the newest revision (the pre-last-turn state).
  const undo = useCallback(async (): Promise<boolean> => {
    if (isStreaming || isRestoring || revisions.length === 0) return false;
    return restoreRevision(revisions[0].id);
  }, [isStreaming, isRestoring, revisions, restoreRevision]);

  // Load the revision history once on mount (for the undo popover).
  useEffect(() => {
    let active = true;
    void getProjectRevisions(projectId)
      .then((rows) => {
        if (!active) return;
        setRevisions(
          rows.map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at }))
        );
      })
      .catch(() => {
        // History is optional UI — the builder works without it.
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  const closePage = useCallback(
    (id: string) => {
      setPages((prev) => {
        const next = prev.filter((p) => p.id !== id);
        setActivePageId((current) => (current === id ? next[0]?.id ?? null : current));
        return next;
      });
      // Remove the tab from the project permanently.
      void deletePage(projectId, id).catch(() => {});
    },
    [projectId]
  );

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (flushTimerRef.current != null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    rawHtmlRef.current = {};
    kickedOff.current = true; // don't re-fire the initial prompt after a reset
    persistArmedRef.current = false; // don't persist the cleared state as a turn
    persistedMessageCountRef.current = 0;
    pagesDirtyRef.current = false;
    themeRef.current = null;
    themeDirtyRef.current = false;
    lastThumbnailHtmlRef.current = null;
    setMessages([]);
    setPages([]);
    setActivePageId(null);
    setThemeCss('');
    setGeneratingPageId(null);
    setIsImageGenerating(false);
    setError(null);
    setIsStreaming(false);
    writeSnapshot(projectId, {
      messages: [],
      pages: [],
      activePageId: null,
      kickedOff: true,
    });
    // Wipe the saved project so a fresh build starts clean.
    void Promise.all([
      clearMessages(projectId),
      clearPages(projectId),
      clearTheme(projectId),
    ]).catch(() => {});
  }, [projectId]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (flushTimerRef.current != null) clearTimeout(flushTimerRef.current);
      Object.values(editPersistTimersRef.current).forEach(clearTimeout);
    },
    []
  );

  const activePage = useMemo(
    () => pages.find((p) => p.id === activePageId) ?? null,
    [pages, activePageId]
  );

  const value: BuilderContextValue = {
    messages,
    pages,
    activePageId,
    activePage,
    themeCss,
    styleGuide: themeRef.current?.styleGuide ?? null,
    aiModel,
    setAiModel,
    isStreaming,
    generatingPageId,
    isImageGenerating,
    error,
    sendMessage,
    setActivePage,
    closePage,
    updatePageHtml,
    newChat,
    saveNow,
    saveError,
    saving,
    revisions,
    isRestoring,
    captureRevision,
    undo,
    restoreRevision,
  };

  return <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>;
}
