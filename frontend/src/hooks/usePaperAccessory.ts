import { useMemo } from 'react';
import type { Paper } from '../types';

export type TaitaiAccessory =
  | 'none'
  | 'glasses'     // CS / ML / AI papers
  | 'beaker'      // chemistry / materials
  | 'stethoscope' // medicine / biology
  | 'quill'       // history / philosophy / lit
  | 'equation'    // math / theorem-heavy
  | 'atom'        // physics
  | 'chip'        // electronics / systems
  | 'crown';      // well-cited or classical

/** Keyword → accessory mapping. Order matters: earlier wins. */
const RULES: { accessory: TaitaiAccessory; keywords: RegExp }[] = [
  { accessory: 'glasses',     keywords: /\b(neural|transformer|attention|gpt|llm|machine learning|deep learning|cnn|rnn|ai|artificial intelligence|reinforcement|embedding|tokeniz|prompt|nlp|computer vision|distill)\b|神经|机器学习|深度学习|注意力|大模型|嵌入|提示词|自然语言/i },
  { accessory: 'chip',        keywords: /\b(gpu|tpu|cuda|compiler|operating system|distributed|parallel|concurrent|consensus|raft|paxos|kernel|architecture|computer system|database|storage)\b|分布式|操作系统|并发|数据库|编译器|内核|架构/i },
  { accessory: 'atom',        keywords: /\b(physics|quantum|particle|cosmolog|relativ|thermodynamic|entropy|photon|electron|neutron)\b|物理|量子|粒子|宇宙|相对论|热力学/i },
  { accessory: 'beaker',      keywords: /\b(chemistry|chemical|catalyst|polymer|material|synthesis|molecule|compound|crystal)\b|化学|材料|催化|聚合物|分子/i },
  { accessory: 'stethoscope', keywords: /\b(medic|clinic|patient|disease|health|cancer|gene|protein|dna|rna|biolog|neuron|brain|pharma|drug|vaccin)\b|医学|临床|疾病|基因|蛋白|生物|药物|疫苗/i },
  { accessory: 'equation',    keywords: /\b(theorem|lemma|proof|algebra|topolog|geometry|calculus|probability|stochastic|optimization|convex|matrix|tensor)\b|定理|引理|证明|代数|拓扑|几何|微积分|概率|矩阵|张量/i },
  { accessory: 'quill',       keywords: /\b(history|philosophy|literature|cultural|social|ethic|sociolog|anthropolog|linguistic)\b|历史|哲学|文学|文化|社会|伦理|语言学/i },
];

/** Crown for papers that look "classic" (cited thousands of times, foundational). */
const CROWN_KEYWORDS = /\b(seminal|landmark|classic|foundational|review|survey)\b|综述|回顾|奠基/i;

export function usePaperAccessory(paper: Paper | null | undefined): TaitaiAccessory {
  return useMemo(() => {
    if (!paper) return 'none';
    const hay = `${paper.title} ${paper.authors?.join(' ') ?? ''} ${(paper.tags || []).join(' ')}`;
    if (CROWN_KEYWORDS.test(hay)) return 'crown';
    for (const { accessory, keywords } of RULES) {
      if (keywords.test(hay)) return accessory;
    }
    return 'none';
  }, [paper?.id, paper?.title, paper?.authors, paper?.tags]);
}

export const ACCESSORY_NAMES: Record<TaitaiAccessory, string> = {
  none: '',
  glasses: '🤓 小眼镜',
  beaker: '🧪 小烧瓶',
  stethoscope: '🩺 听诊器',
  quill: '🪶 羽毛笔',
  equation: '∑ 方程发箍',
  atom: '⚛ 原子环',
  chip: '🔌 电路耳',
  crown: '👑 小王冠',
};
