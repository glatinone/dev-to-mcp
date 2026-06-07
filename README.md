# Dev.to MCP Server

A Model Context Protocol (MCP) server for interacting with the dev.to public API. Includes both read-only tools for browsing and authenticated write tools for creating, updating, and deleting articles.

## Features

This MCP server provides access to the following dev.to API endpoints:

### Read-only tools (no authentication required)
- **get_articles** - Get articles from dev.to with optional filters (username, tag, state, pagination)
- **get_article** - Get a specific article by ID or path
- **get_user** - Get user information by ID or username
- **get_tags** - Get popular tags from dev.to
- **get_comments** - Get comments for a specific article
- **search_articles** - Search articles using query parameters

### Write tools (requires DEVTO_API_KEY)
- **create_article** - Create a new draft or published article
- **update_article** - Update an existing article (title, body, tags, series, etc.)
- **delete_article** - Unpublish an article
- **publish_article** - Publish a draft article by ID
- **batch_create_articles** - Create up to 20 articles in one call; returns per-item success/error
- **batch_update_articles** - Update up to 20 articles in one call; returns per-item success/error

### My article tools (requires DEVTO_API_KEY)
- **get_my_articles** - List your own articles filtered by state: `all`, `published`, or `unpublished`
- **get_draft_articles** - List all your unpublished (draft) articles

### Search tools
- **search_articles** - Full-text search using the DEV.to search API
- **advanced_search_articles** - Filter articles by tag, username, state, reading time range, and published date

### Auth tools (requires DEVTO_API_KEY)
- **validate_api_key** - Check if your API key is valid and return your account profile

## Installation

### Using npm

If you want to install and build from source using npm:

```bash
npm install
npm run build
```

## Usage

The server runs as a remote HTTP server on port 3000 (or the PORT environment variable) and can be used with any MCP-compatible client.

```bash
npm start
```

The server will be available at `http://localhost:3000` for MCP connections.

## Development

```bash
# Build the project
npm run build

# Watch mode for development
npm run dev

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check
```

## Docker

### Using Pre-built Image

Pull and run the pre-built Docker image:

```bash
# Pull the image
docker pull docker.io/nickytonline/dev-to-mcp:latest

# Run it
docker run -d \
  --name dev-to-mcp \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -p 3000:3000 \
  --restart unless-stopped \
  docker.io/nickytonline/dev-to-mcp:latest
```

Once it's up, check health status via:

```bash
curl -fsS http://127.0.0.1:3000/mcp
```

The server will be available at `http://localhost:3000/mcp` for MCP connections.

### Building from Source

Build and run the MCP server using Docker:

```bash
# Build the Docker image
docker build -t dev-to-mcp .

# Run the container
docker run -p 3000:3000 dev-to-mcp
```

### Docker Compose

Using the pre-built image with Docker Compose:

```yaml
services:
  dev-to-mcp:
    image: docker.io/nickytonline/dev-to-mcp:latest
    container_name: dev-to-mcp
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
    networks:
      - main
    healthcheck:
      # Uses $PORT at runtime; defaults to 3000 if not set
      test:
        [
          "CMD-SHELL",
          "curl -fsS http://127.0.0.1:${PORT:-3000}/mcp >/dev/null || exit 1",
        ]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s

networks:
  main: {}
```

For development with a local build, you can also use Docker Compose:

```yaml
# docker-compose.yml
version: "3.8"
services:
  dev-to-mcp:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
```

```bash
docker-compose up --build
```

## API Endpoints

All endpoints use the public dev.to API (`https://dev.to/api`) and do not require authentication.

### get_articles

Get articles with optional filtering:

- `username` - Filter by author username
- `tag` - Filter by tag
- `top` - Top articles (1, 7, 30, or infinity days)
- `page` - Pagination page (default: 1)
- `per_page` - Articles per page (default: 30, max: 1000)
- `state` - Filter by state (fresh, rising, all)

### get_article

Get a specific article:

- `id` - Article ID
- `path` - Article path (e.g., "username/article-slug")

### get_user

Get user information:

- `id` - User ID
- `username` - Username

### get_tags

Get popular tags:

- `page` - Pagination page (default: 1)
- `per_page` - Tags per page (default: 10, max: 1000)

### get_comments

Get comments for an article:

- `article_id` - Article ID (required)

### search_articles

Search articles:

- `q` - Search query (required)
- `page` - Pagination page (default: 1)
- `per_page` - Articles per page (default: 30, max: 1000)
- `search_fields` - Fields to search (title, body_text, tag_list)

## Write Operations

All write operations require the `DEVTO_API_KEY` environment variable to be set with a valid dev.to API key.

### create_article

Create a new article:

- `title` - Article title (required)
- `body_markdown` - Article body in Markdown (required)
- `published` - Whether to publish immediately (default: false = draft)
- `tags` - Array of tag slugs, up to 4 (e.g., `["javascript", "webdev"]`)
- `series` - Series name to add the article to
- `canonical_url` - Canonical URL if published elsewhere
- `description` - Short description/subtitle for listings

### update_article

Update an existing article:

- `id` - Article ID (required)
- `title` - New title
- `body_markdown` - New body in Markdown
- `published` - Set to true to publish, false to unpublish
- `tags` - Replacement tag list
- `series` - Series name
- `canonical_url` - Canonical URL
- `description` - Short description

Only provide the fields you want to change.

### delete_article

Unpublish an article (the dev.to public API does not support hard-delete):

- `id` - Article ID (required)

This sets `published: false` on the article.

### publish_article

Publish a draft article immediately:

- `id` - Article ID (required)

### get_my_articles

List your own articles:

- `state` - `published`, `unpublished`, or `all` (default: `all`)
- `page` - Page number (default: 1)
- `per_page` - Articles per page (default: 30)

### get_draft_articles

List your unpublished drafts (shorthand for `get_my_articles` with `state: unpublished`):

- `page` - Page number
- `per_page` - Drafts per page

### advanced_search_articles

Search with rich filtering — all parameters are optional:

- `tag` - Filter by tag slug
- `username` - Filter by author username
- `state` - `fresh`, `rising`, or `all`
- `top` - Trending window in days (1, 7, 30)
- `page` / `per_page` - Pagination
- `min_reading_time` - Minimum reading time in minutes (client-side)
- `max_reading_time` - Maximum reading time in minutes (client-side)
- `since` - Only articles published on or after this date (ISO 8601, e.g. `2024-01-01`)

### validate_api_key

Validate the configured API key and return the authenticated user's profile. No parameters required — reads from the `DEVTO_API_KEY` environment variable.

### batch_create_articles

Create multiple articles in one call:

- `articles` - Array of article objects (max 20), each with the same fields as `create_article`

Returns a summary (`succeeded`, `failed`, `total`) and a per-item result array — a single failure does not abort the rest.

### batch_update_articles

Update multiple articles in one call:

- `articles` - Array of update objects (max 20), each with an `id` plus any fields from `update_article`

Returns a summary and per-item results — failures are isolated per article.

## Error handling & reliability

All API requests include automatic retry logic:

- **Rate limiting (429)** — respects the `Retry-After` header
- **Server errors (5xx)** — exponential backoff: 500ms → 1s → 2s
- **Network errors** — retries up to 3 times with backoff
- **Structured errors** — every error includes the HTTP status code and the raw DEV.to error body for easier debugging

## Configuration

### Environment Variables

- `DEVTO_API_KEY` - Your dev.to API key (required for write operations)
- `PORT` - HTTP server port (default: 3000)
- `NODE_ENV` - Environment (default: development)
- `LOG_LEVEL` - Log level: error, warn, info, debug (default: info)

## License

MIT
