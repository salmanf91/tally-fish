# Project Rules: Daily Statement PWA (Multi-Branch)

- Architecture: Unified React 18 + Vite PWA frontend, Node.js + Express backend, PostgreSQL 16+.
- RBAC & Branch Scope: Every request validates (user_id, branch_id, role). Role must be one of: staff, staffAdmin, owner, billingAdmin.
- Entry Locking: Once an Admin sets a rate on an entry, it is strictly locked from Staff edits on the server.
- Offline-First: Staff entry capture uses IndexedDB (`idb`). Conflicts from late offline sync must route to `hold_review`.
- Web Push: Native W3C Web Push via RFC 8291/8292 VAPID (`web-push` library). No paid SaaS wrappers.
- Grounding: Always reference specs in `docs/` before implementing schemas, API endpoints, or formulas.