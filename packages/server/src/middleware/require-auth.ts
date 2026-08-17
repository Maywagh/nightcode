import { createMiddleware } from "hono/factory";
import { authenticateOAuthRequest } from "../lib/auth";

export type AuthenticatedEnv = {
  Variables: {
    userId: string;
  };
};

export const requireAuth = createMiddleware<AuthenticatedEnv>(async (c, next) => {
  // Dev bypass for local testing
  if (process.env.DEV_BYPASS_AUTH === "true") {
    const devUser = process.env.DEV_USER_ID || "dev-user";
    c.set("userId", devUser as any);
    await next();
    return;
  }

  try {
    const auth = await authenticateOAuthRequest(c.req.raw);
    if (!auth) {
      return c.json({ error: "Unauthorized. Run /login to continue." }, 401);
    }

    c.set("userId", auth.userId);
    await next();
  } catch {
    return c.json({ error: "Unauthorized. Run /login to continue." }, 401);
  }
});

