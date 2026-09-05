import { promises as fs } from 'fs';
import { join, resolve } from 'path';

let INDEX: { symbol: string; path: string }[] = [];

async function walk(dir: string, root: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      await walk(p, root);
    } else if (e.isFile()) {
      if (!/\.tsx?$/.test(e.name) && !/\.jsx?$/.test(e.name) && !/\.js$/.test(e.name) && !/\.ts$/.test(e.name)) continue;
      const text = await fs.readFile(p, 'utf8');
      // naive symbol extraction: function, const/let/var <name> =, class <name>
      const re = /(?:function\s+([A-Za-z0-9_$]+)|class\s+([A-Za-z0-9_$]+)|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=)/g;
      let m;
      while ((m = re.exec(text))) {
        const symbol = (m[1] || m[2] || m[3]);
        if (symbol) INDEX.push({ symbol, path: p.replace(root + (process.platform === 'win32' ? '\\' : '/'), '') });
      }
    }
  }
}

export async function reindexWorkspace(rootPath?: string) {
  const root = rootPath ? resolve(rootPath) : resolve(process.cwd());
  INDEX = [];
  try {
    await walk(root, root);
    return { count: INDEX.length };
  } catch (err) {
    console.error('Indexer failed', err);
    throw err;
  }
}

export function searchSymbols(q: string, limit = 10) {
  if (!q) return [];
  const low = q.toLowerCase();
  const results = INDEX.filter(i => i.symbol.toLowerCase().includes(low));
  return results.slice(0, limit);
}

export function getIndexCount() { return INDEX.length; }
