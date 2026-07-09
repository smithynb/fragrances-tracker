import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'ping',
      {
        description: 'Health check. Echoes the message back.',
        inputSchema: { message: z.string() },
      },
      async ({ message }) => ({
        content: [{ type: 'text', text: `pong: ${message}` }],
      }),
    );
  },
  {},
  { basePath: '/api', maxDuration: 60, verboseLogs: true },
);

export { handler as GET, handler as POST };
