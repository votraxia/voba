import 'server-only';
import type {
  AIProvider,
  PlanTurnInput,
  StreamPageInput,
  EditPageInput,
  GenerateThemeInput,
  ShopifySectionInput,
} from '../types';
import {
  turnPlanSchema,
  pagePatchSchema,
  themeSpecSchema,
  shopifySectionSpecSchema,
  type TurnPlan,
  type PagePatch,
  type ThemeSpec,
  type ShopifySectionSpec,
} from '../schema';
import {
  planTurnSystemPrompt,
  streamPageSystemPrompt,
  editPageSystemPrompt,
  themeSystemPrompt,
  shopifySectionSystemPrompt,
} from '../prompts';

/**
 * CometAPI adapter — https://www.cometapi.com (docs: https://apidoc.cometapi.com).
 *
 * CometAPI is a model aggregator that speaks the OpenAI `/v1/chat/completions`
 * protocol, so every call below is a plain `fetch` with a Bearer key. Keeping it
 * SDK-free means the same adapter drives the whole 500+ model catalog behind one
 * key — only the model id (AI_MODEL) changes. No provider SDK, no provider code
 * leaking out of this file (AGENTS.md §7/§17).
 *
 * Behaviour verified against the live API, which is what shapes this code:
 *
 * 1. `response_format: { type: 'json_object' }` is accepted but NOT enforced for
 *    every upstream model — `gemini-2.5-flash` still returned its JSON wrapped in
 *    a ```json fence. We therefore never trust that a completion is bare JSON:
 *    every structured call goes through `extractJsonObject` and then a Zod
 *    schema. We also don't bother sending `response_format`, since a model in the
 *    catalog that rejects the parameter would fail the whole request while buying
 *    us nothing.
 * 2. Streaming is standard OpenAI SSE: `data: {...}` lines carrying
 *    `choices[0].delta.content`, terminated by `data: [DONE]`. Reasoning models
 *    additionally emit `delta.reasoning_content`, which is deliberately ignored —
 *    only user-visible page markup should reach the preview.
 * 3. Upstream availability is not reliable. `claude-haiku-4-5` once accepted a
 *    request and then never answered, which would otherwise hang a generation
 *    forever. Every call therefore has a hard timeout, and transient failures
 *    (network errors, 429, 5xx) get exactly one retry. See `requestWithRetry`.
 */

/** Base URL from the CometAPI docs. Overridable for self-hosted/proxy setups. */
const DEFAULT_BASE_URL = 'https://api.cometapi.com/v1';

/**
 * How long a non-streaming call may take before we give up. Large page documents
 * stream for minutes, but the JSON-only calls (plan/theme/patch) should answer in
 * well under this; a request that hasn't by now is a hung upstream, not a slow
 * one.
 */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Timeout for establishing a streaming response. This covers time-to-first-byte
 * only — once tokens start flowing the caller's abort signal is the control. A
 * model that never sends its first token is the failure mode worth catching.
 */
const STREAM_TIMEOUT_MS = 90_000;

/** One retry, after a short pause. Enough to ride out a blip, not enough to
 *  double the wait on a genuinely dead endpoint. */
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 500;

/**
 * Timeouts, overridable per deployment. Some catalog models are dramatically
 * slower than the defaults (a large page on a reasoning model can take minutes
 * to first token), so an operator can raise them without a code change.
 */
function timeoutFor(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Per-call output ceilings. CometAPI accepts these for the text models. */
const MAX_TOKENS = {
  plan: 4096,
  theme: 8192,
  page: 32768,
  patch: 32768,
  shopify: 32768,
} as const;

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Tolerantly read a JSON object out of a model completion. Models behind the
 * aggregator variously return bare JSON, JSON in a Markdown fence, or a short
 * sentence followed by JSON, so we try each shape in turn and return null when
 * nothing parses (the caller then degrades gracefully instead of throwing).
 */
export function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Not this shape — try the next one.
    }
  }
  return null;
}

/** Pull `choices[0].message.content` out of a non-streaming completion. */
function completionText(json: unknown): string {
  const choices = (json as { choices?: { message?: { content?: unknown } }[] } | null)?.choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

/**
 * Extract the incremental text from one SSE line. Returns '' for blank lines,
 * the `[DONE]` sentinel, keep-alives, and any chunk carrying no visible content
 * (e.g. a reasoning delta), so the caller can simply skip falsy values.
 */
function sseChunkText(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return '';
  const payload = trimmed.slice('data:'.length).trim();
  if (!payload || payload === '[DONE]') return '';

  try {
    const parsed = JSON.parse(payload) as {
      choices?: { delta?: { content?: unknown } }[];
    };
    const content = parsed.choices?.[0]?.delta?.content;
    return typeof content === 'string' ? content : '';
  } catch {
    // Malformed line — skip it rather than aborting the whole stream.
    return '';
  }
}

/**
 * Per-model output ceilings we have already discovered, keyed by endpoint+model.
 * CometAPI rejects an over-large `max_tokens` outright ("max_tokens is too large:
 * 32768. This model supports at most 16384 completion tokens") instead of
 * clamping it, and the ceiling genuinely varies per model — gpt-4o allows
 * 16384 while Gemini accepts 32768. Remembering the limit means only the first
 * call for a given model pays for the discovery round-trip.
 */
const tokenCeilings = new Map<string, number>();

/** Pull a model's stated completion-token ceiling out of an error message. */
function parseTokenCeiling(detail: string): number | undefined {
  const match = detail.match(/at most (\d+) completion tokens/i);
  if (!match) return undefined;
  const limit = Number(match[1]);
  return Number.isFinite(limit) && limit > 0 ? limit : undefined;
}

/** Thrown when a call exceeded its timeout budget. Retried once, like a network blip. */
class RequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number, readonly model: string) {
    super(
      `${model} did not respond within ${Math.round(timeoutMs / 1000)}s. ` +
        'The model may be overloaded — please try again.'
    );
    this.name = 'RequestTimeoutError';
  }
}

/**
 * Combine the caller's abort signal with a hard timeout.
 *
 * The returned `dispose` MUST be called once the response is no longer being
 * awaited — for a streaming call that is when the stream ends, so a model that
 * accepts the request and then never sends a token still fails fast.
 */
function withTimeout(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; timedOut: () => boolean; dispose: () => void } {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onAbort);
    },
  };
}

/** Rate limits and upstream failures are worth one more try; 4xx are not. */
function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** A thrown error worth retrying: a network failure or a timed-out request. */
function isTransientError(err: unknown): boolean {
  if (err instanceof RequestTimeoutError) return true;
  // fetch rejects with a TypeError on DNS/socket failures; those are transient.
  return err instanceof TypeError;
}

/** Release a response we are not going to read, so the socket isn't held open. */
async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // Already closed / never opened — nothing to release.
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `attempt` up to `MAX_ATTEMPTS` times, retrying ONLY transient failures:
 * a thrown network/timeout error, or a 429/5xx response. A 4xx is the request's
 * own fault and repeating it just burns quota, and a caller abort means the user
 * already walked away, so neither is retried.
 */
async function withRetry<T>(
  attempt: () => Promise<T>,
  shouldRetry: (value: T) => boolean,
  callerSignal: AbortSignal | undefined
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (callerSignal?.aborted) throw callerSignal.reason ?? new Error('Request cancelled.');
    try {
      const value = await attempt();
      if (i < MAX_ATTEMPTS - 1 && shouldRetry(value)) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return value;
    } catch (err) {
      if (callerSignal?.aborted) throw callerSignal.reason ?? err;
      if (i === MAX_ATTEMPTS - 1 || !isTransientError(err)) throw err;
      lastError = err;
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastError ?? new Error('CometAPI request failed.');
}

/** A short, key-free description of a failed request (never echoes the key). */
async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => '');
  if (!body) return res.statusText || 'no response body';

  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown }; message?: unknown };
    const message =
      (typeof parsed.error?.message === 'string' && parsed.error.message) ||
      (typeof parsed.message === 'string' && parsed.message) ||
      null;
    if (message) return message.slice(0, 300);
  } catch {
    // Not JSON — fall through to the raw body.
  }
  return body.slice(0, 300);
}

interface ChatOptions {
  model: string;
  temperature: number;
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
  /** Overrides the per-call default (120s, or 90s to first byte when streaming). */
  timeoutMs?: number;
}

export function createCometApiProvider(model: string): AIProvider {
  const apiKey = process.env.COMETAPI_KEY;
  if (!apiKey) {
    throw new Error('COMETAPI_KEY is not set. Add it to .env.local.');
  }
  const baseUrl = (process.env.COMETAPI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const endpoint = `${baseUrl}/chat/completions`;

  /**
   * POST the completion under a timeout. The returned `dispose` releases the
   * timer; it must be called once the body is fully read (or discarded) so the
   * timer doesn't outlive the request. On a streaming call that is at the end
   * of the stream, which is exactly what makes "connected but silent" fail
   * fast instead of hanging the builder forever.
   */
  const post = async (
    messages: ChatMessage[],
    options: ChatOptions
  ): Promise<{ res: Response; dispose: () => void; timedOut: () => boolean; timeoutMs: number }> => {
    const timeoutMs =
      options.timeoutMs ??
      (options.stream
        ? timeoutFor('COMETAPI_STREAM_TIMEOUT_MS', STREAM_TIMEOUT_MS)
        : timeoutFor('COMETAPI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS));
    const guard = withTimeout(options.signal, timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model,
          messages,
          temperature: options.temperature,
          ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
          ...(options.stream ? { stream: true } : {}),
        }),
        signal: guard.signal,
      });
      return { res, dispose: guard.dispose, timedOut: guard.timedOut, timeoutMs };
    } catch (err) {
      guard.dispose();
      if (guard.timedOut()) throw new RequestTimeoutError(timeoutMs, options.model);
      throw err;
    }
  };

  /**
   * POST the completion, recovering from a per-model token ceiling. The first
   * 400 that mentions tokens is retried once with the ceiling the provider
   * accepted (or with no ceiling at all, letting the provider apply its own
   * default), so a model with a smaller budget than we asked for still works.
   *
   * Transient failures (429/5xx/network/timeout) get one more attempt via
   * `withRetry`; the ceiling recovery happens inside each attempt so a retried
   * request still benefits from a ceiling we already discovered.
   */
  const sendRequest = async (
    messages: ChatMessage[],
    options: ChatOptions,
    streaming: boolean
  ): Promise<{ res: Response; dispose: () => void; timedOut: () => boolean; timeoutMs: number }> => {
    const cacheKey = `${endpoint}:${options.model}`;

    const attempt = async () => {
      const sent = await post(messages, {
        ...options,
        stream: streaming,
        maxTokens: tokenCeilings.get(cacheKey) ?? options.maxTokens,
      });

      if (sent.res.status !== 400 || options.maxTokens == null) return sent;

      // The body has to be read to learn the limit, so never return this response.
      const detail = await readError(sent.res);
      sent.dispose();
      const limit = parseTokenCeiling(detail);
      if (limit) tokenCeilings.set(cacheKey, limit);
      return post(messages, { ...options, stream: streaming, maxTokens: limit });
    };

    return withRetry(
      attempt,
      // A rate limit or upstream 5xx is worth one more try. Releasing the
      // unread body here is what keeps the retried request from queueing behind
      // a connection we already know we don't want.
      (sent) => {
        if (!isTransientStatus(sent.res.status)) return false;
        void discard(sent.res);
        sent.dispose();
        return true;
      },
      options.signal
    );
  };

  /** One non-streaming completion, returning the assistant's text. */
  const complete = async (messages: ChatMessage[], options: ChatOptions): Promise<string> => {
    const { res, dispose, timedOut, timeoutMs } = await sendRequest(messages, options, false);
    try {
      if (!res.ok) {
        throw new Error(`CometAPI request failed (${res.status}): ${await readError(res)}`);
      }
      try {
        return completionText(await res.json());
      } catch (err) {
        // The body can still be mid-flight when the timeout lands.
        if (timedOut()) throw new RequestTimeoutError(timeoutMs, options.model);
        throw err;
      }
    } finally {
      dispose();
    }
  };

  /** One streaming completion, yielding incremental text as it arrives. */
  const stream = async function* (
    messages: ChatMessage[],
    options: ChatOptions
  ): AsyncIterable<string> {
    const { res, dispose, timedOut, timeoutMs } = await sendRequest(messages, options, true);
    try {
      if (!res.ok) {
        throw new Error(`CometAPI request failed (${res.status}): ${await readError(res)}`);
      }
      if (!res.body) throw new Error('CometAPI returned an empty stream.');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE events are newline-delimited; keep the trailing partial line back.
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const text = sseChunkText(line);
            if (text) yield text;
          }
        }
        // Flush a final line that arrived without a trailing newline.
        const tail = sseChunkText(buffer);
        if (tail) yield tail;
      } catch (err) {
        // A model that accepted the request and then went silent is the failure
        // this whole timeout exists for — report it as such, not as a raw abort.
        if (timedOut()) throw new RequestTimeoutError(timeoutMs, options.model);
        throw err;
      } finally {
        // Consumer stopped early (e.g. client abort) — release the connection.
        await reader.cancel().catch(() => undefined);
      }
    } finally {
      dispose();
    }
  };

  const system = (text: string): ChatMessage => ({ role: 'system', content: text });

  return {
    async planTurn(input: PlanTurnInput): Promise<TurnPlan> {
      const text = await complete(
        [
          system(planTurnSystemPrompt(input.existingPages, input.activePageId)),
          ...input.messages.map((m): ChatMessage => ({ role: m.role, content: m.content })),
        ],
        { model, temperature: 0.7, maxTokens: MAX_TOKENS.plan, signal: input.abortSignal }
      );

      const parsed = extractJsonObject(text);
      if (parsed === null) {
        // Model didn't return usable JSON — degrade gracefully to a chat reply
        // rather than failing the turn.
        return { reply: text.trim() || 'Sorry, could you rephrase that?', action: 'chat', plannedPages: [] };
      }

      const result = turnPlanSchema.safeParse(parsed);
      if (!result.success) {
        return { reply: 'Sorry, I had trouble planning that. Could you rephrase?', action: 'chat', plannedPages: [] };
      }
      return result.data;
    },

    async generateTheme(input: GenerateThemeInput): Promise<ThemeSpec> {
      const text = await complete(
        [
          system(themeSystemPrompt()),
          ...input.messages.map((m): ChatMessage => ({ role: m.role, content: m.content })),
        ],
        { model, temperature: 0.7, maxTokens: MAX_TOKENS.theme, signal: input.abortSignal }
      );

      const parsed = themeSpecSchema.safeParse(extractJsonObject(text));
      if (!parsed.success) {
        throw new Error('The model returned an invalid theme.');
      }
      return parsed.data;
    },

    streamPage(input: StreamPageInput): AsyncIterable<string> {
      return stream(
        [
          system(streamPageSystemPrompt(input.page, input.siblingPages, input.styleGuide)),
          ...input.messages.map((m): ChatMessage => ({ role: m.role, content: m.content })),
        ],
        { model, temperature: 0.8, maxTokens: MAX_TOKENS.page, signal: input.abortSignal }
      );
    },

    async editPage(input: EditPageInput): Promise<PagePatch> {
      const text = await complete(
        [
          system(editPageSystemPrompt(input.page, input.html, input.styleGuide)),
          ...input.messages.map((m): ChatMessage => ({ role: m.role, content: m.content })),
        ],
        { model, temperature: 0.4, maxTokens: MAX_TOKENS.patch, signal: input.abortSignal }
      );

      const result = pagePatchSchema.safeParse(extractJsonObject(text));
      if (!result.success) {
        // Drop the whole patch rather than apply partially-invalid operations.
        return { operations: [] as PagePatch['operations'] };
      }
      return result.data;
    },

    async generateShopifySection(input: ShopifySectionInput): Promise<ShopifySectionSpec> {
      const text = await complete(
        [
          system(
            shopifySectionSystemPrompt({
              brandName: input.brandName,
              pageType: input.pageType,
              pageLabel: input.pageLabel,
              role: input.role,
              styleGuide: input.styleGuide,
            })
          ),
          { role: 'user', content: input.html },
        ],
        { model, temperature: 0.4, maxTokens: MAX_TOKENS.shopify, signal: input.abortSignal }
      );

      const parsed = shopifySectionSpecSchema.safeParse(extractJsonObject(text));
      if (!parsed.success) {
        throw new Error('The model returned an invalid Shopify section.');
      }
      return parsed.data;
    },
  };
}
