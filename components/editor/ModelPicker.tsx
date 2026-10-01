'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Lock, Sparkles } from 'lucide-react';
import { useBuilder } from './BuilderContext';
import { useSubscription } from '@/components/billing/SubscriptionProvider';
import UpgradeDialog from '@/components/billing/UpgradeDialog';
import {
  AI_MODELS,
  DEFAULT_AI_MODEL,
  getAIModelLabel,
  isPremiumAIModel,
} from '@/lib/ai/models';

/**
 * Per-project AI model picker.
 *
 * Lives in the editor top bar so the active model is always visible (AGENTS.md
 * §16) while staying a single compact control — the editor should not be crowded
 * with options. Changing the model affects the NEXT generation or edit; already
 * generated pages are never regenerated, which is why the popover says so.
 *
 * The choice is persisted on the project (so it follows the project across
 * sessions) and reported back by the server as failed if that save doesn't land.
 *
 * Premium models are Pro-only. They stay visible (hiding them would just make
 * the product look worse) but are locked, and clicking one opens the upgrade
 * dialog instead of silently failing. This is a convenience layer only — the
 * API re-checks the plan, so the lock is never the thing enforcing access.
 */
export default function ModelPicker() {
  const { aiModel, setAiModel, isStreaming } = useBuilder();
  const { entitlement } = useSubscription();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Treat "entitlement not loaded yet" as Free so a premium model is never
  // selectable on a first paint before the server has answered. The API
  // enforces the real answer either way.
  const isPaid = entitlement?.isPaid ?? false;
  // A project generated on a paid plan can hold a premium model after a
  // downgrade; the API will swap it back, so reflect that here rather than
  // showing a locked model as if it were active.
  const activeModel = isPaid || !isPremiumAIModel(aiModel) ? aiModel : null;
  const lockedModel = !activeModel ? aiModel : null;

  // Close on an outside click or Escape, matching the other top-bar popovers.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function choose(id: string) {
    if (id === activeModel || saving !== null) return;
    // Locked model → offer the upgrade instead of a save that the API would
    // silently undo. Same pattern as the export gate in EditorTopBar.
    if (isPremiumAIModel(id) && !isPaid) {
      setUpgradeOpen(true);
      return;
    }
    setError('');
    setSaving(id);
    const saved = await setAiModel(id);
    setSaving(null);
    if (saved) {
      setOpen(false);
    } else {
      setError("Couldn't save your model choice. Please try again.");
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        disabled={isStreaming}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`AI model: ${getAIModelLabel(activeModel ?? lockedModel ?? aiModel)}`}
        title={
          isStreaming
            ? 'Wait for the current generation to finish to change the model'
            : lockedModel
              ? `${getAIModelLabel(lockedModel)} is a Pro model — upgrade to use it`
              : `AI model: ${getAIModelLabel(activeModel ?? aiModel)}`
        }
        className="flex h-11 items-center gap-2 rounded-xl border border-[#e8e2de] bg-white px-3 text-sm font-medium text-[#111827] shadow-[0_8px_20px_rgba(31,41,55,0.04)] transition hover:bg-[#fff8f5] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {lockedModel ? (
          <Lock size={16} strokeWidth={2} className="shrink-0 text-[#9aa2af]" />
        ) : (
          <Sparkles size={17} strokeWidth={1.9} className="shrink-0 text-[#ff6747]" />
        )}
        <span className="hidden max-w-[8.5rem] truncate lg:block">
          {getAIModelLabel(activeModel ?? aiModel)}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2}
          className={`shrink-0 text-[#9aa2af] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 overflow-hidden rounded-2xl border border-[#eee7e3] bg-white p-2 shadow-[0_24px_48px_rgba(31,41,55,0.14)]">
          <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#9aa2af]">
            AI model
          </p>
          <p className="px-3 pb-2 text-[11px] leading-relaxed text-[#9aa2af]">
            Used for this project&apos;s next generation or edit. Existing pages stay as they are.
          </p>
          {lockedModel && (
            <p className="mb-2 rounded-lg bg-[#fff7e7] px-3 py-2 text-[11px] leading-snug text-[#8a5b06]">
              {getAIModelLabel(lockedModel)} is a Pro model. Your next generation will use{' '}
              {getAIModelLabel(DEFAULT_AI_MODEL)} until you upgrade.
            </p>
          )}

          <ul role="listbox" aria-label="AI model" className="space-y-0.5">
            {AI_MODELS.map((model) => {
              const active = model.id === activeModel;
              const locked = model.premium && !isPaid;
              return (
                <li key={model.id}>
                  <button
                    role="option"
                    aria-selected={active}
                    aria-disabled={locked && !active}
                    onClick={() => void choose(model.id)}
                    disabled={saving !== null}
                    className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition disabled:cursor-not-allowed ${
                      active ? 'bg-[#fff3ef]' : 'hover:bg-[#fff8f5]'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-semibold text-[#111827]">
                          {model.label}
                        </span>
                        <span className="shrink-0 rounded-md bg-[#f0e9ff] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6b52c9]">
                          {model.provider}
                        </span>
                        {model.premium && (
                          <span
                            title="Pro model"
                            className="flex shrink-0 items-center gap-1 rounded-md bg-[#fff3ef] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#e14a24]"
                          >
                            <Lock size={9} strokeWidth={2.6} />
                            Pro
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-[#6b7280]">
                        {model.description}
                      </span>
                    </span>

                    {saving === model.id ? (
                      <Loader2 size={15} strokeWidth={2} className="mt-0.5 shrink-0 animate-spin text-[#ff6747]" />
                    ) : active ? (
                      <Check size={15} strokeWidth={2.6} className="mt-0.5 shrink-0 text-[#ff6747]" />
                    ) : locked ? (
                      <Lock size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-[#c9c0b8]" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          {error && (
            <p className="px-3 pb-2 pt-1 text-[11px] font-medium text-[#c0432f]">{error}</p>
          )}
        </div>
      )}

      <UpgradeDialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Premium models are a Pro feature"
        description="Unlock GPT-5, Claude Sonnet and Gemini Pro — plus unlimited projects and Shopify theme export."
      />
    </div>
  );
}
