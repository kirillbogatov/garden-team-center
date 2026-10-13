# Garden architecture

Garden is a single-deployment modular monolith: an Express/SQLite backend and a React client built by Vite into `public/`.

## Client

The client lives in `src/` and is intentionally independent from the pre-2.0 vanilla UI. The old CSS and imperative view system are not part of the runtime anymore.

The UI stack is:

- React for rendering and state;
- React Router for product routes;
- Radix UI primitives for accessible behavior (dialog, menu, select, tooltip, avatar, switch, scroll area);
- shadcn-style source components in `src/components/ui.jsx` instead of a packaged theme;
- Tailwind CSS + CSS variables for design tokens;
- Lucide as the only icon family.

Product pages compose shared primitives. Reusable visual behavior belongs in `src/components`; server communication belongs in `src/lib/api.js`; route-level product logic belongs in `src/pages`.

### Design contract

The visual system starts from product needs, not from the previous Garden styles. Priorities are consistency, usability and calm density. All colors use semantic tokens, controls share the same sizing and focus behavior, and product pages use a common `Page / PageHeader / Section` hierarchy.

`/ideas` and `/workshop` are separate canonical routes. `/labs...` exists only as a compatibility redirect.

The React migration treats the original product behavior as the functional contract. In particular, `/technology` is a first-class event-planning workflow backed by `technologyEvents`, including period filtering, inline editing, people assignment, completion state, linked meeting creation and offline table export.

The same parity rule applies to product taxonomy and list workflows: `/team` and `/stakeholders` are separate product sections even though the persistence model keeps both record types in the `people` collection; project workload remains editable per project and per team member; task status vocabulary and filters match Garden; meetings expose type plus lifecycle filters; other typed/status-driven lists expose domain-appropriate filters.

Garden appearance themes are runtime token sets on `html.theme-*`. Theme selectors intentionally live outside Tailwind layers and all dynamically assembled theme/accent classes are safelisted, so production optimization cannot drop them.

## Server

`server/index.js` is the composition root. It creates shared dependencies and registers HTTP adapters. Business workflows stay in `server/application` and `server/domain`.

`server/routes/*` translate HTTP requests and responses. Multi-record workflows and transaction boundaries live in application services. Persistence stays behind `server/db.js`.

The React migration deliberately keeps the existing API and database model so user data, permissions, search semantics, notifications and domain workflows survive the UI rewrite.


### Stable public identifiers

Canonical records keep public identifiers inside their persisted JSON document. Generic CRUD resolves by the public key (and internal id for compatibility), while creation allocates the next key through a sequence cursor stored in SQLite `meta`. The cursor is workspace-scoped, so `main` and `demo` sequences are independent and deleting the latest entity cannot cause identifier reuse.

The public-key families are `ISSUE`, `PROCESS`, `AGREE`, `GOAL`, `NOTE`, `TOOL`, `MEET`, `IDEA` and `BLUEPRINT`. Project identity is user-managed `projectKey` (1–4 uppercase latin letters/digits) rather than an allocated sequence.

The database is migrated out-of-band before it is handed to this build. Runtime compatibility normalizers that used to strip Journal/project fields were removed. `db.update()` merges patches into the existing JSON record, which is a deliberate persistence contract: fields unknown to the current client survive round-trips.

## Build and runtime

`npm run build` writes the Vite build to `public/`, which Express serves in production. `Garden.bat` installs client dependencies and builds the UI when needed before starting the local server.
