import type {
  AppConfig,
  Highlight,
  HighlightColor,
  HighlightPosition,
  Note,
  NoteSource,
  Paper,
} from './types';

export const BASE = 'http://127.0.0.1:8000';

export class ApiError extends Error {
  constructor(public code: string, message: string, public detail?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: init?.body && !(init?.body instanceof FormData)
      ? { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
      : { ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let payload: any = {};
    try { payload = await res.json(); } catch { /* non-json */ }
    const err = payload?.error ?? {};
    throw new ApiError(err.code ?? 'HTTP_ERROR', err.message ?? res.statusText, err.detail);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.startsWith('text/')) return (await res.text()) as unknown as T;
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ status: string }>('/health'),

  listPapers: () =>
    request<{ items: Paper[]; total: number }>('/papers'),
  getPaper: (id: string) => request<Paper>(`/papers/${id}`),
  uploadPaper: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<Paper>('/papers/upload', { method: 'POST', body: fd });
  },
  deletePaper: (id: string) =>
    request<void>(`/papers/${id}`, { method: 'DELETE' }),
  paperFileUrl: (id: string) => `${BASE}/papers/${id}/file`,

  listHighlights: (paperId: string) =>
    request<{ items: Highlight[] }>(`/papers/${paperId}/highlights`),
  createHighlight: (paperId: string, body: {
    text: string;
    color: HighlightColor;
    page: number;
    position: HighlightPosition;
    note?: string;
  }) =>
    request<Highlight>(`/papers/${paperId}/highlights`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateHighlight: (paperId: string, hid: string, patch: { color?: HighlightColor; note?: string }) =>
    request<Highlight>(`/papers/${paperId}/highlights/${hid}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  deleteHighlight: (paperId: string, hid: string) =>
    request<void>(`/papers/${paperId}/highlights/${hid}`, { method: 'DELETE' }),

  listNotes: (paperId: string) =>
    request<{ items: Note[] }>(`/papers/${paperId}/notes`),
  createNote: (paperId: string, body: {
    highlight_id?: string;
    title?: string;
    content: string;
    source: NoteSource;
  }) =>
    request<Note>(`/papers/${paperId}/notes`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateNote: (paperId: string, nid: string, patch: { title?: string; content?: string }) =>
    request<Note>(`/papers/${paperId}/notes/${nid}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  deleteNote: (paperId: string, nid: string) =>
    request<void>(`/papers/${paperId}/notes/${nid}`, { method: 'DELETE' }),
  exportMarkdown: (paperId: string) =>
    request<string>(`/papers/${paperId}/export`),

  getConfig: () => request<AppConfig>('/config'),
  saveConfig: (body: Partial<AppConfig> & { api_key?: string }) =>
    request<AppConfig>('/config', { method: 'POST', body: JSON.stringify(body) }),
};
