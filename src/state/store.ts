import { create } from 'zustand';
import type { Block, Project } from '../model/types';
import { sampleProject } from '../model/sample';
import { projectDuration } from '../model/beats';

const AUTOSAVE_KEY = 'teaser-studio:project';

function loadInitial(): Project {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Project;
      if (p?.version === 1) return p;
    }
  } catch {
    /* ignore */
  }
  return sampleProject();
}

export type Snap = 0.25 | 0.5 | 1 | 4;

interface State {
  project: Project;
  selectedId: string | null;
  playhead: number;
  playing: boolean;
  snap: Snap;
  pxPerBeat: number;
  toast: string | null;
  framingEdit: { blockId: string; which: 'start' | 'end' } | null;
  past: Project[];
  future: Project[];
  lastHistoryKey: string | null;
  lastHistoryAt: number;

  /** Mutate a draft of the project. Same historyKey within 800 ms coalesces into one undo step. */
  update: (fn: (p: Project) => void, historyKey?: string) => void;
  updateBlock: (id: string, fn: (b: Block) => void, historyKey?: string) => void;
  setProject: (p: Project, resetHistory?: boolean) => void;
  select: (id: string | null) => void;
  setPlayhead: (t: number) => void;
  setPlaying: (v: boolean) => void;
  setSnap: (s: Snap) => void;
  setZoom: (px: number) => void;
  showToast: (msg: string) => void;
  setFramingEdit: (v: State['framingEdit']) => void;
  undo: () => void;
  redo: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((set, get) => ({
  project: loadInitial(),
  selectedId: null,
  playhead: 0,
  playing: false,
  snap: 1,
  pxPerBeat: 34,
  toast: null,
  framingEdit: null,
  past: [],
  future: [],
  lastHistoryKey: null,
  lastHistoryAt: 0,

  update: (fn, historyKey) => {
    const s = get();
    const draft = structuredClone(s.project);
    fn(draft);
    const now = performance.now();
    const coalesce = historyKey != null && historyKey === s.lastHistoryKey && now - s.lastHistoryAt < 800;
    set({
      project: draft,
      past: coalesce ? s.past : [...s.past.slice(-99), s.project],
      future: [],
      lastHistoryKey: historyKey ?? null,
      lastHistoryAt: now,
    });
  },
  updateBlock: (id, fn, historyKey) =>
    get().update((p) => {
      const b = p.blocks.find((x) => x.id === id);
      if (b) fn(b);
    }, historyKey),
  setProject: (p, resetHistory = true) =>
    set((s) => ({
      project: p,
      past: resetHistory ? [] : [...s.past, s.project],
      future: [],
      selectedId: null,
      playhead: Math.min(s.playhead, projectDuration(p)),
    })),
  select: (id) => set({ selectedId: id }),
  setPlayhead: (t) => set({ playhead: Math.max(0, Math.min(t, projectDuration(get().project))) }),
  setPlaying: (v) => set({ playing: v }),
  setSnap: (snap) => set({ snap }),
  setZoom: (pxPerBeat) => set({ pxPerBeat: Math.max(8, Math.min(160, pxPerBeat)) }),
  showToast: (msg) => {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 3500);
  },
  setFramingEdit: (framingEdit) => set({ framingEdit }),
  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    set({ project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future], lastHistoryKey: null });
  },
  redo: () => {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    set({ project: next, past: [...s.past, s.project], future: s.future.slice(1), lastHistoryKey: null });
  },
}));

// autosave (debounced)
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.project === prev.project) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(s.project));
    } catch {
      /* quota */
    }
  }, 400);
});

export const selectedBlock = (s: State) => s.project.blocks.find((b) => b.id === s.selectedId) ?? null;
