// ──────────────────────────────────────────────────────────────
// Generates: src/models/<entity>.model.ts
//
// Contains everything related to DB access for one table:
//   - Drizzle table re-export
//   - Inferred TypeScript types (Select / Insert / Update)
//   - All query functions (create, getAll, getById, update, delete)
//   - Pagination, filtering, search helpers
// ──────────────────────────────────────────────────────────────

import type { GeneratorContext } from "../parser/types.js";

export function generateModel(ctx: GeneratorContext): string {
  const { table, pascalSingular, pascalPlural, camelPlural, schemaImportPath, dbImportPath } = ctx;

  const varName = table.variableName;
  const pkCol = table.primaryKeyColumns[0] ?? "id";
  const pkField = table.columns.find((c) => c.isPrimaryKey);
  const pkTsType = pkField?.tsType ?? "number";

  // Collect drizzle-orm imports
  const drizzleImports = new Set(["eq", "and", "sql", "asc", "desc", "count", "type InferSelectModel", "type InferInsertModel"]);
  if (table.searchableColumns.length > 0) drizzleImports.add("ilike");
  if (table.searchableColumns.length > 1) drizzleImports.add("or");

  // Filter columns (FK + enum + boolean)
  const filterColumns = table.columns.filter(
    (c) => c.references || c.enumValues || c.drizzleType === "boolean"
  );

  const lines: string[] = [];

  // ── Imports ──────────────────────────────────────────────────
  lines.push(`import { ${[...drizzleImports].sort().join(", ")} } from "drizzle-orm";`);
  lines.push(`import { db } from "${dbImportPath}/index.js";`);

  const schemaExports = [varName];
  for (const col of table.columns) {
    if (col.enumName && !schemaExports.includes(col.enumName)) {
      schemaExports.push(col.enumName);
    }
  }
  lines.push(`import { ${schemaExports.join(", ")} } from "${schemaImportPath}";`);
  lines.push(``);

  // ── Re-export table ─────────────────────────────────────────
  lines.push(`export { ${schemaExports.join(", ")} };`);
  lines.push(``);

  // ── Types ───────────────────────────────────────────────────
  lines.push(`// ── Types ───────────────────────────────────────────────────`);
  lines.push(`export type ${pascalSingular} = InferSelectModel<typeof ${varName}>;`);
  lines.push(`export type New${pascalSingular} = InferInsertModel<typeof ${varName}>;`);
  lines.push(`export type ${pascalSingular}Update = Partial<Omit<New${pascalSingular}, ${table.primaryKeyColumns.map((c) => `"${c}"`).join(" | ")}>>;`);
  lines.push(``);

  // ── Query options interface ─────────────────────────────────
  lines.push(`// ── Query options ────────────────────────────────────────────`);
  lines.push(`export interface ${pascalSingular}QueryOptions {`);
  lines.push(`  page?: number;`);
  lines.push(`  limit?: number;`);
  lines.push(`  sort?: string;`);
  lines.push(`  order?: "asc" | "desc";`);
  lines.push(`  search?: string;`);
  for (const col of filterColumns) {
    const type = col.enumValues
      ? col.enumValues.map((v) => `"${v}"`).join(" | ")
      : col.tsType;
    lines.push(`  ${col.name}?: ${type};`);
  }
  lines.push(`}`);
  lines.push(``);

  // ── Where clause builder ────────────────────────────────────
  lines.push(`// ── Internal helpers ─────────────────────────────────────────`);
  lines.push(`function buildWhereConditions(options: ${pascalSingular}QueryOptions) {`);
  lines.push(`  const conditions = [];`);

  // Soft delete filter
  if (table.hasSoftDelete && table.softDeleteColumn) {
    const sdCol = table.softDeleteColumn;
    lines.push(``);
    if (sdCol === "deletedAt" || sdCol === "deleted_at") {
      lines.push(`  // Exclude soft-deleted records by default`);
      lines.push(`  conditions.push(sql\`\${${varName}.${sdCol}} IS NULL\`);`);
    } else {
      lines.push(`  // Exclude soft-deleted records by default`);
      lines.push(`  conditions.push(eq(${varName}.${sdCol}, false));`);
    }
  }

  // Search
  if (table.searchableColumns.length > 0) {
    lines.push(``);
    lines.push(`  if (options.search) {`);
    lines.push(`    const term = \`%\${options.search}%\`;`);
    if (table.searchableColumns.length === 1) {
      lines.push(`    conditions.push(ilike(${varName}.${table.searchableColumns[0]}, term));`);
    } else {
      lines.push(`    conditions.push(`);
      lines.push(`      or(`);
      for (let i = 0; i < table.searchableColumns.length; i++) {
        const col = table.searchableColumns[i];
        const comma = i < table.searchableColumns.length - 1 ? "," : "";
        lines.push(`        ilike(${varName}.${col}, term)${comma}`);
      }
      lines.push(`      )!`);
      lines.push(`    );`);
    }
    lines.push(`  }`);
  }

  // Filters
  for (const col of filterColumns) {
    lines.push(``);
    lines.push(`  if (options.${col.name} !== undefined) {`);
    lines.push(`    conditions.push(eq(${varName}.${col.name}, options.${col.name}));`);
    lines.push(`  }`);
  }

  lines.push(``);
  lines.push(`  return conditions;`);
  lines.push(`}`);
  lines.push(``);

  lines.push(`function buildOrderBy(sort?: string, order?: "asc" | "desc") {`);
  lines.push(`  const dir = order === "desc" ? desc : asc;`);
  lines.push(`  const col = sort && sort in ${varName} ? (${varName} as Record<string, any>)[sort] : ${varName}.${pkCol};`);
  lines.push(`  return dir(col);`);
  lines.push(`}`);
  lines.push(``);

  // ═══════════════════════════════════════════════════════════
  // CREATE
  // ═══════════════════════════════════════════════════════════
  lines.push(`// ── Create ──────────────────────────────────────────────────`);
  lines.push(`export async function create(data: New${pascalSingular}): Promise<${pascalSingular}> {`);
  lines.push(`  const [record] = await db.insert(${varName}).values(data).returning();`);
  lines.push(`  return record;`);
  lines.push(`}`);
  lines.push(``);

  // ═══════════════════════════════════════════════════════════
  // FIND ALL (paginated + filtered)
  // ═══════════════════════════════════════════════════════════
  lines.push(`// ── Find all (paginated) ─────────────────────────────────────`);
  lines.push(`export async function findAll(options: ${pascalSingular}QueryOptions = {}) {`);
  lines.push(`  const page = options.page ?? 1;`);
  lines.push(`  const limit = Math.min(options.limit ?? 20, 100);`);
  lines.push(`  const offset = (page - 1) * limit;`);
  lines.push(`  const conditions = buildWhereConditions(options);`);
  lines.push(`  const orderBy = buildOrderBy(options.sort, options.order);`);
  lines.push(`  const where = conditions.length > 0 ? and(...conditions) : undefined;`);
  lines.push(``);
  lines.push(`  const [data, totalResult] = await Promise.all([`);
  lines.push(`    db.select().from(${varName}).where(where).orderBy(orderBy).limit(limit).offset(offset),`);
  lines.push(`    db.select({ count: count() }).from(${varName}).where(where),`);
  lines.push(`  ]);`);
  lines.push(``);
  lines.push(`  const total = totalResult[0]?.count ?? 0;`);
  lines.push(`  const totalPages = Math.ceil(total / limit);`);
  lines.push(``);
  lines.push(`  return {`);
  lines.push(`    data,`);
  lines.push(`    meta: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },`);
  lines.push(`  };`);
  lines.push(`}`);
  lines.push(``);

  // ═══════════════════════════════════════════════════════════
  // FIND BY ID
  // ═══════════════════════════════════════════════════════════
  lines.push(`// ── Find by ID ──────────────────────────────────────────────`);
  lines.push(`export async function findById(${pkCol}: ${pkTsType}): Promise<${pascalSingular} | undefined> {`);
  lines.push(`  const [record] = await db.select().from(${varName}).where(eq(${varName}.${pkCol}, ${pkCol}));`);
  lines.push(`  return record;`);
  lines.push(`}`);
  lines.push(``);

  // ═══════════════════════════════════════════════════════════
  // FIND BY FOREIGN KEY
  // ═══════════════════════════════════════════════════════════
  for (const fkCol of table.foreignKeyColumns) {
    const fkPascal = fkCol.name.charAt(0).toUpperCase() + fkCol.name.slice(1);

    lines.push(`// ── Find by ${fkCol.name} ──────────────────────────────────────`);
    lines.push(`export async function findBy${fkPascal}(${fkCol.name}: ${fkCol.tsType}): Promise<${pascalSingular}[]> {`);
    lines.push(`  return db.select().from(${varName}).where(eq(${varName}.${fkCol.name}, ${fkCol.name}));`);
    lines.push(`}`);
    lines.push(``);
  }

  // ═══════════════════════════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════════════════════════
  lines.push(`// ── Update ──────────────────────────────────────────────────`);
  lines.push(`export async function update(${pkCol}: ${pkTsType}, data: ${pascalSingular}Update): Promise<${pascalSingular} | undefined> {`);
  lines.push(`  const [record] = await db.update(${varName}).set(data).where(eq(${varName}.${pkCol}, ${pkCol})).returning();`);
  lines.push(`  return record;`);
  lines.push(`}`);
  lines.push(``);

  // ═══════════════════════════════════════════════════════════
  // DELETE
  // ═══════════════════════════════════════════════════════════
  if (table.hasSoftDelete && table.softDeleteColumn) {
    const sdCol = table.softDeleteColumn;
    const isTimestampSd = sdCol === "deletedAt" || sdCol === "deleted_at";

    lines.push(`// ── Soft delete ─────────────────────────────────────────────`);
    lines.push(`export async function remove(${pkCol}: ${pkTsType}): Promise<${pascalSingular} | undefined> {`);
    if (isTimestampSd) {
      lines.push(`  const [record] = await db.update(${varName}).set({ ${sdCol}: new Date() }).where(eq(${varName}.${pkCol}, ${pkCol})).returning();`);
    } else {
      lines.push(`  const [record] = await db.update(${varName}).set({ ${sdCol}: true }).where(eq(${varName}.${pkCol}, ${pkCol})).returning();`);
    }
    lines.push(`  return record;`);
    lines.push(`}`);
    lines.push(``);

    lines.push(`// ── Hard delete (permanent) ─────────────────────────────────`);
    lines.push(`export async function hardRemove(${pkCol}: ${pkTsType}): Promise<${pascalSingular} | undefined> {`);
    lines.push(`  const [record] = await db.delete(${varName}).where(eq(${varName}.${pkCol}, ${pkCol})).returning();`);
    lines.push(`  return record;`);
    lines.push(`}`);
  } else {
    lines.push(`// ── Delete ──────────────────────────────────────────────────`);
    lines.push(`export async function remove(${pkCol}: ${pkTsType}): Promise<${pascalSingular} | undefined> {`);
    lines.push(`  const [record] = await db.delete(${varName}).where(eq(${varName}.${pkCol}, ${pkCol})).returning();`);
    lines.push(`  return record;`);
    lines.push(`}`);
  }
  lines.push(``);

  return lines.join("\n");
}
