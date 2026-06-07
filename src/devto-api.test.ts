import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DevToAPI, DevToError } from "./devto-api.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal Response-like object compatible with the fetch API. */
function mockResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(bodyStr, {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

// ── DevToError ────────────────────────────────────────────────────────────────

describe("DevToError", () => {
  it("stores status and details", () => {
    const err = new DevToError("something went wrong", 422, "title is blank");
    expect(err.name).toBe("DevToError");
    expect(err.message).toBe("something went wrong");
    expect(err.status).toBe(422);
    expect(err.details).toBe("title is blank");
  });

  it("works without details", () => {
    const err = new DevToError("not found", 404);
    expect(err.details).toBeUndefined();
  });

  it("is an instance of Error", () => {
    expect(new DevToError("err", 500)).toBeInstanceOf(Error);
  });
});

// ── DevToAPI ──────────────────────────────────────────────────────────────────

describe("DevToAPI", () => {
  let api: DevToAPI;

  beforeEach(() => {
    api = new DevToAPI();
    vi.stubEnv("DEVTO_API_KEY", "test-api-key-123");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ── Read tools ──────────────────────────────────────────────────────────────

  describe("getArticles", () => {
    it("fetches the articles endpoint with no params", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse([{ id: 1, title: "Hello" }]));

      const result = await api.getArticles();
      expect(fetchSpy).toHaveBeenCalledOnce();
      const calledUrl = fetchSpy.mock.calls[0][0] as URL;
      expect(calledUrl.pathname).toContain("/articles");
      expect(result).toEqual([{ id: 1, title: "Hello" }]);
    });

    it("appends query params to the URL", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse([]));

      await api.getArticles({ tag: "javascript", page: 2, per_page: 10 });
      const url = fetchSpy.mock.calls[0][0] as URL;
      expect(url.searchParams.get("tag")).toBe("javascript");
      expect(url.searchParams.get("page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("10");
    });

    it("throws DevToError on non-ok response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockResponse("Not Found", 404),
      );
      await expect(api.getArticles()).rejects.toBeInstanceOf(DevToError);
    });
  });

  describe("getArticle", () => {
    it("fetches by id", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse({ id: 42 }));

      await api.getArticle({ id: 42 });
      const url = fetchSpy.mock.calls[0][0] as URL;
      expect(url.pathname).toContain("/articles/42");
    });

    it("fetches by path", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse({ id: 99 }));

      await api.getArticle({ path: "glatinone/my-article" });
      const url = fetchSpy.mock.calls[0][0] as URL;
      expect(url.pathname).toContain("glatinone");
    });

    it("throws DevToError when neither id nor path is given", async () => {
      await expect(api.getArticle({})).rejects.toBeInstanceOf(DevToError);
    });

    it("throws DevToError for invalid id", async () => {
      await expect(api.getArticle({ id: -1 })).rejects.toBeInstanceOf(DevToError);
    });
  });

  // ── Retry logic ─────────────────────────────────────────────────────────────

  describe("retry logic", () => {
    it("retries on 429 and succeeds on second attempt", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          mockResponse("rate limited", 429, { "Retry-After": "0" }),
        )
        .mockResolvedValueOnce(mockResponse([{ id: 1 }]));

      const result = await api.getArticles();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual([{ id: 1 }]);
    });

    it("retries on 503 and fails after max retries", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockResponse("service unavailable", 503),
      );
      await expect(api.getArticles()).rejects.toBeInstanceOf(DevToError);
    }, 15_000);

    it("retries on network error", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValueOnce(new TypeError("network failure"))
        .mockResolvedValueOnce(mockResponse([{ id: 5 }]));

      const result = await api.getArticles();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual([{ id: 5 }]);
    });
  });

  // ── Write tools ─────────────────────────────────────────────────────────────

  describe("validateApiKey", () => {
    it("calls GET /users/me with the api-key header", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse({ username: "glatinone" }));

      const result = await api.validateApiKey();
      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toContain("/users/me");
      expect((opts.headers as Record<string, string>)["api-key"]).toBe(
        "test-api-key-123",
      );
      expect(result).toEqual({ username: "glatinone" });
    });

    it("throws DevToError when DEVTO_API_KEY is missing", async () => {
      vi.unstubAllEnvs();
      delete process.env.DEVTO_API_KEY;
      await expect(api.validateApiKey()).rejects.toBeInstanceOf(DevToError);
    });
  });

  describe("createArticle", () => {
    it("posts to /articles with correct payload", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse({ id: 100, title: "Test" }));

      await api.createArticle({ title: "Test", body_markdown: "# Hello" });
      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toContain("/articles");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string);
      expect(body.article.title).toBe("Test");
      expect(body.article.published).toBe(false);
    });

    it("defaults published to false when not specified", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse({ id: 101 }));

      await api.createArticle({ title: "Draft", body_markdown: "content" });
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.article.published).toBe(false);
    });

    it("sends tags and series when provided", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse({ id: 102 }));

      await api.createArticle({
        title: "Tagged",
        body_markdown: "content",
        tags: ["javascript", "webdev"],
        series: "My Series",
      });
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.article.tags).toEqual(["javascript", "webdev"]);
      expect(body.article.series).toBe("My Series");
    });
  });

  describe("updateArticle", () => {
    it("sends PUT to /articles/:id", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse({ id: 42, title: "Updated" }));

      await api.updateArticle({ id: 42, title: "Updated" });
      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toContain("/articles/42");
      expect(opts.method).toBe("PUT");
      const body = JSON.parse(opts.body as string);
      expect(body.article.title).toBe("Updated");
    });

    it("throws DevToError for invalid article id", async () => {
      await expect(api.updateArticle({ id: 0, title: "x" })).rejects.toBeInstanceOf(
        DevToError,
      );
    });
  });

  describe("deleteArticle", () => {
    it("sets published=false via PUT", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse({ id: 55, published: false }));

      await api.deleteArticle({ id: 55 });
      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toContain("/articles/55");
      expect(opts.method).toBe("PUT");
      const body = JSON.parse(opts.body as string);
      expect(body.article.published).toBe(false);
    });
  });

  describe("publishArticle", () => {
    it("sets published=true via PUT", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse({ id: 77, published: true }));

      await api.publishArticle({ id: 77 });
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.article.published).toBe(true);
    });
  });

  // ── My article tools ─────────────────────────────────────────────────────────

  describe("getMyArticles", () => {
    it("calls /articles/me/all by default", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse([]));

      await api.getMyArticles();
      const url = fetchSpy.mock.calls[0][0] as URL;
      expect(url.pathname).toContain("/articles/me/all");
    });

    it("calls /articles/me/published for published state", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse([]));

      await api.getMyArticles({ state: "published" });
      const url = fetchSpy.mock.calls[0][0] as URL;
      expect(url.pathname).toContain("/articles/me/published");
    });

    it("calls /articles/me/unpublished for unpublished state", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse([]));

      await api.getDraftArticles();
      const url = fetchSpy.mock.calls[0][0] as URL;
      expect(url.pathname).toContain("/articles/me/unpublished");
    });
  });

  // ── Advanced search ───────────────────────────────────────────────────────────

  describe("advancedSearchArticles", () => {
    const articles = [
      { id: 1, reading_time_minutes: 3, published_at: "2024-06-01T00:00:00Z" },
      { id: 2, reading_time_minutes: 8, published_at: "2024-06-05T00:00:00Z" },
      { id: 3, reading_time_minutes: 15, published_at: "2024-03-01T00:00:00Z" },
    ];

    it("filters by min_reading_time", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse(articles));
      const result = await api.advancedSearchArticles({ min_reading_time: 5 }) as typeof articles;
      expect(result.map((a) => a.id)).toEqual([2, 3]);
    });

    it("filters by max_reading_time", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse(articles));
      const result = await api.advancedSearchArticles({ max_reading_time: 8 }) as typeof articles;
      expect(result.map((a) => a.id)).toEqual([1, 2]);
    });

    it("filters by since date", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse(articles));
      const result = await api.advancedSearchArticles({ since: "2024-05-01" }) as typeof articles;
      expect(result.map((a) => a.id)).toEqual([1, 2]);
    });

    it("combines multiple client-side filters", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse(articles));
      const result = await api.advancedSearchArticles({
        min_reading_time: 5,
        max_reading_time: 10,
        since: "2024-05-01",
      }) as typeof articles;
      expect(result.map((a) => a.id)).toEqual([2]);
    });
  });

  // ── Batch tools ───────────────────────────────────────────────────────────────

  describe("batchCreateArticles", () => {
    it("creates all articles and returns success results", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse({ id: 1, title: "First" }))
        .mockResolvedValueOnce(mockResponse({ id: 2, title: "Second" }));

      const results = await api.batchCreateArticles([
        { title: "First", body_markdown: "content 1" },
        { title: "Second", body_markdown: "content 2" },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ index: 0, success: true });
      expect(results[1]).toMatchObject({ index: 1, success: true });
    });

    it("isolates errors — one failure does not stop the rest", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse("Unprocessable", 422))
        .mockResolvedValueOnce(mockResponse({ id: 2 }));

      const results = await api.batchCreateArticles([
        { title: "Bad", body_markdown: "" },
        { title: "Good", body_markdown: "content" },
      ]);

      expect(results[0]).toMatchObject({ index: 0, success: false });
      expect(results[1]).toMatchObject({ index: 1, success: true });
    });
  });

  describe("batchUpdateArticles", () => {
    it("updates all articles and returns success results", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse({ id: 10 }))
        .mockResolvedValueOnce(mockResponse({ id: 20 }));

      const results = await api.batchUpdateArticles([
        { id: 10, title: "Updated 1" },
        { id: 20, title: "Updated 2" },
      ]);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it("includes the article id in each result", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse({ id: 99 }));

      const results = await api.batchUpdateArticles([{ id: 99, title: "x" }]);
      expect(results[0].id).toBe(99);
    });

    it("isolates errors per article", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockResponse({ id: 1 }))
        .mockResolvedValueOnce(mockResponse("Not Found", 404));

      const results = await api.batchUpdateArticles([
        { id: 1, title: "ok" },
        { id: 999, title: "missing" },
      ]);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain("404");
    });
  });
});
