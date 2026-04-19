# PostgreSQL Auto CRUD API Generator

Connects to any PostgreSQL database, introspects the schema at startup, and
automatically generates a fully-featured REST API for every table — no code
generation, no migrations, just plug in your connection string and run.

## Features

| Feature | Details |
|---|---|
| Schema introspection | Tables, columns, data types, primary keys, unique constraints |
| Full CRUD | GET (list), GET (by PK), POST, PUT, PATCH, DELETE |
| Composite PKs | Supported via `/:pk0/:pk1/...` routing |
| Pagination | `?page=2&limit=25` with `meta` envelope |
| Filtering | Equality, comparison, LIKE, ILIKE, IN, IS NULL operators |
| Sorting | `?sort=column&order=asc\|desc` |
| Field selection | `?fields=id,name,email` |
| Validation | Zod schemas generated from PG column types and nullability |
| Error handling | Structured JSON errors, PG constraint → HTTP code mapping |
| Security | Helmet, parameterized queries (no SQL injection surface) |
| Connection pooling | `pg.Pool` with idle timeout and connection limits |
| Graceful shutdown | SIGTERM/SIGINT handling |

---

## Quick Start

```bash
# 1. Clone and install
npm install

# 2. Configure
cp .env.example .env
# Edit .env with your database credentials

# 3. Run
npm run dev      # development (nodemon)
npm start        # production
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | Full PostgreSQL URL (takes priority over individual vars) |
| `DB_HOST` | `localhost` | Host |
| `DB_PORT` | `5432` | Port |
| `DB_NAME` | — | Database name |
| `DB_USER` | — | Username |
| `DB_PASSWORD` | — | Password |
| `DB_SSL` | `false` | Set `true` for SSL connections |
| `DB_SCHEMAS` | `public` | Comma-separated schemas to expose |
| `PORT` | `3000` | HTTP server port |
| `API_PREFIX` | `/api` | URL prefix for all routes |
| `EXCLUDED_TABLES` | — | Comma-separated table names to hide |
| `DEFAULT_PAGE_SIZE` | `20` | Default items per page |
| `MAX_PAGE_SIZE` | `100` | Hard cap on `?limit=` |

---

## API Reference

### Route Structure

For a table `users` with PK `id`:

| Method | Path | Action |
|---|---|---|
| `GET` | `/api/users` | List (paginated) |
| `GET` | `/api/users/:id` | Get one |
| `POST` | `/api/users` | Create |
| `PUT` | `/api/users/:id` | Full update |
| `PATCH` | `/api/users/:id` | Partial update |
| `DELETE` | `/api/users/:id` | Delete |

For a composite PK `(org_id, user_id)`:

```
GET/PUT/PATCH/DELETE  /api/memberships/:pk0/:pk1
```

### List Endpoint Query Parameters

```
GET /api/users?page=2&limit=10&sort=created_at&order=desc&fields=id,email,name
```

#### Filters

Append `__operator` to any column name:

| Operator | SQL | Example |
|---|---|---|
| *(none)* or `__eq` | `=` | `?status=active` |
| `__ne` | `!=` | `?status__ne=deleted` |
| `__gt` | `>` | `?age__gt=18` |
| `__gte` | `>=` | `?age__gte=21` |
| `__lt` | `<` | `?price__lt=100` |
| `__lte` | `<=` | `?price__lte=99.99` |
| `__like` | `LIKE` | `?name__like=John%` |
| `__ilike` | `ILIKE` | `?email__ilike=%@gmail.com` |
| `__in` | `IN (...)` | `?role__in=admin,editor` |
| `__nin` | `NOT IN (...)` | `?status__nin=banned,deleted` |
| `__is` | `IS NULL` | `?deleted_at__is=null` |
| `__isnot` | `IS NOT NULL` | `?deleted_at__isnot=null` |

### Response Envelope

**List response:**
```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

**Single item response:**
```json
{
  "success": true,
  "data": { "id": 1, "email": "user@example.com" }
}
```

**Error response:**
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "details": {
      "email": ["Invalid email"]
    }
  }
}
```

### HTTP Status Codes

| Code | Meaning |
|---|---|
| `200` | OK |
| `201` | Created |
| `400` | Bad request / invalid format |
| `404` | Resource not found |
| `409` | Unique or FK constraint violation |
| `422` | Validation error |
| `500` | Unexpected server error |
| `503` | Database unavailable |

---

## Special Endpoints

```
GET /health          → { status: "ok", timestamp: "..." }
GET /api             → Route manifest (all exposed tables and endpoints)
```

---

## Project Structure

```
src/
├── index.js                  # Entry point — connects, introspects, starts server
├── app.js                    # Express app factory
├── db/
│   ├── pool.js               # pg.Pool singleton + query helper
│   └── introspect.js         # Schema introspection via information_schema
├── generator/
│   ├── routeGenerator.js     # Creates Express routers from table metadata
│   ├── queryBuilder.js       # Parameterized SQL query construction
│   └── typeMapper.js         # PG types → Zod validation schemas
├── middleware/
│   ├── asyncHandler.js       # Async route wrapper (no try/catch boilerplate)
│   └── errorHandler.js       # Global error handler + AppError class
└── utils/
    └── response.js           # Standardised JSON response helpers
```

---

## Security Notes

- All SQL identifiers are double-quoted to prevent injection via column/table names
- All user values use `$N` parameterized placeholders
- Column names in filters are validated against the schema before use
- Sort column is validated against known columns before interpolation
- `helmet` sets security-related HTTP headers on every response
