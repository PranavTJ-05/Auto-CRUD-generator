// ──────────────────────────────────────────────────────────────
// Generates infrastructure files for the target project:
//   - db/index.ts           (Drizzle DB connection)
//   - routers/index.ts      (Aggregated router)
//   - app.ts                (Express app setup)
//   - index.ts              (Server entry point)
//   - package.json / tsconfig.json / .env.example
// ──────────────────────────────────────────────────────────────

import type { ParsedSchema } from "../parser/types.js";
import { buildNames, toKebabCase } from "../utils/naming.js";

/**
 * Generates db/index.ts — Drizzle DB connection singleton
 */
export function generateDbIndex(schemaRelativePath: string): string {
  return `import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "${schemaRelativePath}";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err.message);
});

export const db = drizzle(pool, { schema });

export async function testConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    console.log("Database connection established successfully.");
  } finally {
    client.release();
  }
}

export async function closeConnection(): Promise<void> {
  await pool.end();
}
`;
}

/**
 * Generates routers/index.ts — aggregated router mounting all table routers
 */
export function generateRouterIndex(schema: ParsedSchema): string {
  const lines: string[] = [];

  lines.push(`import { Router } from "express";`);
  lines.push(``);

  for (const table of schema.tables) {
    const names = buildNames(table.variableName);
    lines.push(`import ${names.camelSingular}Router from "./${names.singular}.router.js";`);
  }

  lines.push(``);
  lines.push(`const router = Router();`);
  lines.push(``);

  for (const table of schema.tables) {
    const names = buildNames(table.variableName);
    lines.push(`router.use("/${toKebabCase(table.variableName)}", ${names.camelSingular}Router);`);
  }

  lines.push(``);
  lines.push(`export default router;`);
  lines.push(``);

  return lines.join("\n");
}

/**
 * Generates app.ts — Express app setup
 */
export function generateApp(): string {
  return `import express from "express";
import cors from "cors";
import helmet from "helmet";
import apiRouter from "./routers/index.js";

const app = express();

// ── Security & Infrastructure Middleware ───────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

// ── Health check ──────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── API Routes ────────────────────────────────────────────────
const apiPrefix = process.env.API_PREFIX ?? "/api";
app.use(apiPrefix, apiRouter);

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: \`Route \${req.method} \${req.path} not found\`,
  });
});

// ── Global error handler ──────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[Error]", err.message);

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
);

export default app;
`;
}

/**
 * Generates index.ts — Server entry point
 */
export function generateServerEntry(): string {
  return `import "dotenv/config";
import app from "./app.js";
import { testConnection } from "./db/index.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

async function bootstrap() {
  console.log("━━━ CRUD API Server ━━━");

  try {
    await testConnection();
  } catch (err) {
    console.error("Database connection failed:", (err as Error).message);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(\`Server running on http://localhost:\${PORT}\`);
    console.log(\`API prefix: \${process.env.API_PREFIX ?? "/api"}\`);
    console.log(\`Health: http://localhost:\${PORT}/health\`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━");
  });

  const shutdown = (signal: string) => {
    console.log(\`\\n\${signal} received — shutting down...\`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
`;
}

export function generateEnvExample(): string {
  return `# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# Server
PORT=3000
NODE_ENV=development

# API
API_PREFIX=/api
`;
}

export function generateTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        lib: ["ES2022"],
        outDir: "dist",
        rootDir: "src",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        declaration: true,
        sourceMap: true,
      },
      include: ["src/**/*"],
      exclude: ["node_modules", "dist"],
    },
    null,
    2
  );
}

export function generatePackageJson(projectName: string): string {
  return JSON.stringify(
    {
      name: projectName,
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "tsx watch src/index.ts",
        build: "tsc",
        start: "node dist/index.js",
        "db:generate": "drizzle-kit generate",
        "db:migrate": "drizzle-kit migrate",
        "db:studio": "drizzle-kit studio",
      },
      dependencies: {
        cors: "^2.8.5",
        dotenv: "^16.4.5",
        "drizzle-orm": "^0.36.0",
        express: "^4.21.0",
        helmet: "^8.0.0",
        pg: "^8.13.0",
        zod: "^3.23.8",
      },
      devDependencies: {
        "@types/cors": "^2.8.17",
        "@types/express": "^5.0.0",
        "@types/node": "^22.0.0",
        "@types/pg": "^8.11.0",
        "drizzle-kit": "^0.28.0",
        tsx: "^4.19.0",
        typescript: "^5.6.0",
      },
    },
    null,
    2
  );
}
