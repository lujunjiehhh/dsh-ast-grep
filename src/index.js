import { readFileSync } from 'node:fs'

import { parse as parseYaml } from 'yaml'

import angular from '@ast-grep/lang-angular'
import bash from '@ast-grep/lang-bash'
import bicep from '@ast-grep/lang-bicep'
import c from '@ast-grep/lang-c'
import cpp from '@ast-grep/lang-cpp'
import csharp from '@ast-grep/lang-csharp'
import dart from '@ast-grep/lang-dart'
import elixir from '@ast-grep/lang-elixir'
import glimmerJavaScript from '@ast-grep/lang-glimmer-javascript'
import glimmerTypeScript from '@ast-grep/lang-glimmer-typescript'
import go from '@ast-grep/lang-go'
import haskell from '@ast-grep/lang-haskell'
import java from '@ast-grep/lang-java'
import json from '@ast-grep/lang-json'
import kotlin from '@ast-grep/lang-kotlin'
import lua from '@ast-grep/lang-lua'
import markdown from '@ast-grep/lang-markdown'
import php from '@ast-grep/lang-php'
import python from '@ast-grep/lang-python'
import ruby from '@ast-grep/lang-ruby'
import rust from '@ast-grep/lang-rust'
import scala from '@ast-grep/lang-scala'
import sql from '@ast-grep/lang-sql'
import swift from '@ast-grep/lang-swift'
import toml from '@ast-grep/lang-toml'
import yaml from '@ast-grep/lang-yaml'
import { Lang, parse, registerDynamicLanguage } from '@ast-grep/napi'

export const name = 'ast-grep-tool'
export const inject = ['tools']

const DYNAMIC_LANGUAGES = Object.freeze({
  angular,
  bash,
  bicep,
  c,
  cpp,
  csharp,
  dart,
  elixir,
  'glimmer-javascript': glimmerJavaScript,
  'glimmer-typescript': glimmerTypeScript,
  go,
  haskell,
  java,
  json,
  kotlin,
  lua,
  markdown,
  php,
  python,
  ruby,
  rust,
  scala,
  sql,
  swift,
  toml,
  yaml,
})

const REGISTRATION_KEY = Symbol.for('dsh-ast-grep.dynamic-languages.v1')
if (!globalThis[REGISTRATION_KEY]) {
  registerDynamicLanguage(DYNAMIC_LANGUAGES)
  globalThis[REGISTRATION_KEY] = true
}

const LANGUAGES = Object.freeze({
  ...Object.fromEntries(Object.keys(DYNAMIC_LANGUAGES).map((language) => [language, language])),
  css: Lang.Css,
  html: Lang.Html,
  javascript: Lang.JavaScript,
  jsx: Lang.JavaScript,
  tsx: Lang.Tsx,
  typescript: Lang.TypeScript,
})

const SUPPORTED_LANGUAGES = Object.freeze(Object.keys(LANGUAGES))

const MAX_SOURCE_CHARS = 2_000_000
const DEFAULT_MAX_MATCHES = 50
const MAX_MATCHES = 200
const DEFAULT_MAX_MATCH_CHARS = 2_000
const MAX_MATCH_CHARS = 20_000
const DEFAULT_MAX_TREE_NODES = 500
const MAX_TREE_NODES = 5_000
const DEFAULT_MAX_TREE_DEPTH = 30
const MAX_TREE_DEPTH = 100
const MAX_RULE_YAML_CHARS = 200_000

const HELP_SOURCE = Object.freeze({
  url: 'https://github.com/ast-grep/ast-grep-mcp/blob/main/ast-grep.mdc',
  commit: 'b69eb5391bd93d46ef3dec07de814c3c39675c8f',
  license: 'MIT',
})
const HELP_DOCUMENT = readFileSync(new URL('../docs/ast-grep.mdc', import.meta.url), 'utf8')
const HELP_TOPICS = Object.freeze({
  workflow: ['## General Process', '## Tips for Writing Rules', '## Rule Development Process'],
  'rule-object': [
    '## 1. Introduction to ast-grep Rules',
    '## 2. Anatomy of an ast-grep Rule Object',
  ],
  atomic: ['## 3. Atomic Rules: Fundamental Matching Building Blocks'],
  relational: ['## 4. Relational Rules: Contextual and Hierarchical Matching'],
  composite: ['## 5. Composite Rules: Logical Combination of Conditions'],
  metavariables: ['## 6. Metavariables: Dynamic Content Matching'],
  full: [],
})

function markdownSection(markdown, heading) {
  const lines = markdown.split(/\r?\n/)
  const start = lines.indexOf(heading)
  if (start < 0) throw new Error(`help section not found: ${heading}`)
  const level = heading.match(/^#+/)[0].length
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#+) /)
    if (match && match[1].length <= level) {
      end = index
      break
    }
  }
  return lines.slice(start, end).join('\n').trim()
}

function help(args = {}) {
  const topic = args.topic ?? 'workflow'
  if (!(topic in HELP_TOPICS)) throw new Error(`unsupported help topic ${JSON.stringify(topic)}`)
  const markdown = topic === 'full'
    ? HELP_DOCUMENT.trim()
    : HELP_TOPICS[topic].map((heading) => markdownSection(HELP_DOCUMENT, heading)).join('\n\n')
  return { topic, source: HELP_SOURCE, markdown }
}

function integer(value, fallback, min, max, name) {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} through ${max}`)
  }
  return value
}

function sourceAndLanguage(args, sourceKey = 'source') {
  const source = args[sourceKey]
  if (typeof source !== 'string' || source.length === 0) {
    throw new Error(`${sourceKey} must be a non-empty string`)
  }
  if (source.length > MAX_SOURCE_CHARS) {
    throw new Error(`${sourceKey} exceeds the ${MAX_SOURCE_CHARS}-character limit`)
  }
  const language = String(args.language ?? '').toLowerCase()
  if (!(language in LANGUAGES)) {
    throw new Error(`unsupported language ${JSON.stringify(args.language)}`)
  }
  return { source, language }
}

function position(pos) {
  return { line: pos.line + 1, column: pos.column + 1, byteOffset: pos.index }
}

function debugPosition(pos) {
  return `(${pos.line},${pos.column})`
}

function dumpTree(args) {
  const { source, language } = sourceAndLanguage(args, 'code')
  const format = args.format ?? 'cst'
  if (!['pattern', 'ast', 'cst'].includes(format)) {
    throw new Error('format must be pattern, ast, or cst')
  }
  const maxNodes = integer(args.max_nodes, DEFAULT_MAX_TREE_NODES, 1, MAX_TREE_NODES, 'max_nodes')
  const maxDepth = integer(args.max_depth, DEFAULT_MAX_TREE_DEPTH, 1, MAX_TREE_DEPTH, 'max_depth')
  const root = parse(LANGUAGES[language], source).root()
  const namedOnly = format === 'ast'
  const lines = [`Debug ${format.toUpperCase()}:`]
  let count = 0
  let truncated = false
  const visit = (node, depth) => {
    if (count >= maxNodes || depth > maxDepth) {
      truncated = true
      return
    }
    count += 1
    const value = node.range()
    const label = format === 'pattern'
      ? `${node.kind()} ${node.text()}`.trimEnd()
      : `${node.kind()} ${debugPosition(value.start)}-${debugPosition(value.end)}`
    lines.push(`${'  '.repeat(depth)}${label}`)
    const children = namedOnly ? node.namedChildren() : node.children()
    for (const child of children) visit(child, depth + 1)
  }
  visit(root, 0)
  if (truncated) lines.push(`... truncated after ${count} nodes at depth ${maxDepth}`)
  return lines.join('\n')
}

function parseRuleYaml(yaml) {
  if (typeof yaml !== 'string' || yaml.length === 0) throw new Error('yaml must be a non-empty string')
  if (yaml.length > MAX_RULE_YAML_CHARS) throw new Error(`yaml exceeds the ${MAX_RULE_YAML_CHARS}-character limit`)
  let config
  try {
    config = parseYaml(yaml)
  } catch (error) {
    throw new Error(`invalid rule YAML: ${error.message}`)
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('rule YAML must be an object')
  if (typeof config.id !== 'string' || !config.id) throw new Error('rule YAML must have a non-empty id')
  if (typeof config.language !== 'string' || !(config.language.toLowerCase() in LANGUAGES)) {
    throw new Error(`unsupported language ${JSON.stringify(config.language)}`)
  }
  if (!config.rule || typeof config.rule !== 'object' || Array.isArray(config.rule)) {
    throw new Error('rule YAML must have a rule object')
  }
  return { ...config, language: config.language.toLowerCase() }
}

function cliRange(node) {
  const value = node.range()
  return {
    byteOffset: { start: value.start.index, end: value.end.index },
    start: { line: value.start.line, column: value.start.column },
    end: { line: value.end.line, column: value.end.column },
  }
}

function metavariableNames(value, names = new Set()) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/\$+(?!_)([A-Z][A-Z0-9_]*)/g)) names.add(match[1])
  } else if (Array.isArray(value)) {
    for (const item of value) metavariableNames(item, names)
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) metavariableNames(item, names)
  }
  return names
}

function testRule(args) {
  if (typeof args.code !== 'string' || args.code.length === 0) throw new Error('code must be a non-empty string')
  if (args.code.length > MAX_SOURCE_CHARS) throw new Error(`code exceeds the ${MAX_SOURCE_CHARS}-character limit`)
  const config = parseRuleYaml(args.yaml)
  const matcher = { rule: config.rule, constraints: config.constraints, utils: config.utils }
  const nodes = parse(LANGUAGES[config.language], args.code).root().findAll(matcher)
  if (nodes.length === 0) {
    throw new Error('No matches found for the given code and rule. Try adding `stopBy: end` to your inside/has rule.')
  }
  const names = [...metavariableNames(matcher)]
  return nodes.map((node) => ({
    text: node.text(),
    range: cliRange(node),
    file: 'STDIN',
    language: config.language,
    metaVariables: {
      single: Object.fromEntries(names.flatMap((name) => {
        const value = node.getMatch(name)
        return value ? [[name, { text: value.text(), range: cliRange(value) }]] : []
      })),
      multi: Object.fromEntries(names.flatMap((name) => {
        const values = node.getMultipleMatches(name)
        return values.length > 1
          ? [[name, values.map((value) => ({ text: value.text(), range: cliRange(value) }))]]
          : []
      })),
      transformed: {},
    },
    ruleId: config.id,
    severity: config.severity ?? 'hint',
    note: config.note ?? null,
    message: config.message ?? '',
  }))
}

function range(node) {
  const value = node.range()
  return { start: position(value.start), end: position(value.end) }
}

function clippedText(text, limit) {
  if (text.length <= limit) return { text, truncated: false }
  return { text: text.slice(0, limit), truncated: true }
}

function capture(node, name, limit) {
  const many = node.getMultipleMatches(name)
  const values = many.length > 0 ? many : [node.getMatch(name)].filter(Boolean)
  return values.map((value) => ({
    ...clippedText(value.text(), limit),
    kind: value.kind(),
    range: range(value),
  }))
}

function normalizeArgs(args) {
  const { source, language } = sourceAndLanguage(args)
  if (typeof args.pattern !== 'string' || args.pattern.length === 0) {
    throw new Error('pattern must be a non-empty string')
  }
  const captureNames = args.capture_names ?? []
  if (!Array.isArray(captureNames) || captureNames.length > 20) {
    throw new Error('capture_names must be an array with at most 20 entries')
  }
  const uniqueCaptureNames = [...new Set(captureNames)]
  for (const captureName of uniqueCaptureNames) {
    if (typeof captureName !== 'string' || !/^[A-Z_][A-Z0-9_]*$/.test(captureName)) {
      throw new Error('capture_names entries must omit $ and use uppercase metavariable names')
    }
  }
  return {
    source,
    pattern: args.pattern,
    language,
    captureNames: uniqueCaptureNames,
    maxMatches: integer(args.max_matches, DEFAULT_MAX_MATCHES, 1, MAX_MATCHES, 'max_matches'),
    maxMatchChars: integer(
      args.max_match_chars,
      DEFAULT_MAX_MATCH_CHARS,
      1,
      MAX_MATCH_CHARS,
      'max_match_chars',
    ),
  }
}

function search(args) {
  const input = normalizeArgs(args)
  const root = parse(LANGUAGES[input.language], input.source).root()
  const found = root.findAll(input.pattern)
  const selected = found.slice(0, input.maxMatches)
  return {
    language: input.language,
    count: found.length,
    truncated: found.length > selected.length,
    matches: selected.map((node) => ({
      ...clippedText(node.text(), input.maxMatchChars),
      kind: node.kind(),
      range: range(node),
      captures: Object.fromEntries(
        input.captureNames.map((captureName) => [
          captureName,
          capture(node, captureName, input.maxMatchChars),
        ]),
      ),
    })),
  }
}

export function apply(ctx) {
  ctx.tools.register({
    name: 'dump_syntax_tree',
    description:
      'Dump code syntax structure or pattern structure using the same parser as ast_grep_search. ' +
      'Use cst for concrete syntax, ast for named nodes, and pattern to inspect pattern parsing.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        code: { type: 'string', description: 'Code or pattern text to inspect.' },
        language: { type: 'string', enum: SUPPORTED_LANGUAGES },
        format: { type: 'string', enum: ['pattern', 'ast', 'cst'], description: 'Defaults to cst.' },
        max_nodes: { type: 'integer', minimum: 1, maximum: MAX_TREE_NODES },
        max_depth: { type: 'integer', minimum: 1, maximum: MAX_TREE_DEPTH },
      },
      required: ['code', 'language'],
    },
    output: {
      schema: { type: 'string', description: 'Bounded syntax tree dump.' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => dumpTree(args ?? {}),
  })

  ctx.tools.register({
    name: 'test_match_code_rule',
    description:
      'Test an ast-grep YAML rule against an inline code snippet using @ast-grep/napi. ' +
      'The YAML must contain id, language, and rule fields.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        code: { type: 'string', description: 'Code to test.' },
        yaml: { type: 'string', description: 'ast-grep YAML rule with id, language, and rule fields.' },
      },
      required: ['code', 'yaml'],
    },
    output: {
      schema: { type: 'array', description: 'Matches in ast-grep CLI-compatible zero-based ranges.' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute: async (args) => testRule(args ?? {}),
  })

  ctx.tools.register({
    name: 'ast_grep_help',
    description:
      'Return on-demand ast-grep rule guidance vendored from ast-grep-mcp. ' +
      'Use the narrowest topic before writing complex rules or when a pattern does not match.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        topic: {
          type: 'string',
          enum: Object.keys(HELP_TOPICS),
          description:
            'Guidance topic. Defaults to workflow; use full only when all rule documentation is needed.',
        },
      },
    },
    output: {
      schema: { type: 'object', description: 'Selected Markdown guidance and upstream provenance.' },
      render: (_args, value) => [{ type: 'text', text: value.markdown }],
    },
    execute: async (args) => help(args ?? {}),
  })

  ctx.tools.register({
    name: 'ast_grep_search',
    description:
      'Parse inline source with @ast-grep/napi and return every AST node matching an ast-grep pattern. ' +
      'Use metavariables such as $EXPR and $$$ARGS. Lines and columns are 1-based; byteOffset is 0-based. ' +
      'Set capture_names to metavariable names without the $ prefix when captured nodes are needed. ' +
      'Call ast_grep_help with the narrowest relevant topic before writing complex rules or debugging a failed pattern.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        source: { type: 'string', description: 'Source text to parse.' },
        pattern: { type: 'string', description: 'ast-grep pattern, for example $FN($$$ARGS).' },
        language: {
          type: 'string',
          enum: SUPPORTED_LANGUAGES,
          description: 'Parser language. jsx is an alias of javascript; other names select official dynamic parsers.',
        },
        capture_names: {
          type: 'array',
          maxItems: 20,
          items: { type: 'string' },
          description: 'Optional uppercase metavariable names without $, for example ["FN", "ARGS"].',
        },
        max_matches: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_MATCHES,
          description: 'Maximum returned matches; defaults to 50. The total count is still reported.',
        },
        max_match_chars: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_MATCH_CHARS,
          description: 'Maximum text returned per match or capture; defaults to 2000.',
        },
      },
      required: ['source', 'pattern', 'language'],
    },
    output: {
      schema: { type: 'object', description: 'Structured ast-grep match results.' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute: async (args) => search(args ?? {}),
  })
}

export { dumpTree, help, search, testRule }
