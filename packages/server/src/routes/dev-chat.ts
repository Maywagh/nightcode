import { Hono } from "hono";
import {
  convertToModelMessages,
  streamText,
  validateUIMessages,
  type InferUITools,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";
import { getToolContracts, modeSchema, type ModeType, type ToolContracts } from "@nightcode/shared";
import { buildSystemPrompt } from "../system-prompt";

type ChatMessageMetadata = {
  mode?: ModeType;
  model?: string;
  durationMs?: number;
  usage?: LanguageModelUsage;
};

type NightcodeUIMessage = UIMessage<ChatMessageMetadata, never, InferUITools<ToolContracts>>;

const submitSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    messages: { type: "array" },
    mode: { type: "string" },
    model: { type: "string" },
  },
  required: ["id", "messages", "mode", "model"],
};

const app = new Hono();

app.post("/", async (c) => {
  try {
    const json = await c.req.json();
    const { id, messages, mode, model } = json;

    // basic validation
    if (!Array.isArray(messages) || messages.length === 0) {
      return c.json({ error: "Invalid messages" }, 400);
    }

    const tools = getToolContracts(mode);

    // sanitize messages like the main chat route
    const sanitizedMessages = messages.filter((m: any) => Array.isArray(m.parts) && m.parts.length > 0);

    const nextMessages = await validateUIMessages<NightcodeUIMessage>({
      messages: sanitizedMessages,
      tools,
    });

    const modelMessages = await convertToModelMessages(nextMessages, { tools });

    let completedUsage: LanguageModelUsage | null = null;

    const result = streamText({
      model,
      system: buildSystemPrompt({ mode }),
      messages: modelMessages,
      tools,
      onFinish(event) {
        completedUsage = event.totalUsage;
      },
    });

    return result.toUIMessageStreamResponse<NightcodeUIMessage>({
      originalMessages: nextMessages,
      messageMetadata({ part }) {
        if (part.type === "start") return { mode, model };
        if (part.type !== "finish") return undefined;
        return {
          mode,
          model,
          durationMs: 0,
          ...(completedUsage ? { usage: completedUsage } : {}),
        };
      },
      onFinish() {},
      onError(error) {
        return error instanceof Error ? error.message : String(error);
      },
    });
  } catch (err) {
    console.error("Dev chat error", err);
    return c.json({ error: "Dev chat failure" }, 500);
  }
});

export default app;
