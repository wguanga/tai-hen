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
  importUrl: (url: string) =>
    request<Paper>('/papers/import_url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
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
        caption_bbox?: number[] | null;
      }>;
    }>(`/papers/${id}/figures`),
  figureImageUrl: (paperId: string, xref: number) =>
    `${BASE}/papers/${paperId}/figures/${xref}.png`,
  pageClipUrl: (paperId: string, page: number, captionBbox: number[]) => {
    const [cx0, cy0, cx1, cy1] = captionBbox;
    const q = new URLSearchParams({
      cx0: String(cx0), cy0: String(cy0), cx1: String(cx1), cy1: String(cy1),
    });
    return `${BASE}/papers/${paperId}/page/${page}/clip.png?${q.toString()}`;
  },
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
  listModels: (body: { provider?: string; base_url?: string; api_key?: string }) =>
    request<{ models: string[] }>('/config/models', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  probeVision: (force = false) =>
    request<{ supports_vision: boolean; source: 'cache' | 'probe' | 'none'; message: string }>(
      `/config/probe-vision${force ? '?force=true' : ''}`,
      { method: 'POST' },
    ),

  suggestQuestions: (paperId: string) =>
    request<{ questions: { icon: string; label: string; prompt: string }[] }>(
      '/ai/suggest_questions',
      { method: 'POST', body: JSON.stringify({ paper_id: paperId }) },
    ),
  tagHighlight: (paperId: string, text: string, page?: number) =>
    request<{ tag: string; icon: string }>('/ai/tag_highlight', {
      method: 'POST',
      body: JSON.stringify({ paper_id: paperId, text, page }),
    }),
  figureInsight: (paperId: string, fig: { number: number; kind: 'figure' | 'table'; caption: string; page: number }) =>
    request<{ insight: string }>('/ai/figure_insight', {
      method: 'POST',
      body: JSON.stringify({ paper_id: paperId, ...fig }),
    }),
  confusionHelp: (paperId: string, page: number) =>
    request<{ explanation: string }>('/ai/confusion_help', {
      method: 'POST',
      body: JSON.stringify({ paper_id: paperId, page }),
    }),
  interpretCommand: (query: string, paperId?: string) =>
    request<{ action: string; [k: string]: unknown }>('/ai/interpret_command', {
      method: 'POST',
      body: JSON.stringify({ query, paper_id: paperId }),
    }),
  quickTranslate: (text: string) =>
    request<{ translation: string }>('/ai/quick_translate', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  semanticSearch: (paperId: string, query: string) =>
    request<{ hits: { page: number; excerpt: string; why: string }[] }>(
      '/ai/semantic_search',
      { method: 'POST', body: JSON.stringify({ paper_id: paperId, query }) },
    ),
  compileNotes: (paperId: string) =>
    request<{ markdown: string }>('/ai/compile_notes', {
      method: 'POST',
      body: JSON.stringify({ paper_id: paperId }),
    }),
  readingQuestions: (paperId: string, mode: 'preread' | 'comprehension') =>
    request<{ questions: { q: string; hint?: string; reference_answer?: string }[]; mode: string }>(
      '/ai/reading_questions',
      { method: 'POST', body: JSON.stringify({ paper_id: paperId, mode }) },
    ),
  checkAnswer: (paperId: string, question: string, userAnswer: string) =>
    request<{ verdict: 'right' | 'partial' | 'wrong'; feedback: string }>(
      '/ai/check_answer',
      { method: 'POST', body: JSON.stringify({ paper_id: paperId, question, user_answer: userAnswer }) },
    ),
  formatNote: (text: string) =>
    request<{ formatted: string }>('/ai/format_note', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
};
