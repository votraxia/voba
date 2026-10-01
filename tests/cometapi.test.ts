import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCometApiProvider, extractJsonObject } from '@/lib/ai/providers/cometapi';
import type { BuilderPage } from '@/lib/ai/events';

/**
 * Deterministic tests for the CometAPI adapter (AGENTS.md §18: AI output
 * validation + provider adapters, with no live calls). `fetch` is stubbed, so
 * these assert our request shaping, SSE parsing, and Zod validation — the exact
 * behaviours that were verified against the live API while building it.
 */

const FAKE_KEY = 'test-cometapi-key-do-not-leak';

const HOME_PAGE: BuilderPage = {
  id: 'home',
  label: 'Home',
  type: 'home',
  path: '/',
};

/** Build a `Response` whose body is the given raw SSE text fragments. */
function sseResponse(fragments: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const fragment of fragments) controller.enqueue(encoder.encode(fragment));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/** One OpenAI-style SSE delta line, exactly as CometAPI emits it. */
function sseDelta(delta: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ choices: [{ delta, finish_reason: null, index: 0 }] })}\n\n`;
}

/** A non-streaming completion whose assistant content is `content`. */
function completionResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.COMETAPI_KEY = FAKE_KEY;
  delete process.env.COMETAPI_BASE_URL;
  delete process.env.COMETAPI_TIMEOUT_MS;
  delete process.env.COMETAPI_STREAM_TIMEOUT_MS;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.COMETAPI_KEY;
  delete process.env.COMETAPI_BASE_URL;
  delete process.env.COMETAPI_TIMEOUT_MS;
  delete process.env.COMETAPI_STREAM_TIMEOUT_MS;
});

/** Read the single request the adapter made. */
function lastRequest(): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return {
    url,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  };
}

describe('extractJsonObject', () => {
  it('parses bare JSON', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in a markdown fence (observed live from gemini-2.5-flash)', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('parses JSON that follows a sentence of preamble', () => {
    expect(extractJsonObject('Sure! Here is the plan:\n{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null for text with no JSON object', () => {
    expect(extractJsonObject('I cannot help with that.')).toBeNull();
    expect(extractJsonObject('')).toBeNull();
  });
});

describe('createCometApiProvider config', () => {
  it('throws a clear error when COMETAPI_KEY is missing', () => {
    delete process.env.COMETAPI_KEY;
    expect(() => createCometApiProvider('gemini-2.5-flash')).toThrow(/COMETAPI_KEY is not set/);
  });

  it('posts to the OpenAI-compatible endpoint with bearer auth and the model', async () => {
    fetchMock.mockResolvedValue(completionResponse('hi'));
    await createCometApiProvider('gemini-2.5-flash').planTurn({ existingPages: [], messages: [{ role: 'user', content: 'hey' }] });

    const { url, headers, body } = lastRequest();
    expect(url).toBe('https://api.cometapi.com/v1/chat/completions');
    expect(headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(headers['Content-Type']).toBe('application/json');
    expect(body.model).toBe('gemini-2.5-flash');
    expect(body.stream).toBeUndefined();
  });

  it('honours COMETAPI_BASE_URL for proxies', async () => {
    process.env.COMETAPI_BASE_URL = 'https://proxy.internal/v1/';
    fetchMock.mockResolvedValue(completionResponse('hi'));
    await createCometApiProvider('m').planTurn({ existingPages: [], messages: [{ role: 'user', content: 'hey' }] });
    expect(lastRequest().url).toBe('https://proxy.internal/v1/chat/completions');
  });

  it('sends the system prompt as the first message', async () => {
    fetchMock.mockResolvedValue(completionResponse('hi'));
    await createCometApiProvider('m').planTurn({ existingPages: [], messages: [{ role: 'user', content: 'build a store' }] });

    const messages = lastRequest().body.messages as { role: string }[];
    expect(messages[0].role).toBe('system');
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'build a store' });
  });
});

describe('planTurn', () => {
  it('accepts a fenced JSON plan and normalizes defaults', async () => {
    fetchMock.mockResolvedValue(
      completionResponse(
        '```json\n' +
          JSON.stringify({ reply: 'Building your homepage.', action: 'generate_page', targetPage: HOME_PAGE }) +
          '\n```'
      )
    );

    const plan = await createCometApiProvider('m').planTurn({ existingPages: [], messages: [{ role: 'user', content: 'hi' }] });
    expect(plan.action).toBe('generate_page');
    expect(plan.targetPage?.id).toBe('home');
    expect(plan.plannedPages).toEqual([]); // schema default applied
  });

  it('degrades to a chat reply when the model returns prose', async () => {
    fetchMock.mockResolvedValue(completionResponse('What kind of store do you want?'));
    const plan = await createCometApiProvider('m').planTurn({ existingPages: [], messages: [{ role: 'user', content: 'hi' }] });
    expect(plan).toEqual({
      reply: 'What kind of store do you want?',
      action: 'chat',
      plannedPages: [],
    });
  });

  it('rejects a structurally invalid plan instead of trusting it', async () => {
    fetchMock.mockResolvedValue(completionResponse(JSON.stringify({ action: 'generate_page' })));
    const plan = await createCometApiProvider('m').planTurn({ existingPages: [], messages: [{ role: 'user', content: 'hi' }] });
    expect(plan.action).toBe('chat');
    expect(plan.reply).toMatch(/trouble planning/i);
  });
});

describe('streamPage', () => {
  it('yields visible deltas, skipping reasoning content and the [DONE] sentinel', async () => {
    const body = [
      sseDelta({ content: '', role: 'assistant' }),
      sseDelta({ reasoning_content: 'thinking about the layout' }),
      sseDelta({ content: '<section' }),
      sseDelta({ content: ' class="hero">Hi</section>' }),
      'data: [DONE]\n\n',
    ];
    fetchMock.mockResolvedValue(sseResponse(body));

    const chunks: string[] = [];
    for await (const chunk of createCometApiProvider('m').streamPage({
      page: HOME_PAGE,
      siblingPages: [],
      messages: [{ role: 'user', content: 'build a store' }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('<section class="hero">Hi</section>');
    expect(chunks.join('')).not.toContain('thinking about the layout');
    expect(lastRequest().body.stream).toBe(true);
  });

  it('reassembles events split across network chunks', async () => {
    const event = sseDelta({ content: 'hello world' });
    // Split mid-line, as a real socket read would.
    fetchMock.mockResolvedValue(sseResponse([event.slice(0, 18), event.slice(18)]));

    const chunks: string[] = [];
    for await (const chunk of createCometApiProvider('m').streamPage({
      page: HOME_PAGE,
      siblingPages: [],
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      chunks.push(chunk);
    }
    expect(chunks.join('')).toBe('hello world');
  });

  it('flushes a trailing event with no terminating newline', async () => {
    fetchMock.mockResolvedValue(sseResponse([sseDelta({ content: 'tail' }).trimEnd()]));

    const chunks: string[] = [];
    for await (const chunk of createCometApiProvider('m').streamPage({
      page: HOME_PAGE,
      siblingPages: [],
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      chunks.push(chunk);
    }
    expect(chunks.join('')).toBe('tail');
  });
});

describe('editPage', () => {
  it('returns validated scoped operations', async () => {
    fetchMock.mockResolvedValue(
      completionResponse(
        JSON.stringify({ operations: [{ op: 'set_text', targetId: 'hero-heading', text: 'Fresh roast' }] })
      )
    );
    const patch = await createCometApiProvider('m').editPage({
      page: HOME_PAGE,
      html: '<h1 data-builder-element-id="hero-heading">Old</h1>',
      messages: [{ role: 'user', content: 'change the heading' }],
    });
    expect(patch.operations).toEqual([{ op: 'set_text', targetId: 'hero-heading', text: 'Fresh roast' }]);
  });

  it('drops the whole patch when any operation is invalid', async () => {
    fetchMock.mockResolvedValue(
      completionResponse(
        JSON.stringify({
          operations: [
            { op: 'set_text', targetId: 'hero-heading', text: 'ok' },
            { op: 'set_attribute', targetId: 'hero-img', name: 'onclick', value: 'alert(1)' },
          ],
        })
      )
    );
    const patch = await createCometApiProvider('m').editPage({
      page: HOME_PAGE,
      html: '<h1 data-builder-element-id="hero-heading">Old</h1>',
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(patch.operations).toEqual([]);
  });
});

describe('generateTheme / generateShopifySection validation', () => {
  it('throws on an invalid theme', async () => {
    fetchMock.mockResolvedValue(completionResponse(JSON.stringify({ css: '' })));
    await expect(
      createCometApiProvider('m').generateTheme({ messages: [{ role: 'user', content: 'x' }] })
    ).rejects.toThrow(/invalid theme/i);
  });

  it('returns a valid theme spec', async () => {
    fetchMock.mockResolvedValue(
      completionResponse(JSON.stringify({ css: ':root{--brand:#f60}', styleGuide: 'Warm coral brand.' }))
    );
    const theme = await createCometApiProvider('m').generateTheme({
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(theme.styleGuide).toBe('Warm coral brand.');
  });

  it('throws on an invalid Shopify section', async () => {
    fetchMock.mockResolvedValue(completionResponse(JSON.stringify({ name: 'Hero' })));
    await expect(
      createCometApiProvider('m').generateShopifySection({
        brandName: 'Roast',
        pageType: 'home',
        pageLabel: 'Home',
        role: 'content',
        html: '<section>hi</section>',
      })
    ).rejects.toThrow(/invalid Shopify section/i);
  });

  it('returns a valid Shopify section spec', async () => {
    fetchMock.mockResolvedValue(
      completionResponse(JSON.stringify({ name: 'Hero', liquid: '<div>{{ section.settings.heading }}</div>' }))
    );
    const spec = await createCometApiProvider('m').generateShopifySection({
      brandName: 'Roast',
      pageType: 'home',
      pageLabel: 'Home',
      role: 'content',
      html: '<section>hi</section>',
    });
    expect(spec.liquid).toContain('section.settings.heading');
  });
});

describe('per-model token ceilings', () => {
  /**
   * CometAPI rejects an oversized `max_tokens` outright rather than clamping it,
   * and the ceiling differs per model (gpt-4o allows 16384 where Gemini accepts
   * 32768). Each test uses its own model id because the discovered ceiling is
   * cached per endpoint+model at module scope.
   */
  // A factory, not a shared Response: a body can only be read once, so reusing
  // one instance across tests would leave later tests with an empty body.
  const tooLarge400 = () =>
    new Response(
      JSON.stringify({
        error: {
          message:
            'max_tokens is too large: 32768. This model supports at most 16384 completion tokens, whereas you provided 32768.',
        },
      }),
      { status: 400 }
    );

  const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body as string) as Record<string, unknown>;

  it('retries once with the limit the provider reports', async () => {
    fetchMock
      .mockResolvedValueOnce(tooLarge400())
      .mockResolvedValueOnce(completionResponse(JSON.stringify({ reply: 'ok', action: 'chat' })));

    const plan = await createCometApiProvider('ceiling-model-a').planTurn({
      existingPages: [],
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(plan.reply).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(1).max_tokens).toBe(16384);
  });

  it('remembers the ceiling so later calls never send the rejected budget', async () => {
    fetchMock
      .mockResolvedValueOnce(tooLarge400())
      .mockResolvedValueOnce(completionResponse(JSON.stringify({ reply: 'first', action: 'chat' })))
      .mockResolvedValueOnce(completionResponse(JSON.stringify({ reply: 'second', action: 'chat' })));

    const provider = createCometApiProvider('ceiling-model-b');
    await provider.planTurn({ existingPages: [], messages: [{ role: 'user', content: 'one' }] });
    await provider.planTurn({ existingPages: [], messages: [{ role: 'user', content: 'two' }] });

    // 2 calls for the first turn (rejected + retry), 1 for the second.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(bodyOf(2).max_tokens).toBe(16384);
  });

  it('drops the ceiling when the provider does not state one', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'max_tokens is too large' } }), { status: 400 })
      )
      .mockResolvedValueOnce(completionResponse(JSON.stringify({ reply: 'ok', action: 'chat' })));

    await createCometApiProvider('ceiling-model-c').planTurn({
      existingPages: [],
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(1).max_tokens).toBeUndefined();
  });

  it('applies the ceiling to streaming page generation too', async () => {
    fetchMock
      .mockResolvedValueOnce(tooLarge400())
      .mockResolvedValueOnce(sseResponse([sseDelta({ content: '<p>hi</p>' }), 'data: [DONE]\n\n']));

    const chunks: string[] = [];
    for await (const chunk of createCometApiProvider('ceiling-model-d').streamPage({
      page: HOME_PAGE,
      siblingPages: [],
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('<p>hi</p>');
    expect(bodyOf(1).max_tokens).toBe(16384);
    expect(bodyOf(1).stream).toBe(true);
  });
});

describe('error handling', () => {
  it('surfaces the API error message and status without leaking the key', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Invalid API key provided' } }), { status: 401 })
    );

    await expect(
      createCometApiProvider('m').planTurn({ existingPages: [], messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow('CometAPI request failed (401): Invalid API key provided');

    await expect(
      createCometApiProvider('m').planTurn({ existingPages: [], messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.not.toThrow(FAKE_KEY);
  });

  it('fails the stream on a non-ok response that survives the retry', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('rate limited', { status: 429 })));

    const consume = async () => {
      const chunks: string[] = [];
      for await (const chunk of createCometApiProvider('m').streamPage({
        page: HOME_PAGE,
        siblingPages: [],
        messages: [{ role: 'user', content: 'hi' }],
      })) {
        chunks.push(chunk);
      }
      return chunks;
    };
    await expect(consume()).rejects.toThrow(/CometAPI request failed \(429\)/);
  });

  it('retries a 429 once, then gives up', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('rate limited', { status: 429 })));

    const consume = async () => {
      const chunks: string[] = [];
      for await (const chunk of createCometApiProvider('m').streamPage({
        page: HOME_PAGE,
        siblingPages: [],
        messages: [{ role: 'user', content: 'hi' }],
      })) {
        chunks.push(chunk);
      }
      return chunks;
    };
    await expect(consume()).rejects.toThrow(/429/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('omits stream from non-streaming calls and includes max_tokens', async () => {
    fetchMock.mockResolvedValue(completionResponse(JSON.stringify({ reply: 'ok', action: 'chat' })));
    await createCometApiProvider('m').planTurn({ existingPages: [], messages: [{ role: 'user', content: 'hi' }] });
    const { body } = lastRequest();
    expect(body.stream).toBeUndefined();
    expect(typeof body.max_tokens).toBe('number');
    expect(body.max_tokens as number).toBeGreaterThan(0);
  });
});

/**
 * Timeouts and retries.
 *
 * These exist because upstream availability is not guaranteed: `claude-haiku-4-5`
 * once accepted a request and then never answered, which hung a generation
 * indefinitely. The invariants worth locking down are the ones that decide
 * whether a failure is retried at all — a 4xx must not be, an abort must not be,
 * and a timeout must surface as a readable message rather than a raw abort.
 */
describe('request timeout', () => {
  /** A fetch that never settles until its signal aborts — a hung upstream. */
  function hungFetch() {
    return (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }))
        );
      });
  }

  it('aborts a hung non-streaming call and reports a readable timeout', async () => {
    process.env.COMETAPI_TIMEOUT_MS = '30';
    fetchMock.mockImplementation(hungFetch());

    await expect(
      createCometApiProvider('hang-model').planTurn({
        existingPages: [],
        messages: [{ role: 'user', content: 'hi' }],
      })
    ).rejects.toThrow(/hang-model did not respond within 0s/);
  });

  it('aborts a stream that connects but never sends a token', async () => {
    process.env.COMETAPI_STREAM_TIMEOUT_MS = '30';
    // Headers arrive, then silence — the case the streaming timeout exists for.
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              init.signal?.addEventListener('abort', () => {
                try {
                  controller.error(new Error('aborted'));
                } catch {
                  // Already errored/closed.
                }
              });
            },
          });
          resolve(new Response(stream, { status: 200 }));
        })
    );

    const consume = async () => {
      const chunks: string[] = [];
      for await (const chunk of createCometApiProvider('silent-model').streamPage({
        page: HOME_PAGE,
        siblingPages: [],
        messages: [{ role: 'user', content: 'hi' }],
      })) {
        chunks.push(chunk);
      }
      return chunks;
    };

    await expect(consume()).rejects.toThrow(/silent-model did not respond within/);
  });

  it('keeps the API key out of the timeout message', async () => {
    process.env.COMETAPI_TIMEOUT_MS = '30';
    fetchMock.mockImplementation(hungFetch());

    await expect(
      createCometApiProvider('m').planTurn({ existingPages: [], messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.not.toThrow(FAKE_KEY);
  });
});

describe('transient retry', () => {
  it('retries once on a 500 and succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('upstream boom', { status: 500 }))
      .mockResolvedValueOnce(completionResponse(JSON.stringify({ reply: 'recovered', action: 'chat' })));

    const plan = await createCometApiProvider('retry-500').planTurn({
      existingPages: [],
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(plan.reply).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries once on a 503, then reports the failure', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('unavailable', { status: 503 })));

    await expect(
      createCometApiProvider('retry-503').planTurn({ existingPages: [], messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow(/CometAPI request failed \(503\)/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a network-level failure (a rejected fetch)', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(completionResponse(JSON.stringify({ reply: 'back online', action: 'chat' })));

    const plan = await createCometApiProvider('retry-network').planTurn({
      existingPages: [],
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(plan.reply).toBe('back online');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a timeout once — a hung upstream may just be a bad moment', async () => {
    process.env.COMETAPI_TIMEOUT_MS = '25';
    let calls = 0;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      calls += 1;
      if (calls === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      return Promise.resolve(completionResponse(JSON.stringify({ reply: 'second try', action: 'chat' })));
    });

    const plan = await createCometApiProvider('retry-timeout').planTurn({
      existingPages: [],
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(plan.reply).toBe('second try');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry a 400 — a rejected request would just be rejected again', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'max_tokens is too large' } }), { status: 400 })
      )
    );

    await expect(
      createCometApiProvider('no-retry-400').planTurn({
        existingPages: [],
        messages: [{ role: 'user', content: 'hi' }],
      })
    ).rejects.toThrow(/CometAPI request failed \(400\)/);

    // Two calls: the original plus the single token-ceiling recovery, not a
    // transient retry. A retry would make it four.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry a 401', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), { status: 401 }))
    );

    await expect(
      createCometApiProvider('no-retry-401').planTurn({ existingPages: [], messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry after the caller aborted — the user already walked away', async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockImplementation(() => Promise.resolve(completionResponse('never used')));

    await expect(
      createCometApiProvider('no-retry-abort').planTurn({
        existingPages: [],
        messages: [{ role: 'user', content: 'hi' }],
        abortSignal: controller.signal,
      })
    ).rejects.toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
