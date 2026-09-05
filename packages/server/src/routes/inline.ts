import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { streamText } from "ai";
import { resolveChatModel } from "../lib/models";

const app = new Hono();

const schema = z.object({ code: z.string().min(0), cursor: z.number().int().nonnegative().optional(), model: z.string().min(1).optional() });
const validator = zValidator("json", schema, (r, c) => { if (!r.success) return c.json({ error: "Invalid request body" }, 400); });

app.post("/", validator, async (c) => {
  const { code, cursor } = c.req.valid("json");
  const modelId = (c.req.valid("json") as any).model || "sarvam-105b";

  let resolved;
  try { resolved = resolveChatModel(modelId); } catch { return c.json({ error: "Unsupported model" }, 400); }

  const marker = `/*cursor:${cursor ?? -1}*/`;
  const prompt = `Provide up to 5 short completion candidates for the code around the cursor. Return plain text candidates separated by the line '===CANDIDATE===' without extra commentary. Code:\n${code.replace(/```/g, '\\`\\`\\`')}\n${marker}`;

  const stream = streamText({
    model: resolved.model,
    system: `You are a code completion assistant. Provide multiple short completion candidates separated by EXACT line '===CANDIDATE===' (no other separators).`,
    messages: [{ role: 'user', content: prompt }],
    providerOptions: resolved.providerOptions,
  });

  // collect stream into a string
  let collected = '';
  try {
    for await (const chunk of stream.content()) {
      collected += String(chunk);
    }
  } catch (err) {
    // fallback: try to drain promise
    try { const text = await stream.toString(); collected += text; } catch { }
  }

  // split candidates
  const raw = collected.split('\n===CANDIDATE===\n').map(s => s.trim()).filter(Boolean).slice(0,5);
  const items = raw.map((r, i) => ({ label: r.split('\n')[0].slice(0,80), insertText: r }));

  return c.json({ items });
});

export default app;
