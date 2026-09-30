import { useEffect, useState } from 'react';
import { TopBar } from './ui/TopBar';
import { Preview } from './ui/Preview';
import { Inspector } from './ui/Inspector';
import { Timeline } from './ui/Timeline';
import { useStore } from './state/store';
import { player } from './state/player';
import { deleteSelected, duplicateSelected, importDropped } from './state/actions';
import { spb } from './model/beats';

export function App() {
  const toast = useStore((s) => s.toast);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === 'Space') {
        e.preventDefault();
        player.toggle();
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        deleteSelected();
      } else if (e.key === 'Escape') {
        s.setFramingEdit(null);
        s.select(null);
      } else if (e.key === 'Home') {
        player.seek(0);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = spb(s.project) * (e.shiftKey ? s.project.beatsPerBar : 1);
        const beat = Math.round(s.playhead / step) * step;
        player.seek(beat + (e.key === 'ArrowRight' ? step : -step));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) importDropped(e.dataTransfer.files);
      }}
    >
      <TopBar />
      <main className="main">
        <Preview />
        <Inspector />
      </main>
      <Timeline />
      {toast && <div className="toast">{toast}</div>}
      {dragOver && <div className="drop-hint">Drop a screen recording, music, logo or project .json</div>}
    </div>
  );
}
