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
  updatePaper: (id: string, patch: { tags?: string[]; title?: string }) =>
    request<Paper>(`/papers/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  listAllTags: () => request<{ items: string[] }>('/papers/tags'),
  listPapersByTag: (tag: string) =>
    request<{ items: Paper[]; total: number }>(`/papers?tag=${encodeURIComponent(tag)}`),
  paperFileUrl: (id: string) => `${BASE}/papers/${id}/file`,
  getOutline: (id: string) =>
    request<{ items: { level: number; title: string; page: number }[] }>(`/papers/${id}/outline`),
  getReferences: (id: string) =>
    request<{ items: { index: number; text: string }[] }>(`/papers/${id}/references`),
  getFigures: (id: string) =>
    request<{
      items: Array<{
        number: number; page: number; kind: 'figure' | 'table';
        caption: string; image_xref: number | null;
      }>;
    }>(`/papers/${id}/figures`),
  figureImageUrl: (paperId: string, xref: number) =>
    `${BASE}/papers/${paperId}/figures/${xref}.png`,
  getSummary: (id: string) =>
    request<{ summary: { id: string; content: string; created_at: string; updated_at: string } | null }>(`/papers/${id}/summary`),
  generateSummary: (id: string, regenerate = false) =>
    request<{
      summary: { id: string; content: string; created_at: string; updated_at: string } | null;
      cached: boolean;
    }>(`/papers/${id}/summary?regenerate=${regenerate}`, { method: 'POST' }),
  // Note: /ai/compare_papers is a streaming endpoint — use streamSSE directly with
  // path '/ai/compare_papers' and body { paper_ids: string[] }.
  suggestHighlights: (id: string) =>
    request<{
      items: Array<{
        text: string;
        page: number;
        color: HighlightColor;
        reason: string;
        position: HighlightPosition | null;
        locatable: boolean;
      }>;
      total: number;
    }>('/ai/suggest_highlights', { method: 'POST', body: JSON.stringify({ paper_id: id }) }),
  searchPaper: (id: string, q: string) =>
    request<{ items: { page: number; index: number; snippet: string }[]; total: number }>(`/papers/${id}/search?q=${encodeURIComponent(q)}`),

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

  listGlossary: (q?: string) =>
    request<{
      items: Array<{ id: string; term: string; definition: string; paper_id: string | null; source: string; created_at: string }>;
    }>(`/glossary${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createGlossary: (body: { term: string; definition: string; paper_id?: string; source?: 'manual' | 'summary' | 'ai_explain' }) =>
    request<{ id: string; term: string; definition: string; paper_id: string | null; source: string; created_at: string }>(
      '/glossary', { method: 'POST', body: JSON.stringify(body) },
    ),
  updateGlossary: (id: string, body: { term?: string; definition?: string }) =>
    request<{ id: string; term: string; definition: string }>(`/glossary/${id}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),
  deleteGlossary: (id: string) =>
    request<void>(`/glossary/${id}`, { method: 'DELETE' }),

  searchNotesGlobal: (q: string) =>
    request<{
      items: Array<{
        id: string; paper_id: string; paper_title: string;
        highlight_id: string | null; title: string | null;
        content: string; source: 'manual' | 'ai_answer' | 'ai_summary';
        created_at: string;
      }>;
      total: number;
    }>(`/search/notes?q=${encodeURIComponent(q)}`),

  getConfig: () => request<AppConfig>('/config'),
  saveConfig: (body: Partial<AppConfig> & { api_key?: string }) =>
    request<AppConfig>('/config', { method: 'POST', body: JSON.stringify(body) }),
  testConfig: () =>
    request<{ ok: boolean; message: string }>('/config/test', { method: 'POST' }),
};
