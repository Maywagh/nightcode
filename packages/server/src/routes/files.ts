import { Hono } from "hono";
import { promises as fs } from "fs";
import { join, resolve, dirname } from "path";

const app = new Hono();
const ROOT = resolve(process.cwd());

function safeResolve(p: string) {
  const target = resolve(ROOT, p || "");
  if (!target.startsWith(ROOT)) throw new Error("Path escape");
  return target;
}

app.get("/list", async (c) => {
  const q = c.req.query();
  const p = q.path || ".";
  try {
    const dir = safeResolve(p as string);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const items = await Promise.all(entries.map(async (e) => ({
      name: e.name,
      path: join(p as string, e.name),
      isDirectory: e.isDirectory(),
    })));
    return c.json({ items });
  } catch (err) {
    return c.json({ error: String(err) }, 400);
  }
});

app.get("/file", async (c) => {
  const q = c.req.query();
  const p = q.path as string | undefined;
  if (!p) return c.json({ error: "Missing path" }, 400);
  try {
    const file = safeResolve(p);
    const stat = await fs.stat(file);
    if (stat.isDirectory()) return c.json({ error: "Path is a directory" }, 400);
    const content = await fs.readFile(file, "utf8");
    return c.json({ path: p, content });
  } catch (err) {
    return c.json({ error: String(err) }, 400);
  }
});

app.post("/file", async (c) => {
  try {
    const body = await c.req.json();
    const { path: p, content } = body as { path?: string; content?: string };
    if (!p) return c.json({ error: "Missing path" }, 400);
    if (typeof content !== "string") return c.json({ error: "Missing content" }, 400);
    const file = safeResolve(p);
    // ensure parent exists
    const dir = dirname(file);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, content, "utf8");
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

export default app;
