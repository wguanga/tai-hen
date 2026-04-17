import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamSSE } from './useStream';

function sseStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const ev of events) controller.enqueue(encoder.encode(ev));
      controller.close();
    },
  });
}

function mockFetch(body: ReadableStream<Uint8Array>, ok = true, status = 200) {
  return vi.fn().mockResolvedValue(new Response(body, { status, statusText: ok ? 'OK' : 'Error' }));
}

describe('streamSSE', () => {
  beforeEach(() => { (globalThis as any).fetch = undefined; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('parses chunk events and calls onChunk', async () => {
    const body = sseStream([
      'data: {"type":"chunk","text":"Hello"}\n\n',
      'data: {"type":"chunk","text":" World"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    (globalThis as any).fetch = mockFetch(body);
    const chunks: string[] = [];
    let done = false;
    await streamSSE('/ai/explain', { paper_id: 'p1', text: 'x', level: 'simple' }, {
      onChunk: (t) => chunks.push(t),
      onDone: () => { done = true; },
    });
    expect(chunks).toEqual(['Hello', ' World']);
    expect(done).toBe(true);
  });

  it('handles chunks split across TCP boundaries', async () => {
    const body = sseStream([
      'data: {"type":"chunk","te',
      'xt":"Hello"}\n\ndata: {"type":"done"}\n\n',
    ]);
    (globalThis as any).fetch = mockFetch(body);
    const chunks: string[] = [];
    await streamSSE('/ai/explain', {}, {
      onChunk: (t) => chunks.push(t),
      onDone: () => {},
    });
    expect(chunks).toEqual(['Hello']);
  });

  it('calls onError when server returns error event', async () => {
    const body = sseStream([
      'data: {"type":"error","code":"LLM_UPSTREAM_ERROR","message":"rate limited"}\n\n',
    ]);
    (globalThis as any).fetch = mockFetch(body);
    let errCode = '';
    let errMsg = '';
    await streamSSE('/ai/explain', {}, {
      onChunk: () => {},
      onDone: () => {},
      onError: (c, m) => { errCode = c; errMsg = m; },
    });
    expect(errCode).toBe('LLM_UPSTREAM_ERROR');
    expect(errMsg).toBe('rate limited');
  });

  it('calls onError on HTTP failure', async () => {
    const errBody = new Response(
      JSON.stringify({ error: { code: 'PAPER_NOT_FOUND', message: 'gone' } }),
      { status: 404 },
    );
    (globalThis as any).fetch = vi.fn().mockResolvedValue(errBody);
    let code = '';
    await streamSSE('/x', {}, {
      onChunk: () => {},
      onDone: () => {},
      onError: (c) => { code = c; },
    });
    expect(code).toBe('PAPER_NOT_FOUND');
  });

  it('ignores malformed SSE data lines', async () => {
    const body = sseStream([
      'data: not json\n\n',
      'data: {"type":"chunk","text":"OK"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    (globalThis as any).fetch = mockFetch(body);
    const chunks: string[] = [];
    await streamSSE('/x', {}, { onChunk: (t) => chunks.push(t), onDone: () => {} });
    expect(chunks).toEqual(['OK']);
  });

  it('respects AbortSignal', async () => {
    const body = sseStream(['data: {"type":"chunk","text":"hi"}\n\n']);
    (globalThis as any).fetch = vi.fn().mockRejectedValue(Object.assign(new Error('abort'), { name: 'AbortError' }));
    let errored = false;
    const ctrl = new AbortController();
    ctrl.abort();
    await streamSSE('/x', {}, {
      signal: ctrl.signal,
      onChunk: () => {},
      onDone: () => {},
      onError: () => { errored = true; },
    });
    // AbortError should not call onError
    expect(errored).toBe(false);
    void body; // unused
  });
});
