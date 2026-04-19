// ──────────────────────────────────────────────────────────────
// Name conversion utilities for code generation
// ──────────────────────────────────────────────────────────────

const IRREGULAR_PLURALS: Record<string, string> = {
  person: "people",
  child: "children",
  mouse: "mice",
  goose: "geese",
  ox: "oxen",
  leaf: "leaves",
  life: "lives",
  knife: "knives",
  wife: "wives",
  half: "halves",
  self: "selves",
  calf: "calves",
  loaf: "loaves",
  potato: "potatoes",
  tomato: "tomatoes",
  cactus: "cacti",
  focus: "foci",
  fungus: "fungi",
  nucleus: "nuclei",
  syllabus: "syllabi",
  analysis: "analyses",
  basis: "bases",
  crisis: "crises",
  diagnosis: "diagnoses",
  thesis: "theses",
  datum: "data",
  medium: "media",
  criterion: "criteria",
  phenomenon: "phenomena",
};

const IRREGULAR_SINGULARS: Record<string, string> = Object.fromEntries(
  Object.entries(IRREGULAR_PLURALS).map(([s, p]) => [p, s])
);

/** Convert snake_case or kebab-case to camelCase */
export function toCamelCase(str: string): string {
  return str
    .replace(/[-_](\w)/g, (_, c: string) => c.toUpperCase())
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

/** Convert to PascalCase */
export function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/** Convert camelCase/PascalCase to snake_case */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "")
    .replace(/-/g, "_");
}

/** Convert to kebab-case */
export function toKebabCase(str: string): string {
  return toSnakeCase(str).replace(/_/g, "-");
}

// Words ending in "se" that just add "s" to pluralize (not "ses" -> strip "es")
const SE_WORDS = new Set([
  "lease", "case", "base", "phase", "purchase", "response", "course",
  "horse", "house", "mouse", "goose", "purpose", "expense", "license",
  "release", "database", "relse", "promise", "practise", "exercise",
  "browse", "abuse", "advise", "arise", "cause", "close", "compose",
  "dose", "expose", "noise", "nurse", "pause", "phrase", "praise",
  "pulse", "rinse", "sense", "verse",
]);

/** Naive singularize */
export function singularize(word: string): string {
  const lower = word.toLowerCase();
  if (IRREGULAR_SINGULARS[lower]) {
    return matchCase(word, IRREGULAR_SINGULARS[lower]);
  }
  if (lower.endsWith("ies") && lower.length > 4) {
    return word.slice(0, -3) + "y";
  }
  // "leases" -> "lease", not "leas"; check if removing just "s" yields a known -se word
  if (lower.endsWith("ses")) {
    const candidate = lower.slice(0, -1);
    if (SE_WORDS.has(candidate)) {
      return word.slice(0, -1);
    }
    return word.slice(0, -2);
  }
  if (lower.endsWith("xes") || lower.endsWith("zes") || lower.endsWith("ches") || lower.endsWith("shes")) {
    return word.slice(0, -2);
  }
  if (lower.endsWith("s") && !lower.endsWith("ss") && !lower.endsWith("us") && !lower.endsWith("is")) {
    return word.slice(0, -1);
  }
  return word;
}

/** Naive pluralize */
export function pluralize(word: string): string {
  const lower = word.toLowerCase();
  if (IRREGULAR_PLURALS[lower]) {
    return matchCase(word, IRREGULAR_PLURALS[lower]);
  }
  if (lower.endsWith("s") || lower.endsWith("x") || lower.endsWith("z") || lower.endsWith("ch") || lower.endsWith("sh")) {
    return word + "es";
  }
  if (lower.endsWith("y") && !isVowel(lower.charAt(lower.length - 2))) {
    return word.slice(0, -1) + "ies";
  }
  return word + "s";
}

function isVowel(c: string): boolean {
  return "aeiou".includes(c.toLowerCase());
}

function matchCase(source: string, target: string): string {
  if (source[0] === source[0].toUpperCase()) {
    return target.charAt(0).toUpperCase() + target.slice(1);
  }
  return target;
}

/**
 * Build all naming variants for a table.
 * Input: Drizzle variable name (e.g., "users", "orderItems", "user_profiles")
 */
export function buildNames(variableName: string) {
  // Normalize to camelCase first
  const camel = toCamelCase(variableName);
  const singular = singularize(camel);
  const plural = camel === singular ? pluralize(singular) : camel;

  return {
    singular,
    plural,
    pascalSingular: toPascalCase(singular),
    pascalPlural: toPascalCase(plural),
    camelSingular: singular,
    camelPlural: plural,
    moduleName: toKebabCase(plural),
    fileName: toKebabCase(singular),
  };
}
