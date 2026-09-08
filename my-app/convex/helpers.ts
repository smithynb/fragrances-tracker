import { getAuthUserId } from "@convex-dev/auth/server";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

export async function getOptionalUserId(ctx: QueryCtx | MutationCtx): Promise<Id<"users"> | null> {
  return await getAuthUserId(ctx);
}

export async function getUserId(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getOptionalUserId(ctx);
  if (userId === null) {
    throw new Error("Unauthenticated.");
  }
  return userId;
}

const OWNED_DOC_LABELS = {
  bottles: "Bottle",
  wearLogs: "Wear log",
} as const;

type OwnedTable = keyof typeof OWNED_DOC_LABELS;

/**
 * Fetches a document and verifies it belongs to the given user. Throws the
 * same "not found or access denied" error for both the missing and the
 * foreign-owner case so responses never leak whether another user's
 * document exists.
 */
export async function getOwnedDoc<T extends OwnedTable>(
  ctx: QueryCtx | MutationCtx,
  table: T,
  id: Id<T>,
  userId: Id<"users">,
): Promise<Doc<T>> {
  // Cast: TS can't prove `userId` exists on Doc<T> for a generic T, but both
  // owned tables carry it in the schema.
  const doc = (await ctx.db.get(id)) as Doc<OwnedTable> | null;
  if (!doc || doc.userId !== userId) {
    throw new Error(`${OWNED_DOC_LABELS[table]} not found or access denied.`);
  }
  return doc as unknown as Doc<T>;
}

/**
 * Fetches an owned bottle that is still active. Tombstoned bottles use the
 * same ownership-safe error as missing and foreign bottles so background
 * deletion state never expands the public information surface.
 */
export async function getActiveOwnedBottle(
  ctx: QueryCtx | MutationCtx,
  bottleId: Id<"bottles">,
  userId: Id<"users">,
): Promise<Doc<"bottles">> {
  const bottle = await getOwnedDoc(ctx, "bottles", bottleId, userId);
  if (bottle.deletingAt !== undefined) {
    throw new Error("Bottle not found or access denied.");
  }
  return bottle;
}
