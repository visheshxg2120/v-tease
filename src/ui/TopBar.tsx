import { useState } from 'react';
import { useStore } from '../state/store';
import { player } from '../state/player';
import { formatBarBeat, formatTime, projectDuration, timeToBeat } from '../model/beats';
import {
  importLogo,
  importMusic,
  importRecording,
  loadSample,
  newProject,
  openProjectJson,
  saveProjectJson,
  setStyle,
} from '../state/actions';
import { Btn, Select } from './controls';
import { ExportDialog } from './ExportDialog';

export function TopBar() {
  const p = useStore((s) => s.project);
  const playhead = useStore((s) => s.playhead);
  const playing = useStore((s) => s.playing);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const [exporting, setExporting] = useState(false);
  const [menu, setMenu] = useState(false);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo-mark" />
        Teaser Studio
      </div>
      <div className="menu-wrap">
        <Btn kind="ghost" onClick={() => setMenu((m) => !m)}>
          File ▾
        </Btn>
        {menu && (
          <div className="menu" onMouseLeave={() => setMenu(false)} onClick={() => setMenu(false)}>
            <button onClick={newProject}>New project</button>
            <button onClick={loadSample}>Load sample project</button>
            <hr />
            <button onClick={openProjectJson}>Open project (.json)…</button>
            <button onClick={saveProjectJson}>Save project (.json)</button>
            <hr />
            <button onClick={() => importRecording()}>Import screen recording…</button>
            <button onClick={() => importMusic()}>Import music…</button>
            <button onClick={() => importLogo()}>Import logo…</button>
          </div>
        )}
      </div>
      <input className="proj-name" value={p.name} onChange={(e) => useStore.getState().update((d) => (d.name = e.target.value), 'name')} />
      <div className="undo">
        <Btn kind="ghost" small disabled={!canUndo} onClick={() => useStore.getState().undo()} title="Undo (⌘Z)">
          ↶
        </Btn>
        <Btn kind="ghost" small disabled={!canRedo} onClick={() => useStore.getState().redo()} title="Redo (⇧⌘Z)">
          ↷
        </Btn>
      </div>
      <div className="transport">
        <button className="tbtn" onClick={() => player.seek(0)} title="To start (Home)">
          ⏮
        </button>
        <button className="tbtn play" onClick={() => player.toggle()} title="Play / pause (Space)">
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="clock">
          <span className="mono big">{formatBarBeat(p, timeToBeat(p, playhead))}</span>
          <span className="mono muted">
            {formatTime(playhead)} / {formatTime(projectDuration(p))}
          </span>
        </div>
      </div>
      <span className="spacer" />
      <Select
        value={p.style}
        options={[
          { value: 'minimal', label: 'Minimal' },
          { value: 'playful', label: 'Playful' },
        ]}
        onChange={setStyle}
      />
      <Btn kind="primary" onClick={() => setExporting(true)}>
        Export MP4
      </Btn>
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </header>
  );
}
