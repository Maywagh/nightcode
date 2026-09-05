import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { resolveChatModel } from '../lib/models';
import { streamText } from 'ai';
import { searchSymbols } from '../lib/indexer';

const app = new Hono();

const schema = z.object({ action: z.enum(['complete','definition','explain']), code: z.string().min(0), cursor: z.number().int().nonnegative().optional(), model: z.string().optional() });
const validator = zValidator('json', schema, (r,c) => { if (!r.success) return c.json({ error: 'Invalid request body' }, 400); });

app.post('/', validator, async (c) => {
  const { action, code, cursor } = c.req.valid('json');
  const modelId = (c.req.valid('json') as any).model || 'sarvam-105b';

  let resolved;
  try { resolved = resolveChatModel(modelId); } catch { return c.json({ error: 'Unsupported model' }, 400); }

  // Use index to gather nearby symbols for context
  let symbols = [];
  try {
    const query = code.slice(Math.max(0, (cursor||0) - 200), cursor || code.length).split(/\W+/).slice(-3).join(' ');
    symbols = searchSymbols(query, 10);
  } catch {}

  if (action === 'definition') {
    // find symbol exact
    const q = code.slice(Math.max(0, (cursor||0) - 100), cursor || code.length).match(/[A-Za-z0-9_$]+$/);
    const sym = q ? q[0] : undefined;
    if (sym) {
      const found = searchSymbols(sym, 5);
      return c.json({ definitions: found });
    }
    return c.json({ definitions: [] });
  }

  // Build prompt for completions or explanation
  let system = '';
  let user = '';
  if (action === 'complete') {
    system = 'You are a code completion assistant. Provide a single completion snippet that fits the code context. Prefer concise, compileable code.';
    user = `Symbols nearby: ${symbols.map(s=>s.symbol).join(', ')}\n---\nCode context:\n${code}\nCursor:${cursor ?? -1}`;
  } else if (action === 'explain') {
    system = 'You are a code explainer. Provide a short explanation of the highlighted code.';
    user = `Code:\n${code}\nCursor:${cursor ?? -1}`;
  }

  const stream = streamText({
    model: resolved.model,
    system,
    messages: [{ role: 'user', content: user }],
    providerOptions: resolved.providerOptions,
    maxTokens: 512,
  });

  // stream back as text
  return stream.toUIMessageStreamResponse({
    originalMessages: [],
    messageMetadata() { return { model: modelId }; }
  });
});

export default app;
