#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function run(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('SynAgent MCP Server (Cross-Agent CLI Bridge) running on stdio\n');
}

run().catch((error) => {
  process.stderr.write(`Fatal error in main(): ${error?.stack || error}\n`);
  process.exit(1);
});
