import { logger } from "./logger.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ArticlePayload {
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

/** Structured error returned by the DEV.to API. */
export class DevToError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "DevToError";
  }
}

// ── Retry helpers ─────────────────────────────────────────────────────────────

const RETRY_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

/** Wait for a given number of milliseconds. */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calculate delay before next retry attempt.
 * Respects the Retry-After header for 429 responses; falls back to
 * exponential backoff (500ms, 1000ms, 2000ms …) for other errors.
 */
function retryDelay(attempt: number, retryAfterHeader?: string | null): number {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds)) return seconds * 1_000;
  }
  return BASE_DELAY_MS * Math.pow(2, attempt); // 500, 1000, 2000 …
}

// ── Main class ────────────────────────────────────────────────────────────────

export class DevToAPI {
  #baseUrl: URL;

  constructor(baseURL = "https://dev.to/api/") {
    const normalizedBaseURL = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
    this.#baseUrl = new URL(normalizedBaseURL);
  }

  // ── Private request helpers ────────────────────────────────────────────────

  /**
   * Execute a fetch with automatic retry on transient failures.
   * Retries on: 429 (rate-limit) + 5xx server errors + network errors.
   */
  async #fetchWithRetry(
    url: URL,
    options: RequestInit = {},
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, options);

        // Transient — retry after a delay
        if (RETRY_STATUS_CODES.has(response.status) && attempt < MAX_RETRIES) {
          const delay = retryDelay(
            attempt,
            response.headers.get("Retry-After"),
          );
          logger.warn(
            { url: url.toString(), status: response.status, attempt, delay },
            `Retrying request in ${delay}ms`,
          );
          await sleep(delay);
          continue;
        }

        return response;
      } catch (err) {
        // Network error (DNS, timeout, etc.) — retry
        lastError = err;
        if (attempt < MAX_RETRIES) {
          const delay = retryDelay(attempt);
          logger.warn(
            { url: url.toString(), attempt, delay, err },
            `Network error, retrying in ${delay}ms`,
          );
          await sleep(delay);
        }
      }
    }

    throw lastError ?? new Error("Request failed after maximum retries");
  }

  /**
   * Make an unauthenticated GET request to the DEV.to API.
   */
  async #makeRequest(url: URL): Promise<unknown> {
    logger.debug({ url: url.toString() }, "GET request");

    const response = await this.#fetchWithRetry(url);

    if (!response.ok) {
      const details = await response.text().catch(() => response.statusText);
      logger.error(
        { url: url.toString(), status: response.status, details },
        "GET request failed",
      );
      throw new DevToError(
        `DEV.to API error ${response.status}: ${response.statusText}`,
        response.status,
        details,
      );
    }

    logger.debug(
      { url: url.toString(), status: response.status },
      "GET request successful",
    );
    return response.json();
  }

  /**
   * Make an authenticated POST / PUT / DELETE request to the DEV.to API.
   * Reads the API key from the DEVTO_API_KEY environment variable.
   */
  async #makeWriteRequest(
    url: URL,
    method: "POST" | "PUT" | "DELETE",
    body?: unknown,
  ): Promise<unknown> {
    const apiKey = process.env.DEVTO_API_KEY;
    if (!apiKey) {
      throw new DevToError(
        "DEVTO_API_KEY environment variable is not set. An API key is required for write operations.",
        401,
      );
    }

    logger.debug({ url: url.toString(), method }, "Authenticated request");

    const response = await this.#fetchWithRetry(url, {
      method,
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/vnd.forem.api-v1+json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const details = await response.text().catch(() => response.statusText);
      logger.error(
        { url: url.toString(), method, status: response.status, details },
        "Authenticated request failed",
      );
      throw new DevToError(
        `DEV.to API error ${response.status}: ${response.statusText}`,
        response.status,
        details,
      );
    }

    logger.debug(
      { url: url.toString(), method, status: response.status },
      "Authenticated request successful",
    );

    if (response.status === 204) return { success: true };
    return response.json();
  }

  // ── Validation helper ──────────────────────────────────────────────────────

  #requirePositiveInt(value: number, label: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new DevToError(`${label} must be a positive integer`, 400);
    }
  }

  // ── Read tools ─────────────────────────────────────────────────────────────

  async getArticles(args: GetArticlesArgs = {}): Promise<unknown> {
    const url = new URL("articles", this.#baseUrl);
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    }
    return this.#makeRequest(url);
  }

  async getArticle(args: { id?: number; path?: string }): Promise<unknown> {
    if (args.id) {
      this.#requirePositiveInt(args.id, "Article ID");
      return this.#makeRequest(new URL(`articles/${args.id}`, this.#baseUrl));
    }
    if (args.path) {
      return this.#makeRequest(
        new URL(`articles/${encodeURIComponent(args.path)}`, this.#baseUrl),
      );
    }
    throw new DevToError("Either id or path must be provided", 400);
  }

  async getUser(args: { id?: number; username?: string }): Promise<unknown> {
    if (args.id) {
      this.#requirePositiveInt(args.id, "User ID");
      return this.#makeRequest(new URL(`users/${args.id}`, this.#baseUrl));
    }
    if (args.username) {
      const url = new URL("users/by_username", this.#baseUrl);
      url.searchParams.set("url", args.username);
      return this.#makeRequest(url);
    }
    throw new DevToError("Either id or username must be provided", 400);
  }

  async getTags(
    args: { page?: number; per_page?: number } = {},
  ): Promise<unknown> {
    const url = new URL("tags", this.#baseUrl);
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    }
    return this.#makeRequest(url);
  }

  async getComments(args: { article_id: number }): Promise<unknown> {
    this.#requirePositiveInt(args.article_id, "Article ID");
    const url = new URL("comments", this.#baseUrl);
    url.searchParams.set("a_id", String(args.article_id));
    return this.#makeRequest(url);
  }

  async searchArticles(args: {
    q: string;
    page?: number;
    per_page?: number;
    search_fields?: string;
  }): Promise<unknown> {
    const url = new URL("search/feed_content", this.#baseUrl);
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    }
    return this.#makeRequest(url);
  }

  /**
   * Search articles with advanced filtering options.
   * Uses the /api/articles endpoint with richer query parameters
   * including tag, state, top (days), pagination, and username.
   * Client-side filters (min/max reading time, since) are applied
   * to the results after fetching.
   */
  async advancedSearchArticles(args: {
    tag?: string;
    username?: string;
    state?: "fresh" | "rising" | "all";
    top?: number;
    page?: number;
    per_page?: number;
    min_reading_time?: number;
    max_reading_time?: number;
    since?: string;
  }): Promise<unknown> {
    const { min_reading_time, max_reading_time, since, ...apiParams } = args;
    const url = new URL("articles", this.#baseUrl);

    for (const [key, value] of Object.entries(apiParams)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    }

    const data = await this.#makeRequest(url);
    if (!Array.isArray(data)) return data;

    // Apply client-side filters that the API does not natively support
    return data.filter((article: Record<string, unknown>) => {
      const readingTime =
        typeof article.reading_time_minutes === "number"
          ? article.reading_time_minutes
          : null;

      if (min_reading_time !== undefined && readingTime !== null) {
        if (readingTime < min_reading_time) return false;
      }
      if (max_reading_time !== undefined && readingTime !== null) {
        if (readingTime > max_reading_time) return false;
      }
      if (since) {
        const publishedAt =
          typeof article.published_at === "string"
            ? new Date(article.published_at)
            : null;
        if (publishedAt && publishedAt < new Date(since)) return false;
      }
      return true;
    });
  }

  // ── Auth / account tools ───────────────────────────────────────────────────

  /**
   * Validate the configured API key and return the authenticated user's profile.
   */
  async validateApiKey(): Promise<unknown> {
    const url = new URL("users/me", this.#baseUrl);
    return this.#makeWriteRequest(url, "GET" as never);
  }

  // ── My article tools ───────────────────────────────────────────────────────

  /**
   * Get articles belonging to the authenticated user.
   * @param state - 'published' | 'unpublished' | 'all'
   */
  async getMyArticles(args: {
    state?: "published" | "unpublished" | "all";
    page?: number;
    per_page?: number;
  } = {}): Promise<unknown> {
    const { state = "all", ...rest } = args;
    const segment =
      state === "published"
        ? "articles/me/published"
        : state === "unpublished"
          ? "articles/me/unpublished"
          : "articles/me/all";

    const url = new URL(segment, this.#baseUrl);
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    }
    return this.#makeWriteRequest(url, "GET" as never);
  }

  /**
   * Get all unpublished (draft) articles for the authenticated user.
   */
  async getDraftArticles(args: {
    page?: number;
    per_page?: number;
  } = {}): Promise<unknown> {
    return this.getMyArticles({ state: "unpublished", ...args });
  }

  /**
   * Publish a draft article by ID (convenience wrapper around updateArticle).
   */
  async publishArticle(args: { id: number }): Promise<unknown> {
    this.#requirePositiveInt(args.id, "Article ID");
    return this.#makeWriteRequest(
      new URL(`articles/${args.id}`, this.#baseUrl),
      "PUT",
      { article: { published: true } },
    );
  }

  // ── Write tools ────────────────────────────────────────────────────────────

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
    return this.#makeWriteRequest(url, "POST", {
      article: {
        title: args.title,
        body_markdown: args.body_markdown,
        published: args.published ?? false,
        tags: args.tags,
        series: args.series,
        canonical_url: args.canonical_url,
        description: args.description,
      } satisfies ArticlePayload,
    });
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
    this.#requirePositiveInt(args.id, "Article ID");
    const { id, ...fields } = args;
    return this.#makeWriteRequest(new URL(`articles/${id}`, this.#baseUrl), "PUT", {
      article: fields satisfies ArticlePayload,
    });
  }

  async deleteArticle(args: { id: number }): Promise<unknown> {
    this.#requirePositiveInt(args.id, "Article ID");
    // DEV.to's public API does not expose a hard-delete endpoint.
    // Unpublishing (published: false) is the closest equivalent.
    return this.#makeWriteRequest(
      new URL(`articles/${args.id}`, this.#baseUrl),
      "PUT",
      { article: { published: false } },
    );
  }

  // ── Challenge tools ────────────────────────────────────────────────────────

  /**
   * List DEV.to challenges.
   * Challenges are announced as articles by the `devteam` organisation tagged
   * with `devchallenge`. There is no dedicated /api/challenges endpoint.
   */
  async getChallenges(args: {
    per_page?: number;
    page?: number;
  } = {}): Promise<unknown> {
    const url = new URL("articles", this.#baseUrl);
    url.searchParams.set("username", "devteam");
    url.searchParams.set("tag", "devchallenge");
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
    return this.#makeRequest(url);
  }

  /**
   * Get the full details of a DEV.to challenge article.
   * Pass the article path, e.g. "devteam/join-the-june-solstice-game-jam-1000-in-prizes-3jla"
   */
  async getChallengeDetail(args: { path: string }): Promise<unknown> {
    if (!args.path?.trim()) {
      throw new DevToError("path must be a non-empty string", 400);
    }
    return this.getArticle({ path: args.path });
  }

  /**
   * Generate a structured multi-article submission plan for a DEV.to challenge.
   *
   * This is a pure-logic tool — no API call is made.
   * Returns a ready-to-use plan with a suggested series name and `count` draft
   * articles (default 3, max 4), each containing a body_markdown template that
   * can be fed directly into `create_article` or `batch_create_articles`.
   */
  planChallengeSubmissions(args: {
    challenge_title: string;
    challenge_description: string;
    theme: string;
    your_angle: string;
    tags?: string[];
    count?: number;
  }): unknown {
    const count = Math.min(Math.max(args.count ?? 3, 3), 4);
    const { challenge_title, theme, your_angle } = args;
    const challengeTag = challenge_title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 20);

    const baseTags = [
      "devchallenge",
      challengeTag,
      ...(args.tags ?? []),
    ].slice(0, 4);

    const seriesName = `${challenge_title} — ${your_angle}`;

    // ── Article templates ───────────────────────────────────────────────────

    const articles = [
      {
        role: "concept",
        suggested_title: `${your_angle}: Concept & Approach for the ${challenge_title}`,
        description: `How I'm approaching the ${challenge_title} — my idea, the theme connection, and my plan.`,
        tags: [...new Set([...baseTags, "beginners"])].slice(0, 4),
        body_markdown: `---
series: ${seriesName}
---

## The Challenge

The **[${challenge_title}](https://dev.to/challenges)** theme is: *${theme}*.

I decided to build **${your_angle}** because [explain your personal connection to the theme].

## The Concept

<!-- Describe your project idea in 2-3 sentences -->

## Theme Connection

Here's how my project ties into *${theme}*:

- **[Theme element 1]** — [how it appears in your project]
- **[Theme element 2]** — [how it appears in your project]

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| [e.g. Language] | [e.g. TypeScript] | [reason] |
| [e.g. Framework] | [e.g. React] | [reason] |
| [e.g. Tooling] | [e.g. Vite] | [reason] |

## Roadmap

- [ ] [Milestone 1]
- [ ] [Milestone 2]
- [ ] [Milestone 3]

Follow along — next post will cover the build!
`,
      },
      {
        role: "build",
        suggested_title: `Building ${your_angle}: Implementation Deep Dive`,
        description: `The technical details of how I built ${your_angle} — architecture, key decisions, and code highlights.`,
        tags: [...new Set([...baseTags, "tutorial"])].slice(0, 4),
        body_markdown: `---
series: ${seriesName}
---

## Where We Left Off

In [Part 1](link-to-part-1) I introduced **${your_angle}** for the ${challenge_title}. Now let's get into the build.

## Architecture Overview

<!-- Add a diagram or description of how the pieces fit together -->

## Core Mechanics

### [Feature 1]

\`\`\`[language]
// [explain what this code does]
[paste your code here]
\`\`\`

**Why this approach:** [explain the decision]

### [Feature 2]

\`\`\`[language]
[paste your code here]
\`\`\`

## Biggest Challenge

The hardest part was [describe problem].

**How I solved it:** [describe solution]

## What's Next

[Brief teaser of next post — demo, results, or reflection]
`,
      },
      {
        role: "demo",
        suggested_title: `${your_angle} — Live Demo & Submission`,
        description: `Showcasing the finished ${your_angle} built for the ${challenge_title}.`,
        tags: [...new Set([...baseTags, "showdev"])].slice(0, 4),
        body_markdown: `---
series: ${seriesName}
---

## It's Done! 🎉

After [X days/weeks] of work, **${your_angle}** is complete and submitted for the **${challenge_title}**.

## Demo

<!-- Embed a video, GIF, or screenshot here -->
<!-- Use ![Alt text](image-url) for images -->

**[▶ Try it live](your-live-link-here)**

**[📦 Source code](your-repo-link-here)**

## Feature Highlights

- **[Feature 1]** — [one-line description]
- **[Feature 2]** — [one-line description]
- **[Feature 3]** — [one-line description]

## How It Connects to *${theme}*

[2-3 sentences explicitly connecting your project to the challenge theme — important for judging]

## Reflections

**What went well:** [2-3 things]

**What I'd do differently:** [1-2 things]

**What I learned:** [key takeaway]

---

*This is my submission for the [${challenge_title}](https://dev.to/challenges). Thanks for reading!*
`,
      },
    ];

    // Optional 4th article: deep-dive on one hard problem
    if (count === 4) {
      articles.splice(2, 0, {
        role: "deep-dive",
        suggested_title: `The Hardest Part of Building ${your_angle} — and How I Solved It`,
        description: `A focused look at the trickiest technical problem I faced during the ${challenge_title} and the solution I found.`,
        tags: [...new Set([...baseTags, "tutorial"])].slice(0, 4),
        body_markdown: `---
series: ${seriesName}
---

## The Problem

Midway through building **${your_angle}**, I hit a wall: [describe the specific problem in one sentence].

## Why It Was Hard

[Explain the root cause — timing, state, algorithm, browser API, etc.]

\`\`\`[language]
// The broken version
[code that didn't work]
\`\`\`

The problem: [explain what went wrong]

## What I Tried First

1. **[Attempt 1]** — [result]
2. **[Attempt 2]** — [result]

## The Solution

\`\`\`[language]
// The working version
[code that worked]
\`\`\`

**Why this works:** [explain clearly]

## Key Takeaway

[One-sentence lesson for other developers facing this problem]
`,
      });
    }

    return {
      challenge_title,
      series_name: seriesName,
      total_articles: articles.length,
      note: "Pass `submissions` directly to `batch_create_articles` to create all drafts at once.",
      submissions: articles.map((a, i) => ({
        index: i,
        article_number: i + 1,
        role: a.role,
        suggested_title: a.suggested_title,
        description: a.description,
        tags: a.tags,
        series: seriesName,
        published: false,
        body_markdown: a.body_markdown,
      })),
    };
  }

  // ── Batch tools ────────────────────────────────────────────────────────────

  /**
   * Create multiple articles sequentially.
   * Returns an array of results — each entry is either the created article
   * or an error object if that individual request failed.
   */
  async batchCreateArticles(
    articles: Array<{
      title: string;
      body_markdown: string;
      published?: boolean;
      tags?: string[];
      series?: string;
      canonical_url?: string;
      description?: string;
    }>,
  ): Promise<Array<{ index: number; success: boolean; data?: unknown; error?: string }>> {
    const results = [];
    for (let i = 0; i < articles.length; i++) {
      try {
        const data = await this.createArticle(articles[i]);
        results.push({ index: i, success: true, data });
        logger.info({ index: i, title: articles[i].title }, "Batch create: article created");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ index: i, success: false, error: message });
        logger.warn({ index: i, title: articles[i].title, error: message }, "Batch create: article failed");
      }
    }
    return results;
  }

  /**
   * Update multiple articles sequentially.
   * Returns an array of results — each entry is either the updated article
   * or an error object if that individual request failed.
   */
  async batchUpdateArticles(
    articles: Array<{
      id: number;
      title?: string;
      body_markdown?: string;
      published?: boolean;
      tags?: string[];
      series?: string;
      canonical_url?: string;
      description?: string;
    }>,
  ): Promise<Array<{ index: number; id: number; success: boolean; data?: unknown; error?: string }>> {
    const results = [];
    for (let i = 0; i < articles.length; i++) {
      const { id } = articles[i];
      try {
        const data = await this.updateArticle(articles[i]);
        results.push({ index: i, id, success: true, data });
        logger.info({ index: i, id }, "Batch update: article updated");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ index: i, id, success: false, error: message });
        logger.warn({ index: i, id, error: message }, "Batch update: article failed");
      }
    }
    return results;
  }
}
