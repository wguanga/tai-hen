import { BASE } from '../api';

export type StreamStatus = {
  stage: 'reading' | 'map' | 'reduce' | 'writing' | 'fallback' | string;
  msg?: string;
  chunk?: number;
  total?: number;
};

export type StreamHandlers = {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError?: (code: string, message: string) => void;
  onStatus?: (status: StreamStatus) => void;
  signal?: AbortSignal;
};

export async function streamSSE(
  path: string,
  body: unknown,
  h: StreamHandlers,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: h.signal,
    });
  } catch (e: any) {
    if (e.name !== 'AbortError') h.onError?.('NETWORK_ERROR', e.message ?? 'fetch failed');
    return;
  }

  if (!res.ok) {
    try {
      const err = await res.json();
      h.onError?.(err.error?.code ?? 'HTTP_ERROR', err.error?.message ?? res.statusText);
    } catch {
      h.onError?.('HTTP_ERROR', `${res.status}`);
    }
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) { h.onError?.('NO_STREAM', 'response has no body'); return; }
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        try {
          const evt = JSON.parse(payload);
          if (evt.type === 'chunk') h.onChunk(evt.text ?? '');
          else if (evt.type === 'status') {
            const { type: _t, ...status } = evt;
            h.onStatus?.(status as StreamStatus);
          }
          else if (evt.type === 'done') { h.onDone(); return; }
          else if (evt.type === 'error') {
            h.onError?.(evt.code ?? 'LLM_ERROR', evt.message ?? 'unknown');
            return;
          }
        } catch { /* skip malformed */ }
      }
    }
    h.onDone();
  } catch (e: any) {
    if (e.name !== 'AbortError') h.onError?.('STREAM_ERROR', e.message ?? 'stream failed');
  }
}
