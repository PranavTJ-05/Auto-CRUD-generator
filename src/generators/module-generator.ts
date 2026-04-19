// ──────────────────────────────────────────────────────────────
// Module Generator — orchestrates code generation for all
// parsed tables into the flat folder structure:
//
//   src/
//     models/       ← types + DB queries per table
//     schemas/      ← Zod validation per table
//     routers/      ← Express routes + handlers per table
//       index.ts    ← aggregated router
//     db/
//       index.ts    ← Drizzle connection
//     app.ts
//     index.ts
// ──────────────────────────────────────────────────────────────

import type { ParsedSchema, ParsedTable, GeneratorContext } from "../parser/types.js";
import { buildNames } from "../utils/naming.js";

import { generateModel } from "./model.generator.js";
import { generateSchema } from "./schema.generator.js";
import { generateRouter } from "./router.generator.js";
import {
  generateDbIndex,
  generateRouterIndex,
  generateApp,
  generateServerEntry,
  generateEnvExample,
  generateTsConfig,
  generatePackageJson,
} from "./app.generator.js";

export interface GeneratedFile {
  relativePath: string;
  content: string;
}

export interface GenerateOptions {
  schema: ParsedSchema;
  outDir: string;
  schemaImportPath: string;
  generateInfra: boolean;
  projectName: string;
}

export function generateAllModules(options: GenerateOptions): GeneratedFile[] {
  const { schema, schemaImportPath, generateInfra, projectName } = options;
  const files: GeneratedFile[] = [];

  // ── Per-table files across three folders ─────────────────────
  for (const table of schema.tables) {
    const ctx = buildContext(table, schema, schemaImportPath);

    files.push({
      relativePath: `src/models/${ctx.singular}.model.ts`,
      content: generateModel(ctx),
    });

    files.push({
      relativePath: `src/schemas/${ctx.singular}.schema.ts`,
      content: generateSchema(ctx),
    });

    files.push({
      relativePath: `src/routers/${ctx.singular}.router.ts`,
      content: generateRouter(ctx),
    });
  }

  // ── Aggregated router index ─────────────────────────────────
  files.push({
    relativePath: "src/routers/index.ts",
    content: generateRouterIndex(schema),
  });

  // ── Infrastructure files ────────────────────────────────────
  if (generateInfra) {
    files.push({
      relativePath: "src/db/index.ts",
      content: generateDbIndex("./schema.js"),
    });

    files.push({
      relativePath: "src/app.ts",
      content: generateApp(),
    });

    files.push({
      relativePath: "src/index.ts",
      content: generateServerEntry(),
    });

    files.push({
      relativePath: ".env.example",
      content: generateEnvExample(),
    });

    files.push({
      relativePath: "tsconfig.json",
      content: generateTsConfig(),
    });

    files.push({
      relativePath: "package.json",
      content: generatePackageJson(projectName),
    });
  }

  return files;
}

function buildContext(
  table: ParsedTable,
  schema: ParsedSchema,
  schemaImportPath: string
): GeneratorContext {
  const names = buildNames(table.variableName);

  return {
    table,
    schema,
    singular: names.singular,
    plural: names.plural,
    pascalSingular: names.pascalSingular,
    pascalPlural: names.pascalPlural,
    camelSingular: names.camelSingular,
    camelPlural: names.camelPlural,
    moduleName: names.moduleName,
    // models/ and schemas/ are siblings to db/, so one level up
    schemaImportPath: schemaImportPath,
    dbImportPath: "../db",
  };
}
