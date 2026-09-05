import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { requireAuth } from "./middleware/require-auth";
import sessions from "./routes/sessions";
import chat from "./routes/chat";
import devChat from "./routes/dev-chat";
import ide from "./routes/ide";
import ideUi from "./routes/ide-ui";
import files from "./routes/files";
import inline from "./routes/inline";
import indexer from "./routes/indexer";
import lsp from "./routes/lsp";
import auth from "./routes/auth";
import billing from "./routes/billing";
import { rateLimit } from "./middleware/rate-limit";

// start file watcher (auto-import side-effect)
import "./lib/watcher";

const app = new Hono();

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ 
      error: error.message || "Request failed",
    }, error.status);
  };

  console.error("Unhandled server error", error);
  return c.json({ error: "Internal server error" }, 500);
});

app.use("/sessions/*", requireAuth);
app.use("/chat/*", requireAuth);
// Dev bypass: set a fake userId when DEV_BYPASS_AUTH is enabled so local IDE can be used without OAuth
app.use("/ide/*", async (c, next) => {
  if (process.env.DEV_BYPASS_AUTH === "true") {
    c.set('userId', 'dev-user');
  }
  return await next();
});
app.use("/ide/*", requireAuth);
app.use("/ide/*", rateLimit({ capacity: 120, refillPerSec: 2 }));
app.use("/billing/checkout", requireAuth);
app.use("/billing/portal", requireAuth);

const routes = app
  .route("/dev-chat", devChat)
  .route("/auth", auth)
  .route("/billing", billing)
  .route("/sessions", sessions)
  .route("/chat", chat)
  .route("/ide", ide)
  .route("/ide/ui", ideUi)
  .route("/ide/files", files)
  .route("/ide/inline", inline)
  .route("/ide/index", indexer)
  .route("/ide/lsp", lsp);

export type AppType = typeof routes;
// idleTimeout must be high, otherwise LLM tool calls might not complete
export default { port: 3000, fetch: app.fetch, idleTimeout: 255 };
