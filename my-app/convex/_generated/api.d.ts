/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiTokens from "../apiTokens.js";
import type * as auth from "../auth.js";
import type * as bottles from "../bottles.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as insights from "../insights.js";
import type * as oauth from "../oauth.js";
import type * as patch from "../patch.js";
import type * as rateLimits from "../rateLimits.js";
import type * as users from "../users.js";
import type * as wearLogs from "../wearLogs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiTokens: typeof apiTokens;
  auth: typeof auth;
  bottles: typeof bottles;
  helpers: typeof helpers;
  http: typeof http;
  insights: typeof insights;
  oauth: typeof oauth;
  patch: typeof patch;
  rateLimits: typeof rateLimits;
  users: typeof users;
  wearLogs: typeof wearLogs;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
