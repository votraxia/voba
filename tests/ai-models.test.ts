import { describe, it, expect } from 'vitest';
import {
  AI_MODELS,
  AI_MODEL_IDS,
  DEFAULT_AI_MODEL,
  gateAIModelByPlan,
  getAIModelLabel,
  getAIModelOption,
  isPremiumAIModel,
  isSupportedAIModel,
  resolveAIModel,
} from '@/lib/ai/models';
import { aiRequestSchema, shopifySectionsRequestSchema } from '@/lib/ai/schema';

/**
 * The model catalog is the single source of truth for what the picker offers and
 * what the API accepts, so these tests guard the invariants that keep the two in
 * sync — and that an untrusted model id can never reach the provider.
 */

describe('AI model catalog', () => {
  it('labels every id in the ordered list (no orphaned ids)', () => {
    const labelled = new Set(AI_MODELS.map((model) => model.id));
    for (const id of AI_MODEL_IDS) {
      expect(labelled.has(id), `missing catalog entry for "${id}"`).toBe(true);
    }
    expect(AI_MODELS).toHaveLength(AI_MODEL_IDS.length);
  });

  it('offers the default model', () => {
    expect(AI_MODEL_IDS).toContain(DEFAULT_AI_MODEL);
    expect(getAIModelOption(DEFAULT_AI_MODEL)).toBeDefined();
  });

  it('has a unique id, label, provider and description for every model', () => {
    const ids = AI_MODELS.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const model of AI_MODELS) {
      expect(model.label.trim().length).toBeGreaterThan(0);
      expect(model.provider.trim().length).toBeGreaterThan(0);
      expect(model.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('leaves the default model free, so a Free plan can always generate', () => {
    // A premium default would make the gate lock every user out of their own
    // projects the moment a deployment pointed AI_MODEL at a paid model.
    expect(isPremiumAIModel(DEFAULT_AI_MODEL)).toBe(false);
  });

  it('offers at least one free and one premium model', () => {
    const premium = AI_MODELS.filter((model) => model.premium);
    expect(premium.length).toBeGreaterThan(0);
    expect(premium.length).toBeLessThan(AI_MODELS.length);
  });

  it('reports an id outside the catalog as not premium', () => {
    // The request schema rejects unknown ids long before this is consulted;
    // the predicate still has to answer safely rather than throw.
    expect(isPremiumAIModel('gpt-5-turbo-invented')).toBe(false);
    expect(isPremiumAIModel('')).toBe(false);
  });
});

describe('premium model gating', () => {
  const premium = AI_MODELS.find((model) => model.premium) as (typeof AI_MODELS)[number];
  const free = AI_MODELS.find((model) => !model.premium) as (typeof AI_MODELS)[number];

  it('lets a paid user run any catalog model', () => {
    expect(gateAIModelByPlan(premium.id, true)).toEqual({ model: premium.id, downgradedFrom: null });
    expect(gateAIModelByPlan(free.id, true)).toEqual({ model: free.id, downgradedFrom: null });
  });

  it('downgrades a premium model to the free default for a Free user', () => {
    const access = gateAIModelByPlan(premium.id, false);
    expect(access.model).toBe(DEFAULT_AI_MODEL);
    expect(isPremiumAIModel(access.model)).toBe(false);
    // The original is reported so the user can be told why quality changed.
    expect(access.downgradedFrom).toBe(premium.id);
  });

  it('never downgrades a free model', () => {
    expect(gateAIModelByPlan(free.id, false)).toEqual({ model: free.id, downgradedFrom: null });
  });

  it('downgrades every premium model in the catalog, not just the first', () => {
    for (const model of AI_MODELS.filter((m) => m.premium)) {
      expect(gateAIModelByPlan(model.id, false).model).toBe(DEFAULT_AI_MODEL);
    }
  });

  it('passes an unknown model through untouched', () => {
    // A deployment default that isn't in the curated catalog must keep working
    // rather than being silently swapped out by the gate.
    expect(gateAIModelByPlan('some-other-model', false)).toEqual({
      model: 'some-other-model',
      downgradedFrom: null,
    });
  });
});

describe('model resolution', () => {
  it('accepts known ids and rejects anything else', () => {
    expect(isSupportedAIModel('claude-sonnet-4-5')).toBe(true);
    expect(isSupportedAIModel('gpt-4o')).toBe(true);
    expect(isSupportedAIModel('gpt-5-turbo-invented')).toBe(false);
    expect(isSupportedAIModel('')).toBe(false);
    expect(isSupportedAIModel(null)).toBe(false);
    expect(isSupportedAIModel(42)).toBe(false);
  });

  it('falls back to the default for a missing or retired model', () => {
    expect(resolveAIModel('gemini-2.5-pro')).toBe('gemini-2.5-pro');
    expect(resolveAIModel(null)).toBe(DEFAULT_AI_MODEL);
    expect(resolveAIModel(undefined)).toBe(DEFAULT_AI_MODEL);
    expect(resolveAIModel('retired-model-id')).toBe(DEFAULT_AI_MODEL);
  });

  it('degrades a label lookup to the raw id instead of throwing', () => {
    expect(getAIModelLabel('gemini-2.5-flash')).toBe('Gemini 2.5 Flash');
    expect(getAIModelLabel('retired-model-id')).toBe('retired-model-id');
    expect(getAIModelOption('retired-model-id')).toBeUndefined();
  });
});

describe('request schemas constrain the model to the catalog', () => {
  const message = { role: 'user' as const, content: 'build me a store' };

  it('accepts a catalog model on /api/ai', () => {
    const parsed = aiRequestSchema.safeParse({ messages: [message], model: 'gpt-5' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.model).toBe('gpt-5');
  });

  it('accepts an omitted model (server falls back to AI_MODEL)', () => {
    const parsed = aiRequestSchema.safeParse({ messages: [message] });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.model).toBeUndefined();
  });

  it('rejects a model outside the catalog, so a client cannot name any model', () => {
    for (const model of ['gpt-5-turbo-ultra', 'claude-opus-4-8', '../../etc/passwd', '']) {
      expect(aiRequestSchema.safeParse({ messages: [message], model }).success).toBe(false);
    }
  });

  it('constrains the Shopify section conversion model too', () => {
    const sections = [
      {
        ref: 'content:home:hero',
        pageKey: 'home',
        pageType: 'home',
        pageLabel: 'Home',
        role: 'content',
        html: '<section>hi</section>',
      },
    ];
    expect(
      shopifySectionsRequestSchema.safeParse({ brandName: 'Roast', sections, model: 'gpt-4o' }).success
    ).toBe(true);
    expect(
      shopifySectionsRequestSchema.safeParse({ brandName: 'Roast', sections, model: 'nope' }).success
    ).toBe(false);
    expect(shopifySectionsRequestSchema.safeParse({ brandName: 'Roast', sections }).success).toBe(true);
  });
});
