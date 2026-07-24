// convex/crons.ts
// Daily purge of expired MCP OAuth rows (see convex/cleanup.ts).
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "purge expired oauth codes, refresh tokens, and PATs",
  { hourUTC: 9, minuteUTC: 0 },
  internal.cleanup.purgeExpired,
);

export default crons;
