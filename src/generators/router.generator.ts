// ──────────────────────────────────────────────────────────────
// Generates: src/routers/<entity>.router.ts
//
// Express router with inline controller handlers.
// Each handler: validates input → calls model → returns response.
// ──────────────────────────────────────────────────────────────

import type { GeneratorContext } from "../parser/types.js";

export function generateRouter(ctx: GeneratorContext): string {
  const { table, pascalSingular, pascalPlural, camelSingular, singular } = ctx;

  const pkCol = table.primaryKeyColumns[0] ?? "id";
  const pkField = table.columns.find((c) => c.isPrimaryKey);
  const pkIsNumber = pkField?.tsType === "number";

  const lines: string[] = [];

  // ── Imports ──────────────────────────────────────────────────
  lines.push(`import { Router, type Request, type Response } from "express";`);
  lines.push(`import * as ${pascalSingular}Model from "../models/${singular}.model.js";`);
  lines.push(`import { create${pascalSingular}Schema, update${pascalSingular}Schema, query${pascalSingular}Schema } from "../schemas/${singular}.schema.js";`);
  lines.push(``);

  lines.push(`const router = Router();`);
  lines.push(``);

  // ── PK parser helper ────────────────────────────────────────
  if (pkIsNumber) {
    lines.push(`function parsePk(req: Request): number {`);
    lines.push(`  const val = Number(req.params.${pkCol});`);
    lines.push(`  if (Number.isNaN(val)) throw new Error("Invalid ${pkCol}");`);
    lines.push(`  return val;`);
    lines.push(`}`);
  } else {
    lines.push(`function parsePk(req: Request): string {`);
    lines.push(`  return req.params.${pkCol};`);
    lines.push(`}`);
  }
  lines.push(``);

  // ═══════════════════════════════════════════════════════════
  // POST / — Create
  // ═══════════════════════════════════════════════════════════
  lines.push(`// ── POST / ──────────────────────────────────────────────────`);
  lines.push(`router.post("/", async (req: Request, res: Response): Promise<void> => {`);
  lines.push(`  try {`);
  lines.push(`    const parsed = create${pascalSingular}Schema.safeParse(req.body);`);
  lines.push(`    if (!parsed.success) {`);
  lines.push(`      res.status(422).json({ success: false, message: "Validation failed", errors: parsed.error.flatten().fieldErrors });`);
  lines.push(`      return;`);
  lines.push(`    }`);
  lines.push(``);
  lines.push(`    const record = await ${pascalSingular}Model.create(parsed.data);`);
  lines.push(`    res.status(201).json({ success: true, message: "${pascalSingular} created successfully", data: record });`);
  lines.push(`  } catch (error) {`);
  lines.push(`    res.status(500).json({ success: false, message: "Failed to create ${camelSingular}", error: error instanceof Error ? error.message : "Unknown error" });`);
  lines.push(`  }`);
  lines.push(`});`);
  lines.push(``);

  // ═══════════════════════════════════════════════════════════
  // GET / — List (paginated, filtered, searchable)
  // ═══════════════════════════════════════════════════════════
  lines.push(`// ── GET / ───────────────────────────────────────────────────`);
  lines.push(`router.get("/", async (req: Request, res: Response): Promise<void> => {`);
  lines.push(`  try {`);
  lines.push(`    const query = query${pascalSingular}Schema.safeParse(req.query);`);
  lines.push(`    if (!query.success) {`);
  lines.push(`      res.status(400).json({ success: false, message: "Invalid query parameters", errors: query.error.flatten().fieldErrors });`);
  lines.push(`      return;`);
  lines.push(`    }`);
  lines.push(``);
  lines.push(`    const result = await ${pascalSingular}Model.findAll(query.data);`);
  lines.push(`    res.json({ success: true, data: result.data, meta: result.meta });`);
  lines.push(`  } catch (error) {`);
  lines.push(`    res.status(500).json({ success: false, message: "Failed to fetch ${ctx.camelPlural}", error: error instanceof Error ? error.message : "Unknown error" });`);
  lines.push(`  }`);
  lines.push(`});`);
  lines.push(``);

  // ═══════════════════════════════════════════════════════════
  // GET /:id — Get by primary key
  // ═══════════════════════════════════════════════════════════
  lines.push(`// ── GET /:${pkCol} ────────────────────────────────────────────`);
  lines.push(`router.get("/:${pkCol}", async (req: Request, res: Response): Promise<void> => {`);
  lines.push(`  try {`);
  lines.push(`    const ${pkCol} = parsePk(req);`);
  lines.push(`    const record = await ${pascalSingular}Model.findById(${pkCol});`);
  lines.push(``);
  lines.push(`    if (!record) {`);
  lines.push(`      res.status(404).json({ success: false, message: "${pascalSingular} not found" });`);
  lines.push(`      return;`);
  lines.push(`    }`);
  lines.push(``);
  lines.push(`    res.json({ success: true, data: record });`);
  lines.push(`  } catch (error) {`);
  lines.push(`    res.status(500).json({ success: false, message: "Failed to fetch ${camelSingular}", error: error instanceof Error ? error.message : "Unknown error" });`);
  lines.push(`  }`);
  lines.push(`});`);
  lines.push(``);

  // ═══════════════════════════════════════════════════════════
  // PATCH /:id — Update
  // ═══════════════════════════════════════════════════════════
  lines.push(`// ── PATCH /:${pkCol} ─────────────────────────────────────────`);
  lines.push(`router.patch("/:${pkCol}", async (req: Request, res: Response): Promise<void> => {`);
  lines.push(`  try {`);
  lines.push(`    const ${pkCol} = parsePk(req);`);
  lines.push(``);
  lines.push(`    const parsed = update${pascalSingular}Schema.safeParse(req.body);`);
  lines.push(`    if (!parsed.success) {`);
  lines.push(`      res.status(422).json({ success: false, message: "Validation failed", errors: parsed.error.flatten().fieldErrors });`);
  lines.push(`      return;`);
  lines.push(`    }`);
  lines.push(``);
  lines.push(`    const existing = await ${pascalSingular}Model.findById(${pkCol});`);
  lines.push(`    if (!existing) {`);
  lines.push(`      res.status(404).json({ success: false, message: "${pascalSingular} not found" });`);
  lines.push(`      return;`);
  lines.push(`    }`);
  lines.push(``);
  lines.push(`    const record = await ${pascalSingular}Model.update(${pkCol}, parsed.data);`);
  lines.push(`    res.json({ success: true, message: "${pascalSingular} updated successfully", data: record });`);
  lines.push(`  } catch (error) {`);
  lines.push(`    res.status(500).json({ success: false, message: "Failed to update ${camelSingular}", error: error instanceof Error ? error.message : "Unknown error" });`);
  lines.push(`  }`);
  lines.push(`});`);
  lines.push(``);

  // ═══════════════════════════════════════════════════════════
  // DELETE /:id — Delete
  // ═══════════════════════════════════════════════════════════
  lines.push(`// ── DELETE /:${pkCol} ────────────────────────────────────────`);
  lines.push(`router.delete("/:${pkCol}", async (req: Request, res: Response): Promise<void> => {`);
  lines.push(`  try {`);
  lines.push(`    const ${pkCol} = parsePk(req);`);
  lines.push(``);
  lines.push(`    const existing = await ${pascalSingular}Model.findById(${pkCol});`);
  lines.push(`    if (!existing) {`);
  lines.push(`      res.status(404).json({ success: false, message: "${pascalSingular} not found" });`);
  lines.push(`      return;`);
  lines.push(`    }`);
  lines.push(``);
  lines.push(`    const record = await ${pascalSingular}Model.remove(${pkCol});`);
  lines.push(`    res.json({ success: true, message: "${pascalSingular} deleted successfully", data: record });`);
  lines.push(`  } catch (error) {`);
  lines.push(`    res.status(500).json({ success: false, message: "Failed to delete ${camelSingular}", error: error instanceof Error ? error.message : "Unknown error" });`);
  lines.push(`  }`);
  lines.push(`});`);
  lines.push(``);

  lines.push(`export default router;`);
  lines.push(``);

  return lines.join("\n");
}
