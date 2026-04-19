#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────
// CRUD API Generator CLI
//
// Usage:
//   crud-gen generate --schema ./src/db/schema.ts --outdir ./output
//   crud-gen generate -s schema.ts -o ./my-api
// ──────────────────────────────────────────────────────────────

import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import { parseSchema } from "./parser/schema-parser.js";
import { generateAllModules, type GeneratedFile } from "./generators/module-generator.js";

const program = new Command();

program
  .name("crud-gen")
  .description("Automatic CRUD API generator from Drizzle ORM schemas")
  .version("2.0.0");

program
  .command("generate")
  .description("Generate CRUD API modules from a Drizzle schema file")
  .requiredOption("-s, --schema <path>", "Path to the Drizzle ORM schema.ts file")
  .option("-o, --outdir <path>", "Output directory for generated files", "./output")
  .option("--no-infra", "Skip generating infrastructure files (app.ts, db/index.ts, etc.)")
  .option("--schema-import <path>", "Custom import path for the schema in generated code", "../db/schema.js")
  .option("--project-name <name>", "Project name for generated package.json", "my-crud-api")
  .option("--dry-run", "Print generated files without writing to disk")
  .action(async (opts) => {
    const schemaPath = path.resolve(opts.schema);
    const outDir = path.resolve(opts.outdir);

    console.log("");
    console.log("━━━ CRUD API Generator ━━━");
    console.log("");

    // ── Validate schema file exists ────────────────────────
    if (!fs.existsSync(schemaPath)) {
      console.error(`Error: Schema file not found: ${schemaPath}`);
      process.exit(1);
    }

    console.log(`Schema:  ${schemaPath}`);
    console.log(`Output:  ${outDir}`);
    console.log("");

    // ── Parse schema ───────────────────────────────────────
    console.log("Parsing Drizzle schema...");
    let parsedSchema;
    try {
      parsedSchema = parseSchema(schemaPath);
    } catch (err) {
      console.error("Failed to parse schema:", (err as Error).message);
      process.exit(1);
    }

    if (parsedSchema.tables.length === 0) {
      console.warn("Warning: No tables found in the schema file.");
      console.warn("Make sure you export pgTable() definitions from the schema.");
      process.exit(0);
    }

    // Print summary
    console.log(`Found ${parsedSchema.enums.length} enum(s):`);
    for (const e of parsedSchema.enums) {
      console.log(`  - ${e.variableName}: [${e.values.join(", ")}]`);
    }
    console.log(`Found ${parsedSchema.tables.length} table(s):`);
    for (const t of parsedSchema.tables) {
      const cols = t.columns.length;
      const rels = t.relations.length;
      const pk = t.primaryKeyColumns.join(", ") || "none";
      const flags: string[] = [];
      if (t.hasSoftDelete) flags.push("soft-delete");
      if (t.searchableColumns.length > 0) flags.push(`${t.searchableColumns.length} searchable`);
      if (t.foreignKeyColumns.length > 0) flags.push(`${t.foreignKeyColumns.length} FK`);
      console.log(
        `  - ${t.variableName} (${cols} cols, PK: ${pk}${rels > 0 ? `, ${rels} relations` : ""}${flags.length > 0 ? ` | ${flags.join(", ")}` : ""})`
      );
    }
    console.log("");

    // ── Generate code ──────────────────────────────────────
    console.log("Generating CRUD modules...");

    const files = generateAllModules({
      schema: parsedSchema,
      outDir,
      schemaImportPath: opts.schemaImport,
      generateInfra: opts.infra !== false,
      projectName: opts.projectName,
    });

    // ── Write or preview ───────────────────────────────────
    if (opts.dryRun) {
      console.log("");
      console.log("DRY RUN — files that would be generated:");
      console.log("");
      for (const file of files) {
        console.log(`FILE: ${file.relativePath}`);
        console.log("─".repeat(60));
        console.log(file.content);
        console.log("");
      }
    } else {
      writeFiles(outDir, files);
      console.log("");
      console.log(`Generated ${files.length} files in ${outDir}`);
    }

    // ── Print route manifest ───────────────────────────────
    console.log("");
    console.log("Generated endpoints:");
    console.log("");
    const apiPrefix = "/api";
    for (const table of parsedSchema.tables) {
      const routeBase = `${apiPrefix}/${toKebab(table.variableName)}`;
      const pk = table.primaryKeyColumns[0] ?? "id";
      console.log(`  ${table.variableName}:`);
      console.log(`    POST   ${routeBase}`);
      console.log(`    GET    ${routeBase}`);
      console.log(`    GET    ${routeBase}/:${pk}`);
      console.log(`    PATCH  ${routeBase}/:${pk}`);
      console.log(`    DELETE ${routeBase}/:${pk}`);
      console.log("");
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Done!");

    if (!opts.dryRun && opts.infra !== false) {
      console.log("");
      console.log("Next steps:");
      console.log(`  1. cd ${outDir}`);
      console.log("  2. Copy your schema.ts to src/db/schema.ts");
      console.log("  3. npm install");
      console.log("  4. Configure .env with your DATABASE_URL");
      console.log("  5. npm run dev");
    }
  });

program
  .command("inspect")
  .description("Parse and display schema analysis without generating code")
  .requiredOption("-s, --schema <path>", "Path to the Drizzle ORM schema.ts file")
  .action((opts) => {
    const schemaPath = path.resolve(opts.schema);

    if (!fs.existsSync(schemaPath)) {
      console.error(`Error: Schema file not found: ${schemaPath}`);
      process.exit(1);
    }

    const parsed = parseSchema(schemaPath);

    console.log(JSON.stringify(parsed, null, 2));
  });

program.parse();

// ── Helpers ──────────────────────────────────────────────────

function writeFiles(outDir: string, files: GeneratedFile[]) {
  for (const file of files) {
    const fullPath = path.join(outDir, file.relativePath);
    const dir = path.dirname(fullPath);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, file.content, "utf-8");

    console.log(`  + ${file.relativePath}`);
  }
}

function toKebab(str: string): string {
  return str
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase()
    .replace(/^-/, "")
    .replace(/_/g, "-");
}
