import { readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { Linter } from "eslint";
import { builtinRules } from "eslint/use-at-your-own-risk";
import tseslint from "typescript-eslint";

// Use ESLint's maintained complexity calculation, including nested functions
// as separate scopes. Zero threshold makes it report every function.
const coverage = JSON.parse(await readFile("coverage/coverage-final.json", "utf8"));
const rows = [];
for (const [file, data] of Object.entries(coverage)) {
  const functions = [];
  const rule = {
    ...builtinRules.get("complexity"),
    create(context) {
      return builtinRules.get("complexity").create(Object.create(context, {
        report: { value({ node, data: details }) {
          if (details.complexity) functions.push({ node, complexity: Number(details.complexity) });
        } },
      }));
    },
  };
  const messages = new Linter().verify(await readFile(file, "utf8"), [{
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { metrics: { rules: { complexity: rule } } },
    rules: { "metrics/complexity": ["error", { max: 0, variant: "classic" }] },
  }], { filename: relative(process.cwd(), file) });
  if (messages.length) throw new Error(JSON.stringify(messages));
  const offset = (pos) => pos.line * 1_000_000 + pos.column;
  for (const { node, complexity } of functions) {
    const start = offset(node.loc.start);
    const end = offset(node.loc.end);
    // V8's source-mapped body end can include trailing call punctuation.
    // Match the declaration in the function header, then prefer the closest
    // body start; strict containment of the body would reject valid mappings.
    const matches = Object.entries(data.fnMap).filter(([, fn]) =>
      offset(fn.decl.start) >= start && offset(fn.decl.start) <= offset(node.body.loc.start));
    matches.sort((a, b) => Math.abs(offset(a[1].loc.start) - offset(node.body.loc.start))
      - Math.abs(offset(b[1].loc.start) - offset(node.body.loc.start)));
    const match = matches[0];
    // A missed mapping is an error, never an assumption of full coverage.
    if (!match) throw new Error(`No coverage mapping: ${file}:${node.loc.start.line}`);
    const executed = data.f[match[0]] > 0;
    const lines = new Map();
    for (const [id, loc] of Object.entries(data.statementMap)) {
      const pos = offset(loc.start);
      if (pos < start || pos > end) continue;
      // Do not count statements belonging to nested functions.
      if (functions.some(({ node: child }) => child !== node &&
        offset(child.loc.start) > start && offset(child.loc.end) <= end &&
        pos >= offset(child.loc.start) && pos <= offset(child.loc.end))) continue;
      lines.set(loc.start.line, (lines.get(loc.start.line) ?? false) || data.s[id] > 0);
    }
    const fraction = lines.size ? [...lines.values()].filter(Boolean).length / lines.size : Number(executed);
    rows.push({ file: relative(process.cwd(), file), name: match[1].name,
      line: node.loc.start.line, complexity, coverage: fraction * 100,
      crap: complexity ** 2 * (1 - fraction) ** 3 + complexity });
  }
}
rows.sort((a, b) => b.crap - a.crap);
await writeFile("coverage/crap.json", JSON.stringify(rows, null, 2) + "\n");
console.table(rows.slice(0, 20).map(row => ({ ...row,
  coverage: row.coverage.toFixed(1) + "%", crap: row.crap.toFixed(2) })));
console.log(`${rows.length} functions; ${rows.filter(row => row.crap >= 30).length} with CRAP >= 30. Full report: coverage/crap.json`);
