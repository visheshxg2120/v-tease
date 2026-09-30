import { createRoot } from 'react-dom/client';
import { App } from './App';
import { player, startSync } from './state/player';
import { useStore } from './state/store';
import { rt } from './state/runtime';
import * as actions from './state/actions';
import './styles.css';

// Geist for both UI and the canvas renderer (canvas needs the faces loaded before drawing).
const faces: [string, string][] = [
  ['400', '/fonts/Geist-Regular.woff2'],
  ['500', '/fonts/Geist-Medium.woff2'],
  ['600', '/fonts/Geist-SemiBold.woff2'],
];
for (const [weight, url] of faces) {
  const f = new FontFace('Geist', `url(${url})`, { weight });
  document.fonts.add(f);
  f.load().catch(() => {});
}

startSync();

// Handy from the devtools console: __studio.useStore.getState(), __studio.rt, __studio.actions
Object.assign(window, { __studio: { useStore, rt, player, actions } });
createRoot(document.getElementById('root')!).render(<App />);
