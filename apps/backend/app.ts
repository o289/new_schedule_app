import { Hono } from "hono";
import { cors } from "hono/cors";

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

app.onError((error, context) => {
  if (error instanceof ApiError) {
    return context.json({ code: error.code }, error.status);
  }

  console.error(error);
  return context.json({ code: "INTERNAL_SERVER_ERROR" }, 500);
});
