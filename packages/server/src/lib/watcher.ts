import { reindexWorkspace } from './indexer';
import { resolve } from 'path';

let chokidar: any;
try { chokidar = require('chokidar'); } catch (e) { chokidar = null; }

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
    if (chokidar) {
      const watcher = chokidar.watch(root, { ignored: /(^|[\\/\\\\])\.(git|node_modules)/, persistent: true, ignoreInitial: false });
      watcher.on('all', (event: string, path: string) => {
        if (!path) return;
        scheduleReindex(root);
      });
      // initial index
      scheduleReindex(root);
      console.log('Chokidar watcher started on', root);
      return watcher;
    } else {
      // fallback to fs.watch
      const { watch } = require('fs');
      const w = watch(root, { recursive: true }, (_eventType: any, filename: string) => {
        if (!filename) return;
        if (filename.includes('node_modules') || filename.includes('.git')) return;
        scheduleReindex(root);
      });
      scheduleReindex(root);
      console.log('FS.watch fallback watcher started on', root);
      return w;
    }
  } catch (err) {
    console.error('Failed to start watcher', err);
    return null;
  }
}

// Auto-start when imported
try { startWatcher(); } catch (e) { console.warn('Watcher could not start', e); }
