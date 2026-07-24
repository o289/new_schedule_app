import { Hono, type Context, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";

import { ApiError } from "./core/api-error";
import { authRouter } from "./features/auth/router";
import { categoryRouter } from "./features/category/router";
import { scheduleRouter } from "./features/schedule/router";
import { userRouter } from "./features/user/router";

export const app = new Hono();

const noStore: MiddlewareHandler = async (context, next) => {
  await next();
  context.header("Cache-Control", "no-store");
};

const setStaticCacheHeader = (path: string, context: Context) => {
  if (/-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(path)) {
    context.header("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }

  context.header("Cache-Control", "no-cache");
};

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

// 認証状態やユーザー固有データを含むAPIは、ブラウザ・中継キャッシュへ保存させない。
app.use("/auth/*", noStore);
app.use("/categories/*", noStore);
app.use("/schedules/*", noStore);

app.route("/", authRouter);
app.route("/", userRouter);
app.route("/", categoryRouter);
app.route("/", scheduleRouter);

if (process.env.NODE_ENV === "production") {
  // 本番コンテナでは React のビルド結果を同じオリジンから配信する。
  // API ルートを先に登録するため、API リクエストは静的ファイル配信へ流れない。
  app.use(
    "/*",
    serveStatic({ root: "./public", onFound: setStaticCacheHeader }),
  );
  app.get(
    "*",
    serveStatic({ path: "./public/index.html", onFound: setStaticCacheHeader }),
  );
}

app.onError((error, context) => {
  if (error instanceof ApiError) {
    return context.json({ code: error.code }, error.status);
  }

  console.error(error);
  return context.json({ code: "INTERNAL_SERVER_ERROR" }, 500);
});
