import { createContext, useContext, useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import type { ChatMessage, Highlight, HighlightColor, Note, Paper } from '../types';

export interface AppState {
  papers: Paper[];
  currentPaper: Paper | null;
  highlights: Highlight[];
  notes: Note[];

  activeColor: HighlightColor;
  activeHighlight: Highlight | null;

  messages: ChatMessage[];
  streaming: boolean;
  streamBuffer: string;
}

const initialState: AppState = {
  papers: [],
  currentPaper: null,
  highlights: [],
  notes: [],
  activeColor: 'yellow',
  activeHighlight: null,
  messages: [],
  streaming: false,
  streamBuffer: '',
};

export type Action =
  | { type: 'SET_PAPERS'; papers: Paper[] }
  | { type: 'ADD_PAPER'; paper: Paper }
  | { type: 'REMOVE_PAPER'; id: string }
  | { type: 'OPEN_PAPER'; paper: Paper; highlights: Highlight[]; notes: Note[] }
  | { type: 'CLOSE_PAPER' }
  | { type: 'ADD_HIGHLIGHT'; highlight: Highlight }
  | { type: 'UPDATE_HIGHLIGHT'; id: string; patch: Partial<Highlight> }
  | { type: 'REMOVE_HIGHLIGHT'; id: string }
  | { type: 'ADD_NOTE'; note: Note }
  | { type: 'UPDATE_NOTE'; id: string; patch: Partial<Note> }
  | { type: 'REMOVE_NOTE'; id: string }
  | { type: 'SET_ACTIVE_COLOR'; color: HighlightColor }
  | { type: 'SET_ACTIVE_HIGHLIGHT'; highlight: Highlight | null }
  | { type: 'CHAT_START'; userMessage: ChatMessage }
  | { type: 'CHAT_CHUNK'; text: string }
  | { type: 'CHAT_DONE'; finalText: string }
  | { type: 'CHAT_ERROR'; text: string }
  | { type: 'CHAT_RESET' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_PAPERS':
      return { ...state, papers: action.papers };
    case 'ADD_PAPER':
      return { ...state, papers: [action.paper, ...state.papers.filter((p) => p.id !== action.paper.id)] };
    case 'REMOVE_PAPER':
      return {
        ...state,
        papers: state.papers.filter((p) => p.id !== action.id),
        currentPaper: state.currentPaper?.id === action.id ? null : state.currentPaper,
      };
    case 'OPEN_PAPER':
      return {
        ...state,
        currentPaper: action.paper,
        highlights: action.highlights,
        notes: action.notes,
        messages: [],
        streamBuffer: '',
        activeHighlight: null,
      };
    case 'CLOSE_PAPER':
      return { ...state, currentPaper: null, highlights: [], notes: [], messages: [], streamBuffer: '' };
    case 'ADD_HIGHLIGHT':
      return { ...state, highlights: [...state.highlights, action.highlight] };
    case 'UPDATE_HIGHLIGHT':
      return {
        ...state,
        highlights: state.highlights.map((h) => (h.id === action.id ? { ...h, ...action.patch } : h)),
      };
    case 'REMOVE_HIGHLIGHT':
      return { ...state, highlights: state.highlights.filter((h) => h.id !== action.id) };
    case 'ADD_NOTE':
      return { ...state, notes: [action.note, ...state.notes] };
    case 'UPDATE_NOTE':
      return {
        ...state,
        notes: state.notes.map((n) => (n.id === action.id ? { ...n, ...action.patch } : n)),
      };
    case 'REMOVE_NOTE':
      return { ...state, notes: state.notes.filter((n) => n.id !== action.id) };
    case 'SET_ACTIVE_COLOR':
      return { ...state, activeColor: action.color };
    case 'SET_ACTIVE_HIGHLIGHT':
      return { ...state, activeHighlight: action.highlight };
    case 'CHAT_START':
      return {
        ...state,
        messages: [...state.messages, action.userMessage],
        streaming: true,
        streamBuffer: '',
      };
    case 'CHAT_CHUNK':
      return { ...state, streamBuffer: state.streamBuffer + action.text };
    case 'CHAT_DONE':
      return {
        ...state,
        messages: [...state.messages, { role: 'assistant', content: action.finalText }],
        streaming: false,
        streamBuffer: '',
      };
    case 'CHAT_ERROR':
      return {
        ...state,
        messages: [...state.messages, { role: 'assistant', content: `⚠️ ${action.text}` }],
        streaming: false,
        streamBuffer: '',
      };
    case 'CHAT_RESET':
      return { ...state, messages: [], streamBuffer: '', streaming: false };
    default:
      return state;
  }
}

interface Ctx {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}
const AppCtx = createContext<Ctx | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useAppStore must be used within AppStoreProvider');
  return ctx;
}
