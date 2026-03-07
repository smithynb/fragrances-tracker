# Clerk App Router Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Clerk to the Next.js App Router application in `my-app` using keyless mode and the current Clerk middleware/layout integration.

**Architecture:** Install the Clerk Next.js SDK in the existing `my-app` workspace, register `clerkMiddleware()` in `src/proxy.ts`, and wrap the app shell with `ClerkProvider` in `src/app/layout.tsx`. Keep the existing provider stack and collection UI intact by adding a small auth header rail that uses Clerk’s control components.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Clerk, Bun

---

### Task 1: Install Clerk SDK

**Files:**
- Modify: `my-app/package.json`
- Modify: `my-app/bun.lock`

**Step 1: Install the dependency**

Run: `bun add @clerk/nextjs@latest`
Expected: Bun adds the latest Clerk SDK and updates `package.json` plus `bun.lock`.

**Step 2: Verify the dependency entry**

Run: `sed -n '1,220p' my-app/package.json`
Expected: `@clerk/nextjs` appears under `dependencies`.

### Task 2: Add Clerk middleware

**Files:**
- Create: `my-app/src/proxy.ts`

**Step 1: Create the proxy file**

Add the Clerk middleware export and matcher configuration using `clerkMiddleware()` from `@clerk/nextjs/server`.

**Step 2: Verify the middleware file**

Run: `sed -n '1,220p' my-app/src/proxy.ts`
Expected: The file exports `default clerkMiddleware()` and the required `config.matcher`.

### Task 3: Wrap the App Router layout with Clerk

**Files:**
- Modify: `my-app/src/app/layout.tsx`

**Step 1: Add Clerk imports**

Import `ClerkProvider`, `Show`, `SignInButton`, `SignUpButton`, and `UserButton` from `@clerk/nextjs`.

**Step 2: Add the provider and auth controls**

Wrap the existing layout contents with `ClerkProvider` inside `<body>` and add a small header/auth rail that uses `<Show when="signed-out">` and `<Show when="signed-in">`.

**Step 3: Preserve existing providers**

Keep `Providers` in place so theme and Convex behavior remain unchanged.

### Task 4: Verify integration

**Files:**
- Verify: `my-app/src/proxy.ts`
- Verify: `my-app/src/app/layout.tsx`

**Step 1: Run lint**

Run: `bun run lint`
Expected: The updated files compile cleanly with no import or type errors.

**Step 2: Spot-check required rules**

Run: `rg -n "clerkMiddleware|ClerkProvider|Show|SignedIn|SignedOut|@clerk/nextjs" my-app/src my-app/package.json`
Expected: `clerkMiddleware`, `ClerkProvider`, and `Show` are present; deprecated `SignedIn` and `SignedOut` are absent.
