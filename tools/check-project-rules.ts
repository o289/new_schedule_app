import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const projectRoot = process.cwd();
const sourceRoots = ["apps", "packages", "e2e", "tools"];
const sourceExtensions = [".ts", ".tsx"];
const ignoredDirectories = new Set(["node_modules", "dist"]);

interface RuleViolation {
  file: string;
  line: number;
  message: string;
}

function collectSourceFiles(directory: string): string[] {
  const absoluteDirectory = resolve(projectRoot, directory);
  const files: string[] = [];

  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const path = join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(relative(projectRoot, path)));
    } else if (sourceExtensions.some((extension) => path.endsWith(extension))) {
      files.push(path);
    }
  }

  return files;
}

function normalized(path: string): string {
  return path.split(sep).join("/");
}

function resolveRelativeImport(file: string, specifier: string): string {
  return normalized(relative(projectRoot, resolve(dirname(file), specifier)));
}

function isLocalRelativeImport(specifier: string): boolean {
  return (
    specifier.startsWith("./") ||
    (specifier.startsWith("../") && !specifier.startsWith("../../"))
  );
}

function moduleScope(path: string, app: "frontend" | "backend"): string {
  const prefix = `apps/${app}/`;
  const segments = path.slice(prefix.length).split("/");
  if (segments.length === 1) return "root";
  if (segments[0] === "components" || segments[0] === "features") {
    return `${segments[0]}/${segments[1] ?? ""}`;
  }
  return segments[0] ?? "";
}

function importBoundaryViolation(
  sourceFile: string,
  specifier: string,
): string | undefined {
  if (isAbsolute(specifier)) return "OS上の絶対パスをimportに使用できません";

  const file = normalized(relative(projectRoot, sourceFile));
  const target = specifier.startsWith(".")
    ? resolveRelativeImport(sourceFile, specifier)
    : specifier;

  if (file.startsWith("packages/") && target.startsWith("apps/")) {
    return "packagesからappsをimportできません";
  }
  if (
    specifier.startsWith(".") &&
    !isLocalRelativeImport(specifier) &&
    file.startsWith("packages/") &&
    target.startsWith("packages/") &&
    file.split("/")[1] !== target.split("/")[1]
  ) {
    return "packages間の参照にはpackage.json#importsのaliasを使用してください";
  }
  if (
    file.startsWith("apps/frontend/") &&
    (target.startsWith("apps/backend/") || target.startsWith("#backend/"))
  ) {
    return "frontendからbackendをimportできません";
  }
  if (
    file.startsWith("apps/backend/") &&
    (target.startsWith("apps/frontend/") || target.startsWith("#frontend/"))
  ) {
    return "backendからfrontendをimportできません";
  }
  if (
    specifier.startsWith(".") &&
    !isLocalRelativeImport(specifier) &&
    file.startsWith("apps/frontend/") &&
    target.startsWith("packages/")
  ) {
    return "frontendからpackagesへの参照にはaliasを使用してください";
  }
  if (
    specifier.startsWith(".") &&
    !isLocalRelativeImport(specifier) &&
    file.startsWith("apps/backend/") &&
    target.startsWith("packages/")
  ) {
    return "backendからpackagesへの参照にはaliasを使用してください";
  }
  if (
    specifier.startsWith(".") &&
    !isLocalRelativeImport(specifier) &&
    file.startsWith("apps/frontend/") &&
    target.startsWith("apps/frontend/") &&
    !target.startsWith("apps/frontend/assets/") &&
    moduleScope(file, "frontend") !== moduleScope(target, "frontend")
  ) {
    return "frontendの別feature・共通層への参照には#frontend aliasを使用してください";
  }
  if (
    specifier.startsWith(".") &&
    !isLocalRelativeImport(specifier) &&
    file.startsWith("apps/backend/") &&
    target.startsWith("apps/backend/") &&
    moduleScope(file, "backend") !== moduleScope(target, "backend")
  ) {
    return "backendの別feature・共通層への参照には#backend aliasを使用してください";
  }

  return undefined;
}

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function inspectSourceFile(file: string): RuleViolation[] {
  const text = readFileSync(file, "utf8");
  const relativeFile = normalized(relative(projectRoot, file));
  const violations: RuleViolation[] = [];
  const report = (index: number, message: string) =>
    violations.push({
      file: relativeFile,
      line: lineNumberAt(text, index),
      message,
    });

  const explicitAnyPatterns = [
    /:\s*any\b/g,
    /\bas\s+any\b/g,
    /<\s*any(?:\s*[,>])/g,
    /\bany\s*\[\s*\]/g,
  ];
  for (const pattern of explicitAnyPatterns) {
    for (const match of text.matchAll(pattern)) {
      report(match.index, "明示的なany型は使用できません");
    }
  }

  const importPattern =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g;
  for (const match of text.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier) continue;
    const message = importBoundaryViolation(file, specifier);
    if (message) report(match.index, message);
  }

  return violations;
}

function inspectTsconfigPaths(): RuleViolation[] {
  return readdirSync(projectRoot)
    .filter((file) => file.startsWith("tsconfig") && file.endsWith(".json"))
    .flatMap((file) =>
      /"paths"\s*:/.test(readFileSync(join(projectRoot, file), "utf8"))
        ? [
            {
              file,
              line: 1,
              message:
                "aliasはpackage.json#importsで定義し、tsconfigのpathsは使用できません",
            },
          ]
        : [],
    );
}

const violations = [
  ...sourceRoots.flatMap(collectSourceFiles).flatMap(inspectSourceFile),
  ...inspectTsconfigPaths(),
];

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line} ${violation.message}`);
  }
  process.exit(1);
}

console.log("Project rules OK");
