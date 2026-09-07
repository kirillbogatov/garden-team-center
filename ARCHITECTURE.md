# Garden architecture

Garden intentionally stays on a small stack: browser JavaScript, Express and SQLite. The goal of the architecture is to keep features composable without introducing a build system or a frontend framework.

## Layers

### `public/js/views/`
Route-level UI only. A view coordinates data and shared UI primitives; it must not depend on another view for helper functions.

### `public/js/domain/`
Pure or mostly-pure domain helpers shared by multiple views: labels/constants, project load calculations, entity renderers, meeting helpers and goal-tree rendering.

### `public/js/lib/`
Reusable application/UI infrastructure:

- `services.js` — resource/service API facade.
- `relations.js` — relation selectors and relation payload helpers.
- `entity-form.js` — schema-driven create/edit forms.
- `detail-page.js` — common entity detail primitives.
- `comments.js` — common comment thread UI.
- `resource-form.js` — shared link-resource form.
- `view-loader.js` — native dynamic `import()` for route features.
- `router.js`, `auth.js`, `interactions.js` — application infrastructure.

### `server/routes/`
HTTP adapters. Standard collection CRUD, comments, auth, settings, search, aggregates and photos live in independent route modules.

### `server/domain/`
Server-side workflows that are not HTTP concerns, including journal-derived entities, recurring meetings and smart-search digests.

### Search / NLU
`server/routes/search.js` exposes one structured `parseQuery()` result for ordinary content requests: intent, entity and domain filters. Regular search executes that plan directly, and `server/domain/smart-search.js` reuses the same parsed plan for its fallback instead of reparsing natural language. Special assistant-only create/digest intents remain in `smart-search.js` until they can be moved without changing product behavior.

### persistence
SQLite is the source of truth. `workspace` and `relation_key` are indexed columns so common filtering does not require loading every JSON record into Node.

## Rules

1. A view must not load another view to obtain a helper. Shared logic belongs in `domain/`, `lib/` or a service.
2. Standard CRUD in views goes through `Resources.*`; direct `api.*` is for special endpoints/read models only.
3. Normal create/edit forms use `EntityForm` schemas. A specialized form is justified only by genuinely custom interaction.
4. Repeated detail-page UI uses `detail-page` primitives instead of copied markup.
5. Comments use the universal comments UI/API, keyed by entity type and entity id.
6. Relations are read/written through `Relations` rather than ad-hoc array logic in views.
7. Generated HTML must not contain inline JavaScript event attributes. Use declarative `data-*` actions and delegated events.
8. Domain labels/status dictionaries live in `domain/constants.js`.
9. `server/index.js` is composition/bootstrap, not a home for business workflows.
10. When a UI pattern appears for a third time, promote it to a shared primitive rather than copy it again.

## Runtime compatibility

Views are native ES modules and are lazy-loaded. Межfeature-команды идут через `FeatureLoader`; view-модули не используют `window` как compatibility API.

База данных считается канонической: runtime не выполняет миграции старых `GLAB-*`, legacy comment collections или JSON-only workspace metadata. Обновление старой пользовательской базы выполняется отдельным конвертером перед запуском этой версии.

## Feature commands

Lazy-loaded views не используют `window` как API между модулями. Публичные команды feature регистрируются через `FeatureLoader.register({ ... })`, а внешние вызовы выполняются через `FeatureLoader.run(name, ...args)`. `FeatureLoader` сам подгружает модуль-владелец команды при необходимости.

Внутренние render/helper функции view не экспортируются глобально. `window` не должен использоваться для передачи view-local state.

## Data format policy

Runtime работает только с текущим форматом базы. Исторические преобразования не живут в `server/db.js` и request handlers: старые базы сначала конвертируются отдельным инструментом/релизной процедурой, после чего приложение работает без миграционных веток.
