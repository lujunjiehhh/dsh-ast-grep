# dsh-ast-grep

Persistent [ast-grep](https://ast-grep.github.io/) structural-search tools for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/DeepSeek-Harness).

The plugin runs directly on `@ast-grep/napi`; it does not spawn the ast-grep CLI. It bundles the official `@ast-grep/lang-*` parsers and exposes 32 language identifiers.

## Tools

- `ast_grep_search` — match an ast-grep pattern against inline source and return structured matches and captures.
- `ast_grep_help` — retrieve focused rule-writing guidance on demand.
- `dump_syntax_tree` — inspect bounded CST, AST, or pattern structure.
- `test_match_code_rule` — test an ast-grep YAML rule against inline code.

## Install

Requirements: Node.js `^22.19.0 || >=24.0.0` and DSH. Install the published npm package in one command:

```bash
dsh plugin --profile web add dsh-ast-grep --ignore-scripts
```

Use the profile name that launches your DSH process if it is not `web`. For example, the Desktop profile may be named `web.backup`. `--ignore-scripts` is intentional: the official language packages already include prebuilt parsers, so no dependency build scripts are needed.

The package is published at [npmjs.com/package/dsh-ast-grep](https://www.npmjs.com/package/dsh-ast-grep). To work on the plugin itself, clone the repository and run `pnpm install --ignore-scripts && pnpm check`.

## Examples

### Structural pattern search

```ts
await tools.ast_grep_search({
  source: 'const value = load(42)',
  pattern: '$FN($$$ARGS)',
  language: 'typescript',
  capture_names: ['FN', 'ARGS'],
})
```

### Contextual patterns

Some grammars need context to disambiguate a pattern. For example, match a Markdown heading rather than only its `#` marker:

```ts
await tools.ast_grep_search({
  source: '# Title\n',
  pattern: { context: '# $TITLE\n', selector: 'atx_heading' },
  language: 'markdown',
  capture_names: ['TITLE'],
})
```

Contextual patterns accept `context`, optional `selector`, and optional `strictness`.

### Inspect syntax

```ts
await tools.dump_syntax_tree({
  code: 'foo(bar)',
  language: 'javascript',
  format: 'cst',
})
```

### Test a YAML rule

```ts
await tools.test_match_code_rule({
  code: 'async function run() { await work() }',
  yaml: `id: await-in-function
language: javascript
rule:
  pattern: await $EXPR
  inside:
    kind: function_declaration
    stopBy: end`,
})
```

For relational rules, `stopBy: end` is usually required for complete traversal.

## Supported language identifiers

`angular`, `bash`, `bicep`, `c`, `cpp`, `csharp`, `css`, `dart`, `elixir`, `glimmer-javascript`, `glimmer-typescript`, `go`, `haskell`, `html`, `java`, `javascript`, `json`, `jsx`, `kotlin`, `lua`, `markdown`, `php`, `python`, `ruby`, `rust`, `scala`, `sql`, `swift`, `toml`, `tsx`, `typescript`, and `yaml`.

## Limits

Inline source is limited to 2,000,000 characters. Search returns at most 200 matches per call. Syntax-tree output defaults to 500 nodes and depth 30, with maximums of 5,000 and 100. YAML rules are limited to 200,000 characters.

## Attribution

`docs/ast-grep.mdc` is vendored from [ast-grep/ast-grep-mcp](https://github.com/ast-grep/ast-grep-mcp) commit `b69eb5391bd93d46ef3dec07de814c3c39675c8f` under its MIT license. See `docs/AST_GREP_MCP_LICENSE.txt`.

## License

MIT © lujunjiehhh
