import { logger } from "./logger.ts";

interface ArticlePayload {
  title?: string;
  body_markdown?: string;
  published?: boolean;
  tags?: string[];
  series?: string;
  canonical_url?: string;
  description?: string;
}

interface GetArticlesArgs {
  username?: string;
  tag?: string;
  tags?: string;
  tags_exclude?: string;
  state?: "fresh" | "rising" | "all";
  top?: number;
  page?: number;
  per_page?: number;
  collection_id?: number;
}

export class DevToAPI {
  #baseUrl: URL;

  constructor(baseURL = "https://dev.to/api/") {
    // Ensure the base URL ends with a slash for proper relative URL construction
    const normalizedBaseURL = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
    this.#baseUrl = new URL(normalizedBaseURL);
  }

  async #makeRequest(url: URL): Promise<unknown> {
    logger.debug({ url }, "Making API request");

    try {
      const response = await fetch(url);

      if (!response.ok) {
        logger.error(
          {
            url,
            status: response.status,
            statusText: response.statusText,
          },
          "API request failed",
        );
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      logger.debug({ url, status: response.status }, "API request successful");
      return response.json();
    } catch (error) {
      logger.error({ url, error }, "API request error");
      throw error;
    }
  }

  async #makeWriteRequest(
    url: URL,
    method: "POST" | "PUT" | "DELETE",
    body?: unknown,
  ): Promise<unknown> {
    const apiKey = process.env.DEVTO_API_KEY;
    if (!apiKey) {
      throw new Error(
        "DEVTO_API_KEY environment variable is not set. An API key is required for write operations.",
      );
    }

    logger.debug({ url, method }, "Making authenticated API request");

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/vnd.forem.api-v1+json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        logger.error(
          { url, method, status: response.status, error: errorText },
          "Authenticated API request failed",
        );
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      logger.debug(
        { url, method, status: response.status },
        "Authenticated API request successful",
      );

      // 204 No Content — nothing to parse
      if (response.status === 204) return { success: true };
      return response.json();
    } catch (error) {
      logger.error({ url, method, error }, "Authenticated API request error");
      throw error;
    }
  }

  async getArticles(args: GetArticlesArgs = {}): Promise<unknown> {
    const url = new URL("articles", this.#baseUrl);
    Object.entries(args).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
    return await this.#makeRequest(url);
  }

  async getArticle(args: { id?: number; path?: string }): Promise<unknown> {
    let endpoint: URL;

    if (args.id) {
      // Validate ID is a positive integer
      if (!Number.isInteger(args.id) || args.id <= 0) {
        throw new Error("Article ID must be a positive integer");
      }
      endpoint = new URL(`articles/${args.id}`, this.#baseUrl);
    } else if (args.path) {
      // Sanitize path parameter
      endpoint = new URL(
        `articles/${encodeURIComponent(args.path)}`,
        this.#baseUrl,
      );
    } else {
      throw new Error("Either id or path must be provided");
    }

    return await this.#makeRequest(endpoint);
  }

  async getUser(args: { id?: number; username?: string }): Promise<unknown> {
    let endpoint: URL;

    if (args.id) {
      // Validate ID is a positive integer
      if (!Number.isInteger(args.id) || args.id <= 0) {
        throw new Error("User ID must be a positive integer");
      }
      endpoint = new URL(`users/${args.id}`, this.#baseUrl);
    } else if (args.username) {
      endpoint = new URL("users/by_username", this.#baseUrl);
      endpoint.searchParams.set("url", args.username);
    } else {
      throw new Error("Either id or username must be provided");
    }

    return await this.#makeRequest(endpoint);
  }

  async getTags(
    args: { page?: number; per_page?: number } = {},
  ): Promise<unknown> {
    const url = new URL("tags", this.#baseUrl);
    Object.entries(args).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
    return await this.#makeRequest(url);
  }

  async getComments(args: { article_id: number }): Promise<unknown> {
    // Validate article_id is a positive integer
    if (!Number.isInteger(args.article_id) || args.article_id <= 0) {
      throw new Error("Article ID must be a positive integer");
    }

    const url = new URL("comments", this.#baseUrl);
    url.searchParams.set("a_id", String(args.article_id));
    return await this.#makeRequest(url);
  }

  async searchArticles(args: {
    q: string;
    page?: number;
    per_page?: number;
    search_fields?: string;
  }): Promise<unknown> {
    const url = new URL("search/feed_content", this.#baseUrl);
    Object.entries(args).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
    return await this.#makeRequest(url);
  }

  async createArticle(args: {
    title: string;
    body_markdown: string;
    published?: boolean;
    tags?: string[];
    series?: string;
    canonical_url?: string;
    description?: string;
  }): Promise<unknown> {
    const url = new URL("articles", this.#baseUrl);
    const payload: { article: ArticlePayload } = {
      article: {
        title: args.title,
        body_markdown: args.body_markdown,
        published: args.published ?? false,
        tags: args.tags,
        series: args.series,
        canonical_url: args.canonical_url,
        description: args.description,
      },
    };
    return await this.#makeWriteRequest(url, "POST", payload);
  }

  async updateArticle(args: {
    id: number;
    title?: string;
    body_markdown?: string;
    published?: boolean;
    tags?: string[];
    series?: string;
    canonical_url?: string;
    description?: string;
  }): Promise<unknown> {
    if (!Number.isInteger(args.id) || args.id <= 0) {
      throw new Error("Article ID must be a positive integer");
    }
    const { id, ...fields } = args;
    const url = new URL(`articles/${id}`, this.#baseUrl);
    const payload: { article: ArticlePayload } = { article: fields };
    return await this.#makeWriteRequest(url, "PUT", payload);
  }

  async deleteArticle(args: { id: number }): Promise<unknown> {
    if (!Number.isInteger(args.id) || args.id <= 0) {
      throw new Error("Article ID must be a positive integer");
    }
    // DEV.to's public API does not expose a hard-delete endpoint.
    // Unpublishing (published: false) is the closest equivalent.
    const url = new URL(`articles/${args.id}`, this.#baseUrl);
    return await this.#makeWriteRequest(url, "PUT", {
      article: { published: false },
    });
  }
}
