import { reindexWorkspace } from './indexer';
import { watch } from 'fs';
import { resolve } from 'path';

let debounce: NodeJS.Timeout | null = null;

function scheduleReindex(root?: string) {
  if (debounce) clearTimeout(debounce as any);
  debounce = setTimeout(async () => {
    try {
      const r = await reindexWorkspace(root);
      console.log('Workspace reindexed, symbol count=', r.count);
    } catch (err) {
      console.error('Reindex failed', err);
    }
  }, 500);
}

export function startWatcher(rootPath?: string) {
  const root = resolve(rootPath || process.cwd());
  try {
    // fs.watch with recursive true works on Windows and macOS.
    const w = watch(root, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      if (filename.includes('node_modules') || filename.includes('.git')) return;
      // schedule reindex
      scheduleReindex(root);
    });

    // initial index
    scheduleReindex(root);

    console.log('File watcher started on', root);
    return w;
  } catch (err) {
    console.error('Failed to start watcher', err);
    return null;
  }
}

// Auto-start when imported
try { startWatcher(); } catch (e) { console.warn('Watcher could not start', e); }
