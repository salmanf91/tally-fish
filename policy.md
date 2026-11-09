# AIFD Admission Portal — Agent Security Guidelines

This project has **11 hardened cybersecurity policies** that were explicitly fixed in production. These apply in two directions:

1. **Preservation** — existing implementations of each policy must not be weakened or removed.
2. **Compliance** — any new feature or change to existing code must be built to satisfy all relevant policies from the start.

If a task cannot be completed without breaking one of these policies, stop and ask for clarification rather than bypassing the control.

---

## The 11 Security Policies

### Policy 1 — Anti-Bot / Rate Limiting on Registration
`express-rate-limit` is applied in backend with limiters:
- Global: `/api/*` — 15 minutes, 100 per IP
- Auth (strict): Auth endpoints — 1 hour, 5 per IP

### Policy 2 — Restricted CORS Policy
CORS locked to explicit allowlist with `credentials: true`, no `*` wildcard.

### Policy 3 — HTTP Security Headers (Helmet + HSTS)
`helmet()` configured with explicit HSTS settings (1 year maxAge, includeSubDomains, preload).

### Policy 4 — Content Security Policy (CSP)
Strict CSP directives with no `'unsafe-inline'` or `'unsafe-eval'`.

### Policy 5 — Clickjacking Protection
Two-layer defense:
1. `frame-ancestors: 'none'` in CSP
2. Frame-busting script in `frontend/index.html` (`if (self !== top) { top.location = self.location; }`)

### Policy 6 — No-Cache Headers on API Responses
Explicit no-cache headers on all sensitive/authenticated API responses (`no-store, no-cache, must-revalidate`).

### Policy 7 — Global Input Sanitisation & Length Limiting
Global recursive input sanitizer stripping tags and rejecting payloads exceeding field limits (e.g. 2048 chars).

### Policy 8 — Secure File Upload Validation (CWE-434)
Multi-layer upload validation:
- Dangerous double-extension check
- Exact MIME type and extension whitelists
- File size limits (2MB max)
- Server-side and client-side malicious payload / operator scanning
- Safe server filename generation

### Policy 9 — Information Leakage Prevention
Global error handler masking internal 500 error messages, stack traces, and database schemas. Forwarding unexpected errors via `next(err)`.

### Policy 10 — Frontend Input Validation & Length Limits
Defence-in-depth client-side regex format checking and `maxLength` caps on all inputs.

### Policy 11 — Tenant / Branch Level Data Isolation (Row-Level Security)
Every authenticated request enforces branch/tenant isolation based on token claims. Multi-branch access strictly isolated by active branch ID with tenant check middleware.

