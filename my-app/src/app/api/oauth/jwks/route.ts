import { getPublicJwks } from "@/lib/mcp/tokens";
import { corsJson, corsPreflight } from "@/lib/mcp/cors";

export async function GET() {
  return corsJson(await getPublicJwks(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

export function OPTIONS() {
  return corsPreflight();
}
