import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';

const verifyStub = async (_req: Request, bearer?: string) => {
  if (bearer !== 'test-token') return undefined;

  return {
    token: bearer,
    clientId: 'spike-client',
    scopes: ['read', 'write'],
    extra: { userId: 'spike-user', convexToken: 'spike-jwt' },
  };
};

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'ping',
      {
        description: 'Health check. Echoes the message back.',
        inputSchema: { message: z.string() },
      },
      async ({ message }, { authInfo }) => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              pong: message,
              extra: authInfo?.extra ?? null,
            }),
          },
        ],
      }),
    );
  },
  {},
  { basePath: '/api', maxDuration: 60, verboseLogs: true },
);

const authed = withMcpAuth(handler, verifyStub, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource',
});

export { authed as GET, authed as POST };
