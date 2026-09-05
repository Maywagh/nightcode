import { Hono } from 'hono';
import { reindexWorkspace, searchSymbols, getIndexCount } from '../lib/indexer';

const app = new Hono();

app.post('/reindex', async (c) => {
  try {
    const res = await reindexWorkspace();
    return c.json({ ok: true, count: res.count });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

app.get('/search', (c) => {
  const q = c.req.query().q as string | undefined;
  if (!q) return c.json({ items: [] });
  const results = searchSymbols(q, 20);
  return c.json({ items: results, count: getIndexCount() });
});

export default app;
