import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { getServer } from "./server.ts";
import { logger } from "./logger.ts";
import { getConfig } from "./config.ts";

const app = express();
app.use(express.json());

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

const mcpHandler = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (req.method === "POST" && !sessionId && isInitializeRequest(req.body)) {
    logger.info("Initializing new MCP session");
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        logger.info({ sessionId }, "MCP session initialized");
        transports[sessionId] = transport;
      },
    });

    const server = getServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  if (sessionId && transports[sessionId]) {
    logger.debug({ sessionId }, "Handling request for existing session");
    const transport = transports[sessionId];
    await transport.handleRequest(req, res, req.body);
    return;
  }

  if (req.method === "POST" && !sessionId) {
    logger.warn(
      "POST request without session ID for non-initialization request",
    );
    res
      .status(400)
      .json({ error: "Session ID required for non-initialization requests" });
    return;
  }

  if (sessionId && !transports[sessionId]) {
    logger.warn({ sessionId }, "Request for unknown session");
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (req.method === "GET") {
    res.json({
      name: "dev-to-mcp",
      version: "1.0.0",
      description: "MCP server for dev.to public API",
      capabilities: ["tools"],
    });
  }
};

app.post("/mcp", mcpHandler);
app.get("/mcp", mcpHandler);

async function main() {
  const config = getConfig();
  const port = config.PORT;

  app.listen(port, () => {
    logger.info(
      { port, environment: config.NODE_ENV },
      "Dev.to MCP Server started",
    );
  });
}

main().catch((error) => {
  logger.error({ error }, "Server startup failed");
  process.exit(1);
});
