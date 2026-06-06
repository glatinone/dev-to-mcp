import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DevToAPI } from "./devto-api.ts";
import { createTextResult } from "./lib/utils.ts";
import { logger } from "./logger.ts";

export const getServer = () => {
  const server = new McpServer({
    name: "dev-to-mcp",
    version: "1.0.0",
  });

  const devToAPI = new DevToAPI();

  server.registerTool(
    "get_articles",
    {
      title: "Get Articles",
      description:
        "Get articles from dev.to. Can filter by username, tag, or other parameters.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        username: z.string().optional().describe("Filter articles by username"),
        tag: z.string().optional().describe("Filter articles by tag"),
        top: z
          .number()
          .optional()
          .describe(
            "Number representing the number of days since publication for top articles (1, 7, 30, or infinity)",
          ),
        page: z
          .number()
          .optional()
          .default(1)
          .describe("Pagination page number (default: 1)"),
        per_page: z
          .number()
          .optional()
          .default(30)
          .describe("Number of articles per page (default: 30, max: 1000)"),
        state: z
          .enum(["fresh", "rising", "all"])
          .optional()
          .describe("Filter by article state"),
      },
    },
    async (args) => {
      logger.info({ args }, "Getting articles");
      try {
        const data = await devToAPI.getArticles(args);
        logger.debug(
          { articlesCount: Array.isArray(data) ? data.length : "unknown" },
          "Articles retrieved",
        );
        return createTextResult(data);
      } catch (error) {
        logger.error({ error, args }, "Failed to get articles");
        throw error;
      }
    },
  );

  server.registerTool(
    "get_article",
    {
      title: "Get Article",
      description: "Get a specific article by ID or path",
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        id: z.number().optional().describe("Article ID"),
        path: z
          .string()
          .optional()
          .describe('Article path (e.g., "username/article-slug")'),
      },
    },
    async (args) => {
      logger.info({ args }, "Getting article");
      if (!args.id && !args.path) {
        logger.error({ args }, "Neither id nor path provided for get_article");
        throw new Error("Either id or path must be provided");
      }
      try {
        const data = await devToAPI.getArticle(args);
        logger.debug(
          { articleId: args.id, articlePath: args.path },
          "Article retrieved",
        );
        return createTextResult(data);
      } catch (error) {
        logger.error({ error, args }, "Failed to get article");
        throw error;
      }
    },
  );

  server.registerTool(
    "get_user",
    {
      title: "Get User",
      description: "Get user information by ID or username",
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        id: z.number().optional().describe("User ID"),
        username: z.string().optional().describe("Username"),
      },
    },
    async (args) => {
      logger.info({ args }, "Getting user");
      if (!args.id && !args.username) {
        logger.error({ args }, "Neither id nor username provided for get_user");
        throw new Error("Either id or username must be provided");
      }
      try {
        const data = await devToAPI.getUser(args);
        logger.debug(
          { userId: args.id, username: args.username },
          "User retrieved",
        );
        return createTextResult(data);
      } catch (error) {
        logger.error({ error, args }, "Failed to get user");
        throw error;
      }
    },
  );

  server.registerTool(
    "get_tags",
    {
      title: "Get Tags",
      description: "Get popular tags from dev.to",
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        page: z
          .number()
          .optional()
          .default(1)
          .describe("Pagination page number (default: 1)"),
        per_page: z
          .number()
          .optional()
          .default(10)
          .describe("Number of tags per page (default: 10, max: 1000)"),
      },
    },
    async (args) => {
      logger.info({ args }, "Getting tags");
      try {
        const data = await devToAPI.getTags(args);
        logger.debug(
          { tagsCount: Array.isArray(data) ? data.length : "unknown" },
          "Tags retrieved",
        );
        return createTextResult(data);
      } catch (error) {
        logger.error({ error, args }, "Failed to get tags");
        throw error;
      }
    },
  );

  server.registerTool(
    "get_comments",
    {
      title: "Get Comments",
      description: "Get comments for a specific article",
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        article_id: z.number().describe("Article ID to get comments for"),
      },
    },
    async (args) => {
      logger.info({ args }, "Getting comments");
      try {
        const data = await devToAPI.getComments(args);
        logger.debug(
          { commentsCount: Array.isArray(data) ? data.length : "unknown" },
          "Comments retrieved",
        );
        return createTextResult(data);
      } catch (error) {
        logger.error({ error, args }, "Failed to get comments");
        throw error;
      }
    },
  );

  server.registerTool(
    "search_articles",
    {
      title: "Search Articles",
      description: "Search articles using query parameters",
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        q: z.string().describe("Search query"),
        page: z
          .number()
          .optional()
          .default(1)
          .describe("Pagination page number (default: 1)"),
        per_page: z
          .number()
          .optional()
          .default(30)
          .describe("Number of articles per page (default: 30, max: 1000)"),
        search_fields: z
          .string()
          .optional()
          .describe(
            "Comma-separated list of fields to search (title, body_text, tag_list)",
          ),
      },
    },
    async (args) => {
      logger.info({ args }, "Searching articles");
      try {
        const data = await devToAPI.searchArticles(args);
        logger.debug(
          { resultsCount: Array.isArray(data) ? data.length : "unknown" },
          "Article search completed",
        );
        return createTextResult(data);
      } catch (error) {
        logger.error({ error, args }, "Failed to search articles");
        throw error;
      }
    },
  );

  // ── Write tools ────────────────────────────────────────────────────────────

  server.registerTool(
    "create_article",
    {
      title: "Create Article",
      description:
        "Create a new article on dev.to. Requires DEVTO_API_KEY. Defaults to draft (published: false) unless explicitly set to true.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        title: z.string().describe("Article title"),
        body_markdown: z.string().describe("Article body in Markdown"),
        published: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether to publish immediately (default: false = draft)"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Up to 4 tag slugs (e.g. [\"javascript\", \"webdev\"])"),
        series: z
          .string()
          .optional()
          .describe("Series name to add the article to"),
        canonical_url: z
          .string()
          .optional()
          .describe("Canonical URL if the article was originally published elsewhere"),
        description: z
          .string()
          .optional()
          .describe("Short description / subtitle shown in listings"),
      },
    },
    async (args) => {
      logger.info({ title: args.title, published: args.published }, "Creating article");
      try {
        const data = await devToAPI.createArticle(args);
        logger.debug({ title: args.title }, "Article created");
        return createTextResult(data);
      } catch (error) {
        logger.error({ error, args }, "Failed to create article");
        throw error;
      }
    },
  );

  server.registerTool(
    "update_article",
    {
      title: "Update Article",
      description:
        "Update an existing dev.to article by ID. Requires DEVTO_API_KEY. Only provide the fields you want to change.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        id: z.number().describe("Article ID to update"),
        title: z.string().optional().describe("New article title"),
        body_markdown: z.string().optional().describe("New article body in Markdown"),
        published: z
          .boolean()
          .optional()
          .describe("Set to true to publish, false to unpublish/revert to draft"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Replacement tag list (up to 4 slugs)"),
        series: z.string().optional().describe("Series name"),
        canonical_url: z.string().optional().describe("Canonical URL"),
        description: z.string().optional().describe("Short description / subtitle"),
      },
    },
    async (args) => {
      logger.info({ id: args.id }, "Updating article");
      try {
        const data = await devToAPI.updateArticle(args);
        logger.debug({ id: args.id }, "Article updated");
        return createTextResult(data);
      } catch (error) {
        logger.error({ error, args }, "Failed to update article");
        throw error;
      }
    },
  );

  server.registerTool(
    "delete_article",
    {
      title: "Delete Article",
      description:
        "Unpublish a dev.to article by ID (the DEV.to public API does not support hard-delete; this sets published=false). Requires DEVTO_API_KEY.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
        destructiveHint: true,
      },
      inputSchema: {
        id: z.number().describe("Article ID to unpublish"),
      },
    },
    async (args) => {
      logger.info({ id: args.id }, "Deleting (unpublishing) article");
      try {
        const data = await devToAPI.deleteArticle(args);
        logger.debug({ id: args.id }, "Article unpublished");
        return createTextResult(data);
      } catch (error) {
        logger.error({ error, args }, "Failed to delete article");
        throw error;
      }
    },
  );

  return server;
};
