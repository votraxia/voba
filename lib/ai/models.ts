/**
 * The curated catalog of AI models a project can generate with.
 *
 * CometAPI exposes 500+ models, but offering all of them would be a UX and
 * support liability — many are image/audio/reasoning-only, have tiny context
 * windows, or are extremely expensive. This is a hand-picked, verified list of
 * text models that are good at producing structured JSON and large HTML
 * documents, which is exactly what the builder asks a model to do.
 *
 * Keep this module isomorphism-safe: it is imported by client components (the
 * model picker), client export code, and server route schemas.
 *
 * Behaviour note: the picker always sends an explicit model, so a project's
 * selection is fully predictable. The `AI_MODEL` environment variable remains
 * the deployment-level default and is used for any request that omits a model.
 *
 * Premium models are gated on a paid plan. The flag lives here, next to the
 * catalog, so the picker (which locks the row), the API (which enforces it) and
 * the tests can never disagree about which models a Free user may run.
 */

/** Ordered ids — the single source of truth for what the API will accept. */
export const AI_MODEL_IDS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'claude-sonnet-4-5',
  'deepseek-v3.2',
  'gpt-5',
  'gpt-5-mini',
  'gpt-4o',
] as const;

export type AIModelId = (typeof AI_MODEL_IDS)[number];

export interface AIModelOption {
  id: AIModelId;
  /** Short name shown in the picker and on the picker button. */
  label: string;
  /** The lab behind the model, shown as a chip. */
  provider: string;
  /** One line explaining when to reach for this model. */
  description: string;
  /** Whether this model requires a paid plan. */
  premium: boolean;
}

/** The model a project uses until someone picks another one. */
export const DEFAULT_AI_MODEL: AIModelId = 'gemini-2.5-flash';

export const AI_MODELS = [
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'Google',
    description: 'Fast and inexpensive. The best default for everyday pages.',
    premium: false,
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'Google',
    description: 'More reasoning power for complex, section-heavy layouts.',
    premium: true,
  },
  {
    id: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    description: 'Strong design judgement and consistently clean markup.',
    premium: true,
  },
  {
    id: 'deepseek-v3.2',
    label: 'DeepSeek V3.2',
    provider: 'DeepSeek',
    description: 'Very low cost per page — a good budget option.',
    premium: false,
  },
  {
    id: 'gpt-5',
    label: 'GPT-5',
    provider: 'OpenAI',
    description: 'Highest-quality output when polish matters more than speed.',
    premium: true,
  },
  {
    id: 'gpt-5-mini',
    label: 'GPT-5 mini',
    provider: 'OpenAI',
    description: 'A faster, cheaper GPT-5 — good for quick edits.',
    premium: false,
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'OpenAI',
    description: 'A dependable, widely-used all-rounder.',
    premium: false,
  },
] as const satisfies readonly AIModelOption[];

const SUPPORTED_MODEL_IDS: ReadonlySet<string> = new Set(AI_MODEL_IDS);

/** Narrow an untrusted value (query/env/DB) to a supported model id. */
export function isSupportedAIModel(value: unknown): value is AIModelId {
  return typeof value === 'string' && SUPPORTED_MODEL_IDS.has(value);
}

/**
 * Resolve a stored/requested model to a usable one. Anything unknown — a stale
 * row from a retired model, a hand-edited value, a missing selection — falls
 * back to the default instead of failing generation.
 */
export function resolveAIModel(value: string | null | undefined): AIModelId {
  return isSupportedAIModel(value) ? value : DEFAULT_AI_MODEL;
}

/** Catalog entry for a model, if it is one we offer. */
export function getAIModelOption(id: string): AIModelOption | undefined {
  return AI_MODELS.find((model) => model.id === id);
}

/** Display name for a model id, falling back to the raw id. */
export function getAIModelLabel(id: string): string {
  return getAIModelOption(id)?.label ?? id;
}

/**
 * Whether a model is reserved for paid plans. An id outside the catalog is not
 * premium: it is rejected by the request schema long before this is consulted,
 * so treating it as free keeps this predicate total and side-effect free.
 */
export function isPremiumAIModel(id: string): boolean {
  return getAIModelOption(id)?.premium ?? false;
}

export interface ModelAccess {
  /** The model the request is actually allowed to run. */
  model: string;
  /** The premium model that was requested but is not available, if any. */
  downgradedFrom: AIModelId | null;
}

/**
 * Enforce the plan gate on an already-resolved model id.
 *
 * `model` is whatever would be sent to the provider — the request's catalog id,
 * or the `AI_MODEL` deployment default when the request named none. A Free user
 * asking for a premium model is silently moved to the default rather than
 * failed: a project that was built on a paid model must keep generating after a
 * downgrade, and a premium model must never run for a Free plan no matter which
 * code path reached the provider. Ids outside the catalog pass through
 * untouched, so a deployment default that isn't in the curated list still works.
 */
export function gateAIModelByPlan(model: string, isPaid: boolean): ModelAccess {
  if (isPaid || !isPremiumAIModel(model)) return { model, downgradedFrom: null };
  return { model: DEFAULT_AI_MODEL, downgradedFrom: model as AIModelId };
}
