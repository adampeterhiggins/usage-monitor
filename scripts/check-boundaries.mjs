#!/usr/bin/env node
/**
 * Enforce the source-tree ownership boundaries.
 *
 *   npm run check:boundaries
 *
 * Parses every TypeScript module with the compiler API (imports, re-exports,
 * and dynamic imports all count; type-only imports count too) and rejects
 * imports that cross an ownership line. Exit code 1 on any violation.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const SRC = resolve("src");

/** Zone for a path relative to src/ — the directory an ownership rule sees. */
function zone(rel) {
  const top = rel.split("/")[0];
  const sub = rel.split("/")[1];
  if (top === "components" && sub === "ui") return "components/ui";
  if (top === "testing") return "testing";
  return top;
}

const isTestFile = (rel) => /\.test\.tsx?$/.test(rel);

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(entry.name)) yield p;
  }
}

/** Resolve a relative specifier to a src/-relative module path, or null. */
function resolveSpec(importer, spec) {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(importer), spec);
  for (const ext of [".ts", ".tsx", ".d.ts"]) {
    if (existsSync(base + ext)) return relative(SRC, base + ext).replace(/\.tsx?$/, "");
  }
  for (const idx of ["/index.ts", "/index.tsx"]) {
    if (existsSync(base + idx)) return relative(SRC, base + idx).replace(/\/index\.tsx?$/, "");
  }
  return null;
}

function specifiers(file) {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const out = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        out.push(node.moduleSpecifier.text);
      }
    }
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const callee = node.expression;
      const isImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isMock =
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === "mock" &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "vi";
      if ((isImport || isMock) && ts.isStringLiteral(node.arguments[0])) {
        out.push(node.arguments[0].text);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

/**
 * Each rule: who it applies to (importer zone), and what it forbids.
 * `pkg` matches bare package specifiers; `zone` matches resolved src paths.
 */
const RULES = [
  {
    name: "production Tauri imports only in platform/",
    test: ({ importerZone, importerRel, spec }) =>
      spec.startsWith("@tauri-apps/") && importerZone !== "platform" && importerZone !== "testing",
    message: "@tauri-apps/* is confined to src/platform/",
  },
  {
    name: "contracts are leaf modules",
    test: ({ importerZone, spec, targetZone }) =>
      importerZone === "contracts" &&
      (["components", "hooks", "state", "providers", "lib", "platform", "windows"].includes(targetZone) ||
        ["react", "zustand"].includes(spec) ||
        spec.startsWith("@tanstack/") ||
        spec.startsWith("@tauri-apps/")),
    message: "contracts/ may not import implementations, React, Tauri, or state libraries",
  },
  {
    name: "lib/ and providers/ stay below the React layer",
    test: ({ importerZone, spec, targetZone }) =>
      (importerZone === "lib" || importerZone === "providers") &&
      (["components", "hooks", "state", "windows", "AppRoot.tsx"].includes(targetZone) ||
        spec === "react" ||
        spec === "react-dom" ||
        spec.startsWith("@tanstack/") ||
        spec === "zustand"),
    message: "lib/ and providers/ may not import components, hooks, state, or React/Query/Zustand",
  },
  {
    name: "state/ cannot import rendering",
    test: ({ importerZone, targetZone }) =>
      importerZone === "state" &&
      (targetZone === "components" || targetZone === "components/ui" || targetZone === "windows"),
    message: "state/ modules may not import components or windows",
  },
  {
    name: "ui primitives stay provider/account-free",
    test: ({ importerZone, targetZone }) =>
      importerZone === "components/ui" &&
      (targetZone === "providers" || targetZone === "state" ||
        targetZone === "windows" || targetZone === "components"),
    message: "components/ui primitives may not import providers, state, or feature code",
  },
  {
    name: "platform/ is leaf-native",
    test: ({ importerZone, targetZone }) =>
      importerZone === "platform" &&
      (["components", "hooks", "state", "windows"].includes(targetZone)),
    message: "platform/ may not import components, hooks, state, or windows",
  },
  {
    name: "production code may not import test/mocking modules",
    test: ({ importerRel, targetZone }) =>
      !importerRel.startsWith("testing/") &&
      !isTestFile(importerRel) &&
      targetZone === "testing",
    message: "production modules may not import testing/ fixtures or mocks",
  },
];

let violations = 0;
for (const file of walk(SRC)) {
  const importerRel = relative(SRC, file);
  const importerZone = zone(importerRel);
  for (const spec of specifiers(file)) {
    const target = resolveSpec(file, spec);
    const targetZone = target ? zone(target) : null;
    for (const rule of RULES) {
      if (rule.test({ importerRel, importerZone, spec, target, targetZone })) {
        console.log(`FAIL  ${importerRel} → ${spec}\n      ${rule.message}`);
        violations++;
      }
    }
  }
}

if (violations > 0) {
  console.log(`\n${violations} boundary violation(s).`);
  process.exit(1);
}
console.log("Boundary checks passed.");
