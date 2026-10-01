import 'server-only';
import type { AIProvider } from './types';
import { createCometApiProvider } from './providers/cometapi';
import { DEFAULT_AI_MODEL } from './models';

/**
 * AI provider factory. Reads the active provider and model from the environment
 * (AGENTS.md §7) so the app stays provider-independent and no model name is
 * hardcoded into feature code.
 *
 *   AI_PROVIDER  — "cometapi" (default). Add more cases as adapters are built.
 *   AI_MODEL     — deployment-level default model id for the active provider.
 *
 * CometAPI (https://www.cometapi.com) proxies 500+ models — Gemini, GPT, Claude,
 * DeepSeek and more — through one OpenAI-compatible endpoint and one key, so a
 * different model is an env change, not a code change.
 *
 * A caller may pass a per-project model (the builder's model picker does). It is
 * validated against the curated catalog by the request schema before it reaches
 * here; `AI_MODEL` stays the fallback for requests that don't specify one.
 *
 * Clients are cached per provider+model and reused — building a fresh client per
 * request wastes time and connections, and switching models is just a different
 * entry in this small map.
 */

const cached = new Map<string, AIProvider>();

export function getAIProvider(modelOverride?: string | null): AIProvider {
  const provider = (process.env.AI_PROVIDER ?? 'cometapi').toLowerCase();
  const model = modelOverride ?? process.env.AI_MODEL ?? DEFAULT_AI_MODEL;
  const cacheKey = `${provider}:${model}`;

  const existing = cached.get(cacheKey);
  if (existing) return existing;

  let instance: AIProvider;
  switch (provider) {
    case 'cometapi':
      instance = createCometApiProvider(model);
      break;
    case 'gemini':
      // Kept as an explicit hint so a stale .env.local fails with an actionable
      // message instead of a generic "unsupported provider".
      throw new Error(
        'AI_PROVIDER=gemini is no longer supported. The Google adapter was replaced by CometAPI — set AI_PROVIDER=cometapi and COMETAPI_KEY in .env.local.'
      );
    default:
      throw new Error(
        `Unsupported AI_PROVIDER "${provider}". Set AI_PROVIDER=cometapi in .env.local.`
      );
  }

  cached.set(cacheKey, instance);
  return instance;
}

export type { AIProvider } from './types';
