#!/usr/bin/env bash
# Smoke-tests the MCP OAuth surface. Usage:
#   ./scripts/oauth-smoke.sh http://localhost:3000 [revoked-pat]
# Pass a *revoked* PAT as $2 to also assert the 401 path for dead tokens.
set -euo pipefail
BASE="${1:?usage: oauth-smoke.sh <base-url> [revoked-pat]}"
REVOKED_PAT="${2:-}"
PASS=0; FAIL=0

check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "ok   $1"; else FAIL=$((FAIL+1)); echo "FAIL $1 (expected $2, got $3)"; fi
}
json_field() { python3 -c "import json,sys; print(json.load(sys.stdin).get('$1',''))"; }
status_of() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

# ── Discovery metadata ──
check "AS metadata 200" 200 "$(status_of "$BASE/.well-known/oauth-authorization-server")"
check "PRM root 200" 200 "$(status_of "$BASE/.well-known/oauth-protected-resource")"
check "PRM path-suffixed 200" 200 "$(status_of "$BASE/.well-known/oauth-protected-resource/api/mcp")"
check "JWKS 200" 200 "$(status_of "$BASE/api/oauth/jwks")"
check "metadata CORS" "*" "$(curl -s -D - -o /dev/null "$BASE/.well-known/oauth-authorization-server" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
check "metadata OPTIONS 204" 204 "$(status_of -X OPTIONS "$BASE/.well-known/oauth-authorization-server")"
check "JWKS has no private fields" "" "$(curl -s "$BASE/api/oauth/jwks" | python3 -c "import json,sys; print(''.join(f for k in json.load(sys.stdin)['keys'] for f in ('d','p','q') if f in k))")"

# ── DCR ──
REG=$(curl -s -X POST "$BASE/api/oauth/register" -H "Content-Type: application/json" \
  -d '{"client_name":"smoke-test","redirect_uris":["http://localhost:9999/cb"]}')
CID=$(echo "$REG" | json_field client_id)
check "DCR returns client_id" "yes" "$([ -n "$CID" ] && echo yes || echo no)"
check "DCR bad URI rejected" "invalid_redirect_uri" "$(curl -s -X POST "$BASE/api/oauth/register" \
  -H "Content-Type: application/json" -d '{"client_name":"x","redirect_uris":["http://evil.com/cb"]}' | json_field error)"

# ── Token endpoint error semantics ──
check "unsupported grant type" "unsupported_grant_type" \
  "$(curl -s -X POST "$BASE/api/oauth/token" -d 'grant_type=password' | json_field error)"
check "missing params invalid_request" "invalid_request" \
  "$(curl -s -X POST "$BASE/api/oauth/token" -d 'grant_type=authorization_code&code=x' | json_field error)"
check "bogus code invalid_grant" "invalid_grant" \
  "$(curl -s -X POST "$BASE/api/oauth/token" \
    -d "grant_type=authorization_code&code=bogus&code_verifier=bogusverifierbogusverifierbogusverifier1234&client_id=$CID&redirect_uri=http://localhost:9999/cb" | json_field error)"
check "bogus refresh invalid_grant" "invalid_grant" \
  "$(curl -s -X POST "$BASE/api/oauth/token" -d "grant_type=refresh_token&refresh_token=bogus&client_id=$CID" | json_field error)"
check "token no-store" "no-store" \
  "$(curl -s -D - -o /dev/null -X POST "$BASE/api/oauth/token" -d 'grant_type=password' | tr -d '\r' | awk -F': ' 'tolower($1)=="cache-control"{print $2}')"

# ── MCP endpoint auth ──
MCP_ARGS=(-X POST "$BASE/api/mcp" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}')
check "MCP unauthenticated 401" 401 "$(status_of "${MCP_ARGS[@]}")"
check "401 advertises resource metadata" "yes" \
  "$(curl -s -D - -o /dev/null "${MCP_ARGS[@]}" | grep -qi 'www-authenticate.*resource_metadata' && echo yes || echo no)"
if [ -n "$REVOKED_PAT" ]; then
  check "revoked PAT 401" 401 "$(status_of "${MCP_ARGS[@]}" -H "Authorization: Bearer $REVOKED_PAT")"
fi

echo; echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
