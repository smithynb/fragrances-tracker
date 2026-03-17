// Convex app config — registers components (like the rate limiter) that the
// application needs.  Adding a new component here requires running
// `npx convex dev` (or `npx convex deploy`) so that Convex provisions the
// backing tables the component needs.
import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";

const app = defineApp();
app.use(rateLimiter);

export default app;
