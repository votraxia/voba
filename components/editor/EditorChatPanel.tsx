'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Loader2, Plus, Sparkles } from 'lucide-react';
import { useBuilder } from './BuilderContext';

export default function EditorChatPanel() {
  const { messages, pages, isStreaming, generatingPageId, error, sendMessage, newChat } = useBuilder();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const generatingPage = pages.find((p) => p.id === generatingPageId) ?? null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, generatingPageId]);

  function submit() {
    if (!draft.trim() || isStreaming) return;
    sendMessage(draft);
    setDraft('');
  }

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-line bg-card lg:w-[360px] max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-30">
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <button
          onClick={newChat}
          className="flex items-center gap-2 text-[15px] font-semibold text-accent-text transition hover:text-accent-hover"
        >
          <Plus size={18} strokeWidth={2.2} />
          New chat
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 pb-6">
        <p className="text-xs font-medium text-muted">Today</p>

        {messages.length === 0 && !isStreaming && (
          <div className="flex gap-3">
            <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text">
              <Sparkles size={14} fill="currentColor" strokeWidth={1.5} />
            </span>
            <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-line bg-card px-4 py-3 text-sm leading-6 text-fg-2">
              Describe the storefront you want and I&apos;ll build it page by page.
            </div>
          </div>
        )}

        {messages.map((message) => {
          if (message.role === 'user') {
            return (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-accent-soft px-4 py-3 text-sm leading-6 text-accent-fg">
                  {message.content}
                </div>
              </div>
            );
          }
          return (
            <div key={message.id} className="flex gap-3">
              <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text">
                <Sparkles size={14} fill="currentColor" strokeWidth={1.5} />
              </span>
              <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-line bg-card px-4 py-3 text-sm leading-6 text-fg-2">
                {message.content ? (
                  <span className="whitespace-pre-wrap">{message.content}</span>
                ) : (
                  <span className="inline-flex gap-1 py-1">
                    <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {generatingPage && (
          <div className="rounded-2xl border border-line bg-app p-4">
            <div className="flex items-center gap-3 text-sm">
              <span className="grid h-5 w-5 shrink-0 place-items-center text-muted">
                <Loader2 size={15} strokeWidth={2} className="animate-spin" />
              </span>
              <span className="font-medium text-fg-2">
                Generating the {generatingPage.label}…
              </span>
            </div>
            {generatingPage.html && (
              <p className="mt-2 pl-8 text-xs text-muted">
                Streaming sections into the live preview →
              </p>
            )}
          </div>
        )}

        {pages.some((p) => p.status === 'ready') && !isStreaming && (
          <div className="flex items-center gap-2 pl-9 text-xs font-medium text-success">
            <Check size={13} strokeWidth={2.6} /> Preview updated
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-line p-4">
        <div className="rounded-2xl border border-line bg-card p-3 shadow-[0_10px_24px_rgba(31,41,55,0.05)]">
          <textarea
            aria-label="Ask anything about your theme"
            placeholder="Ask anything about your theme..."
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={isStreaming}
            className="w-full resize-none border-0 bg-transparent px-1 py-1 text-sm text-fg outline-none placeholder:text-muted disabled:opacity-60"
          />
          <div className="flex items-center justify-end pt-1">
            <button
              aria-label="Send message"
              onClick={submit}
              disabled={isStreaming || !draft.trim()}
              className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-fg shadow-[0_10px_18px_rgba(255,103,71,0.22)] transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStreaming ? (
                <Loader2 size={17} strokeWidth={2.2} className="animate-spin" />
              ) : (
                <ArrowUp size={18} strokeWidth={2.2} />
              )}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Dot({ delay = '0ms' }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#c5bfd8]"
      style={{ animationDelay: delay }}
    />
  );
}
