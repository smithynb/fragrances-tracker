import { appOrigin, corsJson, corsPreflight } from "@/lib/mcp/cors";

export function GET() {
  const origin = appOrigin();
  return corsJson({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["read", "write"],
  });
}

export function OPTIONS() {
  return corsPreflight();
}
