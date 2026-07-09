# MCP Spike Findings (sub-plan 0 — consumed by sub-plans 2–4)

## Pinned versions
| Package | Resolved version |
|---|---|
| mcp-handler | 1.1.0 |
| @modelcontextprotocol/sdk | 1.26.0 |
| zod | 3.25.76 |
| jose | 6.2.3 |

**Note:** `mcp-handler@1.1.0` declares an **exact** non-optional peer `@modelcontextprotocol/sdk@1.26.0`. Installing `zod@^3 jose` alongside first pulled sdk `1.29.0` (bun warned: `incorrect peer dependency`). Downgraded sdk to `1.26.0` to match the peer and avoid two sdk instances in the module graph. zod resolved to `3.25.76` (major 3, satisfies sdk peer `^3.25 || ^4.0`). No `zod@^3.25` override needed.

## API surface (each answer cites a node_modules path)
(filled by Tasks 2–5)

## Downstream plan corrections
(filled by Task 6)
