import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "node:http";
import handler from "./handler.js";
import { handleDiscordRequest } from "./discord-interactions.js";
const app = express();
const httpServer = createServer(app);
app.all(
  "/api/discord",
  express.raw({ type: "*/*", limit: "64kb" }),
  async (req, res) => {
    const request = new Request("http://127.0.0.1/api/discord", {
      method: req.method,
      headers: req.headers,
      ...(!["GET", "HEAD"].includes(req.method) ? { body: req.body } : {}),
    });
    const response = await handleDiscordRequest(request, (job) =>
      job.catch(() => {}),
    );
    res.status(response.status);
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.send(Buffer.from(await response.arrayBuffer()));
  },
);
app.use(express.json({ limit: "64kb" }));
app.all("/api/app", handler);
const vite = await createViteServer({
  server: { middlewareMode: true, hmr: { server: httpServer } },
  appType: "spa",
});
app.use(vite.middlewares);
httpServer.listen(Number(process.env.PORT) || 5173, "127.0.0.1", () =>
  console.log("DNWeb: http://127.0.0.1:" + (process.env.PORT || 5173)),
);
