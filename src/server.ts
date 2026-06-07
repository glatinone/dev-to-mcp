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

  // ── My article tools ──────────────────────────────────────────────────────

  server.registerTool(
    "get_my_articles",
    {
      title: "Get My Articles",
      description:
        "Get articles belonging to the authenticated user. Filter by state: 'published', 'unpublished' (drafts), or 'all'. Requires DEVTO_API_KEY.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        state: z
          .enum(["published", "unpublished", "all"])
          .optional()
          .default("all")
          .describe("Filter by article state (default: all)"),
        page: z.number().optional().default(1).describe("Page number (default: 1)"),
        per_page: z
          .number()
          .optional()
          .default(30)
          .describe("Articles per page (default: 30, max: 1000)"),
      },
    },
    async (args) => {
      logger.info({ state: args.state }, "Getting my articles");
      try {
        const data = await devToAPI.getMyArticles(args);
        logger.debug(
          { count: Array.isArray(data) ? data.length : "unknown" },
          "My articles retrieved",
        );
        return createTextResult(data);
      } catch (error) {
        logger.error({ error }, "Failed to get my articles");
        throw error;
      }
    },
  );

  server.registerTool(
    "get_draft_articles",
    {
      title: "Get Draft Articles",
      description:
        "Get all unpublished (draft) articles for the authenticated user. Requires DEVTO_API_KEY.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        page: z.number().optional().default(1).describe("Page number (default: 1)"),
        per_page: z
          .number()
          .optional()
          .default(30)
          .describe("Drafts per page (default: 30, max: 1000)"),
      },
    },
    async (args) => {
      logger.info("Getting draft articles");
      try {
        const data = await devToAPI.getDraftArticles(args);
        logger.debug(
          { count: Array.isArray(data) ? data.length : "unknown" },
          "Draft articles retrieved",
        );
        return createTextResult(data);
      } catch (error) {
        logger.error({ error }, "Failed to get draft articles");
        throw error;
      }
    },
  );

  server.registerTool(
    "publish_article",
    {
      title: "Publish Article",
      description:
        "Publish a draft article by ID. Sets published=true. Requires DEVTO_API_KEY.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        id: z.number().describe("Article ID to publish"),
      },
    },
    async (args) => {
      logger.info({ id: args.id }, "Publishing article");
      try {
        const data = await devToAPI.publishArticle(args);
        logger.debug({ id: args.id }, "Article published");
        return createTextResult(data);
      } catch (error) {
        logger.error({ error, id: args.id }, "Failed to publish article");
        throw error;
      }
    },
  );

  // ── Advanced search ────────────────────────────────────────────────────────

  server.registerTool(
    "advanced_search_articles",
    {
      title: "Advanced Search Articles",
      description:
        "Search articles with advanced filters: tag, username, state, trending window, reading time range, and published-since date. Client-side filters (min/max reading time, since) are applied after fetching.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        tag: z.string().optional().describe("Filter by a single tag slug"),
        username: z.string().optional().describe("Filter by author username"),
        state: z
          .enum(["fresh", "rising", "all"])
          .optional()
          .describe("Article state filter"),
        top: z
          .number()
          .optional()
          .describe("Trending window in days (1, 7, 30, or omit for all-time)"),
        page: z.number().optional().default(1).describe("Page number (default: 1)"),
        per_page: z
          .number()
          .optional()
          .default(30)
          .describe("Results per page (default: 30, max: 1000)"),
        min_reading_time: z
          .number()
          .optional()
          .describe("Minimum reading time in minutes (client-side filter)"),
        max_reading_time: z
          .number()
          .optional()
          .describe("Maximum reading time in minutes (client-side filter)"),
        since: z
          .string()
          .optional()
          .describe(
            "Only include articles published on or after this date (ISO 8601, e.g. 2024-01-01)",
          ),
      },
    },
    async (args) => {
      logger.info({ args }, "Advanced search articles");
      try {
        const data = await devToAPI.advancedSearchArticles(args);
        logger.debug(
          { count: Array.isArray(data) ? data.length : "unknown" },
          "Advanced search completed",
        );
        return createTextResult(data);
      } catch (error) {
        logger.error({ error, args }, "Advanced search failed");
        throw error;
      }
    },
  );

  // ── Auth tool ──────────────────────────────────────────────────────────────

  server.registerTool(
    "validate_api_key",
    {
      title: "Validate API Key",
      description:
        "Validate the configured DEVTO_API_KEY and return the authenticated user's profile (username, name, follower count, etc.). Use this as a pre-flight check before any write operation.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
      inputSchema: {},
    },
    async () => {
      logger.info("Validating DEV.to API key");
      try {
        const data = await devToAPI.validateApiKey();
        logger.debug("API key validated successfully");
        return createTextResult(data);
      } catch (error) {
        logger.error({ error }, "API key validation failed");
        throw error;
      }
    },
  );

  // ── Batch tools ────────────────────────────────────────────────────────────

  const articleInputSchema = {
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
      .describe('Up to 4 tag slugs (e.g. ["javascript", "webdev"])'),
    series: z.string().optional().describe("Series name"),
    canonical_url: z.string().optional().describe("Canonical URL if published elsewhere"),
    description: z.string().optional().describe("Short description / subtitle"),
  };

  server.registerTool(
    "batch_create_articles",
    {
      title: "Batch Create Articles",
      description:
        "Create multiple dev.to articles in one call. Each article is created sequentially. Returns a result for every item — including per-article errors — so a single failure does not abort the rest. Requires DEVTO_API_KEY.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        articles: z
          .array(z.object(articleInputSchema))
          .min(1)
          .max(20)
          .describe("List of articles to create (max 20 per call)"),
      },
    },
    async (args) => {
      logger.info({ count: args.articles.length }, "Batch creating articles");
      try {
        const results = await devToAPI.batchCreateArticles(args.articles);
        const succeeded = results.filter((r) => r.success).length;
        const failed = results.length - succeeded;
        logger.info({ succeeded, failed }, "Batch create completed");
        return createTextResult({ summary: { succeeded, failed, total: results.length }, results });
      } catch (error) {
        logger.error({ error }, "Batch create articles failed");
        throw error;
      }
    },
  );

  server.registerTool(
    "batch_update_articles",
    {
      title: "Batch Update Articles",
      description:
        "Update multiple dev.to articles in one call. Each update is applied sequentially. Returns a result for every item — including per-article errors — so a single failure does not abort the rest. Requires DEVTO_API_KEY.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        articles: z
          .array(
            z.object({
              id: z.number().describe("Article ID to update"),
              title: z.string().optional().describe("New title"),
              body_markdown: z.string().optional().describe("New body in Markdown"),
              published: z.boolean().optional().describe("Set to true to publish, false to unpublish"),
              tags: z.array(z.string()).optional().describe("Replacement tag list (up to 4 slugs)"),
              series: z.string().optional().describe("Series name"),
              canonical_url: z.string().optional().describe("Canonical URL"),
              description: z.string().optional().describe("Short description / subtitle"),
            }),
          )
          .min(1)
          .max(20)
          .describe("List of articles to update (max 20 per call)"),
      },
    },
    async (args) => {
      logger.info({ count: args.articles.length }, "Batch updating articles");
      try {
        const results = await devToAPI.batchUpdateArticles(args.articles);
        const succeeded = results.filter((r) => r.success).length;
        const failed = results.length - succeeded;
        logger.info({ succeeded, failed }, "Batch update completed");
        return createTextResult({ summary: { succeeded, failed, total: results.length }, results });
      } catch (error) {
        logger.error({ error }, "Batch update articles failed");
        throw error;
      }
    },
  );

  return server;
};
