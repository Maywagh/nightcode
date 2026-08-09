import { createMiddleware } from "hono/factory";
import type { AuthenticatedEnv } from "./require-auth";
import { getAvailableCreditsBalance } from "../lib/polar";

export const requireCreditsBalance = createMiddleware<AuthenticatedEnv>(async (c, next) => {
  // Skip credits check in development mode for testing
  if (process.env.DEV_SKIP_CREDITS_CHECK === "true") {
    await next();
    return;
  }

  try {
    const userId = c.get("userId");
    const creditsBalance = await getAvailableCreditsBalance(userId);

    // This is a simple launch-time gate: only start new work when the customer
    // still has credits left. It does not reserve the full eventual cost of the
    // request, so low-volume apps may tolerate small overspend on edge cases.
    if (creditsBalance <= 0) {
      return c.json({ error: "No credits remaining. Run /upgrade to buy more credits." }, 402);
    }

    await next();
  } catch {
    return c.json({ error: "Unable to verify credits balance right now." }, 503);
  }
});
