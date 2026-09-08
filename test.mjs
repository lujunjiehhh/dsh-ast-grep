import assert from 'node:assert/strict'
import { apply } from './src/index.js'

const definitions = new Map()
apply({ tools: { register(value) { definitions.set(value.name, value) } } })
const definition = definitions.get('ast_grep_search')
const helpDefinition = definitions.get('ast_grep_help')
const dumpDefinition = definitions.get('dump_syntax_tree')
const ruleDefinition = definitions.get('test_match_code_rule')
assert.equal(definition.name, 'ast_grep_search')
assert.equal(helpDefinition.name, 'ast_grep_help')
assert.equal(dumpDefinition.name, 'dump_syntax_tree')
assert.equal(ruleDefinition.name, 'test_match_code_rule')

const result = await definition.execute({
  source: 'const x = foo(42, bar);\nbaz();',
  pattern: '$FN($$$ARGS)',
  language: 'typescript',
  capture_names: ['FN', 'ARGS'],
})

assert.equal(result.count, 2)
assert.equal(result.truncated, false)
assert.equal(result.matches[0].text, 'foo(42, bar)')
assert.equal(result.matches[0].range.start.line, 1)
assert.deepEqual(result.matches[0].captures.FN.map((item) => item.text), ['foo'])
assert.deepEqual(result.matches[0].captures.ARGS.map((item) => item.text), ['42', ',', 'bar'])
assert.equal(result.matches[1].text, 'baz()')

const pythonResult = await definition.execute({
  source: 'def hello(name):\n    print(name)',
  pattern: '$FN($$$ARGS)',
  language: 'python',
  capture_names: ['FN'],
})
assert.equal(pythonResult.count, 1)
assert.equal(pythonResult.matches[0].text, 'print(name)')
assert.equal(pythonResult.matches[0].captures.FN[0].text, 'print')

const supported = definition.parameters.properties.language.enum
for (const language of supported) {
  const smoke = await definition.execute({ source: 'x', pattern: '$X', language })
  assert.equal(smoke.language, language)
}
assert.equal(supported.length, 32)

await assert.rejects(
  () => definition.execute({ source: 'x', pattern: '$X', language: 'not-a-language' }),
  /unsupported language/,
)

const workflowHelp = await helpDefinition.execute({ topic: 'workflow' })
assert.match(workflowHelp.markdown, /## General Process/)
assert.match(workflowHelp.markdown, /stopBy: end/)
assert.doesNotMatch(workflowHelp.markdown, /## 3\. Atomic Rules/)
assert.equal(workflowHelp.source.commit, 'b69eb5391bd93d46ef3dec07de814c3c39675c8f')

const metavariableHelp = await helpDefinition.execute({ topic: 'metavariables' })
assert.match(metavariableHelp.markdown, /\$\$\$MULTI_META_VARIABLE/)
assert.doesNotMatch(metavariableHelp.markdown, /## 5\. Composite Rules/)

await assert.rejects(
  () => helpDefinition.execute({ topic: 'not-a-topic' }),
  /unsupported help topic/,
)

const cstDump = await dumpDefinition.execute({
  code: 'foo(bar)',
  language: 'javascript',
  format: 'cst',
})
assert.match(cstDump, /Debug CST:/)
assert.match(cstDump, /call_expression/)
assert.match(cstDump, /identifier/)

const astDump = await dumpDefinition.execute({
  code: 'foo(bar)',
  language: 'javascript',
  format: 'ast',
})
assert.doesNotMatch(astDump, /^\s*\($/m)

const ruleMatches = await ruleDefinition.execute({
  code: 'foo(1); bar(2);',
  yaml: 'id: calls\nlanguage: javascript\nrule:\n  pattern: $F($A)',
})
assert.equal(ruleMatches.length, 2)
assert.equal(ruleMatches[0].text, 'foo(1)')
assert.equal(ruleMatches[0].range.start.line, 0)
assert.equal(ruleMatches[0].range.byteOffset.start, 0)
assert.equal(ruleMatches[0].metaVariables.single.F.text, 'foo')
assert.equal(ruleMatches[0].ruleId, 'calls')

const relationalMatches = await ruleDefinition.execute({
  code: 'async function run() { await work(); }',
  yaml: 'id: await-in-function\nlanguage: javascript\nrule:\n  pattern: await $EXPR\n  inside:\n    kind: function_declaration\n    stopBy: end',
})
assert.equal(relationalMatches.length, 1)
assert.equal(relationalMatches[0].text, 'await work()')

await assert.rejects(
  () => ruleDefinition.execute({
    code: 'foo()',
    yaml: 'id: none\nlanguage: javascript\nrule:\n  pattern: bar()',
  }),
  /No matches found/,
)

console.log(`ast_grep tools test passed for ${supported.length} language identifiers`)
