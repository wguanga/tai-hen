import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

function mockJson(data: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(data), {
    status, statusText: ok ? 'OK' : 'Error',
    headers: { 'content-type': 'application/json' },
  }));
}

function mockText(body: string, contentType = 'text/markdown') {
  return vi.fn().mockResolvedValue(new Response(body, {
    status: 200, headers: { 'content-type': contentType },
  }));
}

function mockNoContent() {
  return vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
}

afterEach(() => { vi.restoreAllMocks(); });

describe('api wrapper', () => {
  it('parses JSON on success', async () => {
    (globalThis as any).fetch = mockJson({ items: [], total: 0 });
    const res = await api.listPapers();
    expect(res).toEqual({ items: [], total: 0 });
  });

  it('throws ApiError with structured error body', async () => {
    (globalThis as any).fetch = mockJson(
      { error: { code: 'PAPER_NOT_FOUND', message: 'gone', detail: { id: 'x' } } },
      false, 404,
    );
    await expect(api.getPaper('x')).rejects.toMatchObject({
      code: 'PAPER_NOT_FOUND',
      message: 'gone',
    });
    try {
      await api.getPaper('x');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
    }
  });

  it('throws HTTP_ERROR when body is not JSON', async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue(new Response('plain text', { status: 500 }));
    await expect(api.listPapers()).rejects.toMatchObject({ code: 'HTTP_ERROR' });
  });

  it('returns text for text/markdown content', async () => {
    (globalThis as any).fetch = mockText('# Export content');
    const md = await api.exportMarkdown('p1');
    expect(md).toBe('# Export content');
  });

  it('returns undefined for 204 No Content', async () => {
    (globalThis as any).fetch = mockNoContent();
    const res = await api.deletePaper('p1');
    expect(res).toBeUndefined();
  });

  it('sends JSON body with correct headers', async () => {
    const fetchSpy = mockJson({});
    (globalThis as any).fetch = fetchSpy;
    await api.createHighlight('p1', {
      text: 'x', color: 'yellow', page: 1,
      position: { x: 0, y: 0, width: 1, height: 1, rects: [] },
    });
    expect(fetchSpy).toHaveBeenCalled();
    const [, init] = fetchSpy.mock.calls[0];
    expect(init.method).toBe('POST');
    expect((init.headers as any)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toMatchObject({ color: 'yellow' });
  });

  it('uploadPaper sends FormData without JSON header', async () => {
    const fetchSpy = mockJson({ id: 'new' });
    (globalThis as any).fetch = fetchSpy;
    const file = new File(['pdf bytes'], 'x.pdf', { type: 'application/pdf' });
    await api.uploadPaper(file);
    const [, init] = fetchSpy.mock.calls[0];
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as any)['Content-Type']).toBeUndefined();
  });

  it('paperFileUrl returns an absolute URL string', () => {
    expect(api.paperFileUrl('abc')).toMatch(/\/papers\/abc\/file$/);
  });
});
