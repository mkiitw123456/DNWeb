import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "node:http";
import handler from "./handler.js";
const app = express();
const httpServer = createServer(app);
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
