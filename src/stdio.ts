import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getServer } from "./server.ts";
import { logger } from "./logger.ts";

async function main() {
  const server = getServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Dev.to MCP Server running on stdio");
}

main().catch((error) => {
  process.stderr.write(`Server startup failed: ${error}\n`);
  process.exit(1);
});
