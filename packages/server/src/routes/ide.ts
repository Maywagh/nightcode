import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { streamText } from "ai";
import { resolveChatModel } from "../lib/models";
import { requireCreditsBalance } from "../middleware/require-credits-balance";
import type { AuthenticatedEnv } from "../middleware/require-auth";

const app = new Hono<AuthenticatedEnv>();

const completionSchema = z.object({
  prompt: z.string().min(1),
  context: z.string().optional(),
  model: z.string().min(1),
});

const completionValidator = zValidator("json", completionSchema, (result, c) => {
  if (!result.success) return c.json({ error: "Invalid request body" }, 400);
});

// Simple code completion endpoint
app.post("/completions", requireCreditsBalance, completionValidator, async (c) => {
  const body = c.req.valid("json");
  const { prompt, context, model } = body;
  const start = Date.now();

  let resolved;
  try {
    resolved = resolveChatModel(model);
  } catch (err) {
    return c.json({ error: "Unsupported model" }, 400);
  }

  const system = `You are a code completion assistant. The user will provide a code context and a prompt indicating what to complete. Respond only with the completion text unless asked otherwise.`;

  const result = streamText({
    model: resolved.model,
    system,
    messages: [
      { role: "user", content: `${context ?? ""}\n\n${prompt}` },
    ],
    providerOptions: resolved.providerOptions,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: [],
    messageMetadata() {
      return { model, durationMs: Date.now() - start };
    },
    async onFinish() {
      // no-op for now; completion usage ingestion can be added later
    },
  });
});

const chatSchema = z.object({ prompt: z.string().min(1), model: z.string().min(1) });
const chatValidator = zValidator("json", chatSchema, (r, c) => { if (!r.success) return c.json({ error: "Invalid request body" }, 400); });

app.post("/chat", requireCreditsBalance, chatValidator, async (c) => {
  const { prompt, model } = c.req.valid("json");
  const start = Date.now();
  let resolved;
  try { resolved = resolveChatModel(model); } catch { return c.json({ error: "Unsupported model" }, 400); }

  const system = `You are a helpful coding assistant.`;

  const result = streamText({
    model: resolved.model,
    system,
    messages: [{ role: "user", content: prompt }],
    providerOptions: resolved.providerOptions,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: [],
    messageMetadata() { return { model, durationMs: Date.now() - start }; },
  });
});

const codeActionSchema = z.object({ code: z.string().min(1), cursor: z.number().int().nonnegative().optional(), model: z.string().min(1) });
const codeActionValidator = zValidator("json", codeActionSchema, (r, c) => { if (!r.success) return c.json({ error: "Invalid request body" }, 400); });

app.post("/code-actions", requireCreditsBalance, codeActionValidator, async (c) => {
  const { code, cursor, model } = c.req.valid("json");
  const start = Date.now();
  let resolved;
  try { resolved = resolveChatModel(model); } catch { return c.json({ error: "Unsupported model" }, 400); }

  const system = `You are a code assistant that suggests code actions (refactors, fixes, explanations). Return JSON with keys: action, patch (optional), explanation.`;

  const result = streamText({
    model: resolved.model,
    system,
    messages: [{ role: "user", content: `Code:\n${code}\nCursor:${cursor ?? -1}\nProvide a single JSON object with action, patch, explanation.` }],
    providerOptions: resolved.providerOptions,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: [],
    messageMetadata() { return { model, durationMs: Date.now() - start }; },
  });
});

export default app;
