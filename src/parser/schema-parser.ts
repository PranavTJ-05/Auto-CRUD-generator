// ──────────────────────────────────────────────────────────────
// Drizzle ORM schema parser using ts-morph for AST analysis.
//
// Extracts tables, columns, enums, and relations from a
// standard Drizzle pgTable/mysqlTable/sqliteTable schema file.
// ──────────────────────────────────────────────────────────────

import { Project, SyntaxKind, CallExpression, Node, ObjectLiteralExpression, PropertyAssignment } from "ts-morph";
import type { ParsedColumn, ParsedEnum, ParsedRelation, ParsedSchema, ParsedTable, ForeignKeyRef } from "./types.js";

// ── Drizzle type → TypeScript type mapping ────────────────────

const DRIZZLE_TYPE_MAP: Record<string, string> = {
  // Integers
  serial: "number",
  smallserial: "number",
  bigserial: "number",
  integer: "number",
  smallint: "number",
  bigint: "number",
  int: "number",

  // Floats
  real: "number",
  doublePrecision: "number",
  numeric: "string",
  decimal: "string",

  // Strings
  text: "string",
  varchar: "string",
  char: "string",
  citext: "string",
  name: "string",

  // Boolean
  boolean: "boolean",

  // UUID
  uuid: "string",

  // Date / Time
  date: "string",
  time: "string",
  timestamp: "Date",
  interval: "string",

  // JSON
  json: "unknown",
  jsonb: "unknown",

  // Network
  inet: "string",
  cidr: "string",
  macaddr: "string",
  macaddr8: "string",

  // Geometric
  point: "{ x: number; y: number }",
  line: "string",

  // Enum — resolved at parse time
  pgEnum: "string",
};

const SEARCHABLE_TYPES = new Set(["text", "varchar", "char", "citext", "name"]);
const TIMESTAMP_TYPES = new Set(["timestamp", "date", "time"]);
const AUTO_GENERATED_TYPES = new Set(["serial", "smallserial", "bigserial"]);

// ──────────────────────────────────────────────────────────────
// Main parser
// ──────────────────────────────────────────────────────────────

export function parseSchema(schemaFilePath: string): ParsedSchema {
  const project = new Project({
    compilerOptions: {
      allowJs: true,
      noEmit: true,
      skipLibCheck: true,
    },
  });

  const sourceFile = project.addSourceFileAtPath(schemaFilePath);

  // ── Step 1: Parse all pgEnum declarations ──────────────────
  const enums = parseEnums(sourceFile);
  const enumMap = new Map(enums.map((e) => [e.variableName, e]));

  // ── Step 2: Parse all pgTable declarations ─────────────────
  const tables: ParsedTable[] = [];
  const tableVarNames = new Map<string, ParsedTable>();

  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const initializer = varDecl.getInitializer();
    if (!initializer || !Node.isCallExpression(initializer)) continue;

    const fnName = getCallExpressionName(initializer);
    if (!fnName || !fnName.endsWith("Table")) continue; // pgTable, mysqlTable, sqliteTable

    const table = parseTableCall(varDecl.getName(), initializer, enumMap);
    if (table) {
      tables.push(table);
      tableVarNames.set(table.variableName, table);
    }
  }

  // ── Step 3: Parse relations ────────────────────────────────
  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const initializer = varDecl.getInitializer();
    if (!initializer || !Node.isCallExpression(initializer)) continue;

    const fnName = getCallExpressionName(initializer);
    if (fnName !== "relations") continue;

    parseRelationsCall(initializer, tableVarNames);
  }

  return {
    enums,
    tables,
    schemaPath: schemaFilePath,
  };
}

// ──────────────────────────────────────────────────────────────
// Enum parsing
// ──────────────────────────────────────────────────────────────

function parseEnums(sourceFile: ReturnType<Project["addSourceFileAtPath"]>): ParsedEnum[] {
  const result: ParsedEnum[] = [];

  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const initializer = varDecl.getInitializer();
    if (!initializer || !Node.isCallExpression(initializer)) continue;

    const fnName = getCallExpressionName(initializer);
    if (fnName !== "pgEnum") continue;

    const args = initializer.getArguments();
    if (args.length < 2) continue;

    const dbName = extractStringLiteral(args[0]);
    const valuesArg = args[1];

    let values: string[] = [];
    if (Node.isArrayLiteralExpression(valuesArg)) {
      values = valuesArg.getElements().map((e) => extractStringLiteral(e)).filter(Boolean) as string[];
    }

    if (dbName) {
      result.push({
        variableName: varDecl.getName(),
        dbName,
        values,
      });
    }
  }

  return result;
}

// ──────────────────────────────────────────────────────────────
// Table parsing
// ──────────────────────────────────────────────────────────────

function parseTableCall(
  variableName: string,
  call: CallExpression,
  enumMap: Map<string, ParsedEnum>
): ParsedTable | null {
  const args = call.getArguments();
  if (args.length < 2) return null;

  const dbName = extractStringLiteral(args[0]);
  if (!dbName) return null;

  const columnsArg = args[1];
  if (!Node.isObjectLiteralExpression(columnsArg)) return null;

  const columns = parseColumns(columnsArg, enumMap);
  const primaryKeyColumns = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);

  // Detect soft delete
  const softDeleteCol = columns.find(
    (c) =>
      c.name === "deletedAt" ||
      c.name === "deleted_at" ||
      c.name === "isDeleted" ||
      c.name === "is_deleted"
  );
  const hasSoftDelete = !!softDeleteCol;
  const softDeleteColumn = softDeleteCol?.name ?? null;

  // Searchable columns (text-like types, excluding URLs/slugs/refs/IDs)
  const NON_SEARCHABLE_PATTERNS = /(?:url|slug|token|hash|secret|password|ref|image|avatar|icon|path|key)$/i;
  const searchableColumns = columns
    .filter(
      (c) =>
        SEARCHABLE_TYPES.has(c.drizzleType) &&
        !c.isPrimaryKey &&
        !c.references &&
        !NON_SEARCHABLE_PATTERNS.test(c.name)
    )
    .map((c) => c.name);

  // Foreign key columns
  const foreignKeyColumns = columns.filter((c) => c.references !== null);

  return {
    variableName,
    dbName,
    columns,
    relations: [],
    primaryKeyColumns,
    hasSoftDelete,
    softDeleteColumn,
    searchableColumns,
    foreignKeyColumns,
  };
}

function parseColumns(
  obj: ObjectLiteralExpression,
  enumMap: Map<string, ParsedEnum>
): ParsedColumn[] {
  const columns: ParsedColumn[] = [];

  for (const prop of obj.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) continue;

    const name = prop.getName();
    const initializer = prop.getInitializer();
    if (!initializer) continue;

    const column = parseColumnExpression(name, initializer, enumMap);
    if (column) {
      columns.push(column);
    }
  }

  return columns;
}

function parseColumnExpression(
  propertyName: string,
  expr: Node,
  enumMap: Map<string, ParsedEnum>
): ParsedColumn | null {
  const rawChain = expr.getText();

  // Walk the chain to collect all calls
  const calls = collectCallChain(expr);
  if (calls.length === 0) return null;

  // The first call in the chain is the type function: varchar('name', { length: 255 })
  const rootCall = calls[0];
  const drizzleType = rootCall.name;
  const dbName = rootCall.firstStringArg ?? propertyName;

  // Detect enum columns
  let enumValues: string[] | null = null;
  let enumName: string | null = null;
  let resolvedType = drizzleType;

  // Check if this is an enum reference (e.g., roleEnum('role'))
  if (enumMap.has(drizzleType)) {
    const enumDef = enumMap.get(drizzleType)!;
    enumValues = enumDef.values;
    enumName = enumDef.variableName;
    resolvedType = "pgEnum";
  }

  // Extract max length from options: varchar('name', { length: 255 })
  let maxLength: number | null = null;
  if (rootCall.optionsText) {
    const lengthMatch = rootCall.optionsText.match(/length\s*:\s*(\d+)/);
    if (lengthMatch) {
      maxLength = parseInt(lengthMatch[1], 10);
    }
  }

  // Walk modifier calls
  let isPrimaryKey = false;
  let isNotNull = false;
  let isUnique = false;
  let hasDefault = false;
  let defaultExpression: string | null = null;
  let references: ForeignKeyRef | null = null;
  let isArray = false;

  for (const c of calls.slice(1)) {
    switch (c.name) {
      case "primaryKey":
        isPrimaryKey = true;
        isNotNull = true; // PK implies NOT NULL
        break;
      case "notNull":
        isNotNull = true;
        break;
      case "unique":
        isUnique = true;
        break;
      case "default":
        hasDefault = true;
        defaultExpression = c.firstStringArg ?? c.rawArgs;
        break;
      case "defaultNow":
        hasDefault = true;
        defaultExpression = "now()";
        break;
      case "$default":
      case "$defaultFn":
        hasDefault = true;
        defaultExpression = "$defaultFn";
        break;
      case "references":
        references = parseReferencesArg(c.rawArgs);
        break;
      case "array":
        isArray = true;
        break;
    }
  }

  const isAutoGenerated = AUTO_GENERATED_TYPES.has(drizzleType) || isPrimaryKey && hasDefault;
  const isTimestamp = TIMESTAMP_TYPES.has(drizzleType);
  const tsType = isArray
    ? `${DRIZZLE_TYPE_MAP[resolvedType] ?? "unknown"}[]`
    : DRIZZLE_TYPE_MAP[resolvedType] ?? "unknown";

  // Serial types are always PK + auto-generated + not null
  if (AUTO_GENERATED_TYPES.has(drizzleType)) {
    isPrimaryKey = isPrimaryKey || rawChain.includes("primaryKey");
    isNotNull = true;
    hasDefault = true;
  }

  return {
    name: propertyName,
    dbName,
    drizzleType: resolvedType === "pgEnum" ? "pgEnum" : drizzleType,
    tsType,
    isPrimaryKey,
    isNotNull,
    isUnique,
    hasDefault,
    defaultExpression,
    references,
    enumValues,
    enumName,
    maxLength,
    isArray,
    isAutoGenerated: isAutoGenerated || AUTO_GENERATED_TYPES.has(drizzleType),
    isTimestamp,
    rawChain,
  };
}

// ──────────────────────────────────────────────────────────────
// Relation parsing
// ──────────────────────────────────────────────────────────────

function parseRelationsCall(call: CallExpression, tableMap: Map<string, ParsedTable>): void {
  const args = call.getArguments();
  if (args.length < 2) return;

  // First arg is the table reference
  const tableRef = args[0].getText().trim();
  const table = tableMap.get(tableRef);
  if (!table) return;

  // Second arg is a function returning an object of relations
  const fnArg = args[1];
  // Find the object literal returned by the arrow function
  const objectLiterals = fnArg.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);
  if (objectLiterals.length === 0) return;

  // The last object literal is typically the return value
  const relationsObj = objectLiterals[objectLiterals.length - 1];

  for (const prop of relationsObj.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) continue;

    const relationName = prop.getName();
    const init = prop.getInitializer();
    if (!init || !Node.isCallExpression(init)) continue;

    const fnName = getCallExpressionName(init);
    if (fnName !== "one" && fnName !== "many") continue;

    const relArgs = init.getArguments();
    if (relArgs.length === 0) continue;

    const referencedTable = relArgs[0].getText().trim();

    // Parse fields/references from the options object
    let fields: string[] = [];
    let references: string[] = [];

    if (relArgs.length >= 2 && Node.isObjectLiteralExpression(relArgs[1])) {
      const opts = relArgs[1] as ObjectLiteralExpression;
      for (const optProp of opts.getProperties()) {
        if (!Node.isPropertyAssignment(optProp)) continue;
        const optName = optProp.getName();
        const optInit = optProp.getInitializer();
        if (!optInit) continue;

        if (optName === "fields" && Node.isArrayLiteralExpression(optInit)) {
          fields = optInit.getElements().map((e) => {
            const text = e.getText().trim();
            // Extract column name from "tableName.columnName"
            const dotIdx = text.lastIndexOf(".");
            return dotIdx >= 0 ? text.slice(dotIdx + 1) : text;
          });
        }
        if (optName === "references" && Node.isArrayLiteralExpression(optInit)) {
          references = optInit.getElements().map((e) => {
            const text = e.getText().trim();
            const dotIdx = text.lastIndexOf(".");
            return dotIdx >= 0 ? text.slice(dotIdx + 1) : text;
          });
        }
      }
    }

    table.relations.push({
      name: relationName,
      type: fnName as "one" | "many",
      referencedTable,
      fields,
      references,
    });
  }
}

// ──────────────────────────────────────────────────────────────
// AST helpers
// ──────────────────────────────────────────────────────────────

interface ChainedCall {
  name: string;
  firstStringArg: string | null;
  rawArgs: string;
  optionsText: string | null;
}

/** Collect all method calls in a chain expression: foo('a').bar().baz('b') */
function collectCallChain(node: Node): ChainedCall[] {
  const calls: ChainedCall[] = [];
  collectCallChainRecursive(node, calls);
  return calls;
}

function collectCallChainRecursive(node: Node, calls: ChainedCall[]): void {
  if (Node.isCallExpression(node)) {
    const expr = node.getExpression();
    const args = node.getArguments();
    const rawArgs = args.map((a) => a.getText()).join(", ");

    if (Node.isPropertyAccessExpression(expr)) {
      // Recurse into the left side first
      collectCallChainRecursive(expr.getExpression(), calls);

      const methodName = expr.getName();
      const firstStr = args.length > 0 ? extractStringLiteral(args[0]) : null;

      // Check for options object (second argument)
      let optionsText: string | null = null;
      if (args.length >= 2 && Node.isObjectLiteralExpression(args[1])) {
        optionsText = args[1].getText();
      }

      calls.push({
        name: methodName,
        firstStringArg: firstStr,
        rawArgs,
        optionsText,
      });
    } else if (Node.isIdentifier(expr)) {
      // Root function call: varchar('name', { length: 255 })
      const fnName = expr.getText();
      const firstStr = args.length > 0 ? extractStringLiteral(args[0]) : null;

      let optionsText: string | null = null;
      if (args.length >= 2 && Node.isObjectLiteralExpression(args[1])) {
        optionsText = args[1].getText();
      }

      calls.push({
        name: fnName,
        firstStringArg: firstStr,
        rawArgs,
        optionsText,
      });
    }
  } else if (Node.isPropertyAccessExpression(node)) {
    // Handle property access without call: foo.bar (unlikely but possible)
    collectCallChainRecursive(node.getExpression(), calls);
  }
}

function getCallExpressionName(call: CallExpression): string | null {
  const expr = call.getExpression();
  if (Node.isIdentifier(expr)) return expr.getText();
  if (Node.isPropertyAccessExpression(expr)) return expr.getName();
  return null;
}

function extractStringLiteral(node: Node): string | null {
  if (Node.isStringLiteral(node)) return node.getLiteralValue();
  if (Node.isNoSubstitutionTemplateLiteral(node)) return node.getLiteralValue();
  return null;
}

/** Parse a references() argument like: `() => users.id` */
function parseReferencesArg(rawArgs: string): ForeignKeyRef | null {
  // Match patterns like: () => users.id  or  () => table.column
  const match = rawArgs.match(/=>\s*(\w+)\.(\w+)/);
  if (match) {
    return { table: match[1], column: match[2] };
  }
  return null;
}
