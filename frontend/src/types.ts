export type HighlightColor = 'yellow' | 'blue' | 'green' | 'purple';

export const COLOR_LABELS: Record<HighlightColor, string> = {
  yellow: '重要概念',
  blue: '方法细节',
  green: '实验结论',
  purple: '不理解',
};

export const COLOR_HEX: Record<HighlightColor, string> = {
  yellow: '#FDE68A',
  blue: '#BAE6FD',
  green: '#BBF7D0',
  purple: '#E9D5FF',
};

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year?: number | null;
  file_path: string;
  total_pages: number;
  file_size?: number | null;
  created_at: string;
}

export interface HighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HighlightPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  rects: HighlightRect[];
}

export interface Highlight {
  id: string;
  paper_id: string;
  text: string;
  color: HighlightColor;
  page: number;
  position: HighlightPosition;
  note?: string | null;
  created_at: string;
}

export type NoteSource = 'manual' | 'ai_answer' | 'ai_summary';

export interface Note {
  id: string;
  paper_id: string;
  highlight_id?: string | null;
  title?: string | null;
  content: string;
  source: NoteSource;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AppConfig {
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  has_api_key: boolean;
  base_url: string;
  ollama_model: string;
}
