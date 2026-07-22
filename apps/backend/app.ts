import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";

import { ApiError } from "./core/api-error";
import { authRouter } from "./features/auth/router";
import { categoryRouter } from "./features/category/router";
import { scheduleRouter } from "./features/schedule/router";
import { userRouter } from "./features/user/router";

export const app = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:3001", "http://127.0.0.1:3001"],
    allowMethods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["*"],
    credentials: true,
  }),
);

app.get("/ping", (c) => c.json({ message: "pong" }));

app.route("/", authRouter);
app.route("/", userRouter);
app.route("/", categoryRouter);
app.route("/", scheduleRouter);

if (process.env.NODE_ENV === "production") {
  // 本番コンテナでは React のビルド結果を同じオリジンから配信する。
  // API ルートを先に登録するため、API リクエストは静的ファイル配信へ流れない。
  app.use("/*", serveStatic({ root: "./public" }));
  app.get("*", serveStatic({ path: "./public/index.html" }));
}

app.onError((error, context) => {
  if (error instanceof ApiError) {
    return context.json({ code: error.code }, error.status);
  }

  console.error(error);
  return context.json({ code: "INTERNAL_SERVER_ERROR" }, 500);
});
