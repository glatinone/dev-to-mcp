# Security Policy

## Scope

This project is an MCP server that integrates with the dev.to API, including
authenticated publishing on behalf of a user. Credential handling is
explicitly in scope for security reports, including but not limited to:

- Exposure, logging, or leakage of dev.to API tokens or other credentials
- Insecure storage or transmission of API tokens
- Any code path that could cause a token to be sent to an unintended
  destination
- Authentication or authorization flaws affecting publishing, editing, or
  deleting content on a user's behalf
- Injection, path traversal, or other flaws in request handling that could
  lead to unauthorized API calls or data disclosure

## Supported Versions

Security fixes are provided for the latest released version on the default
branch. Older versions are not maintained and should be upgraded.

## Reporting a Vulnerability

Report vulnerabilities privately using GitHub Security Advisories:

1. Go to the repository's Security tab.
2. Select "Report a vulnerability" to open a new draft security advisory.
3. Include a description of the issue, steps to reproduce, affected
   versions, and potential impact.

Do not report security issues through public GitHub issues, discussions, or
pull requests.

## Response Process

- Acknowledgment: reports will be acknowledged within 72 hours.
- Resolution target: verified vulnerabilities will be addressed with a target
  resolution and disclosure timeline of 90 days from confirmation, depending
  on severity and complexity.
- Reporters will be kept informed of progress and notified when a fix is
  released.

## Disclosure

Coordinated disclosure is preferred. Details of a vulnerability will not be
published until a fix is available, or until the 90-day target has elapsed,
whichever comes first, unless the reporter and maintainers agree otherwise.
