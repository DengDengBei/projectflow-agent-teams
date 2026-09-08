#!/usr/bin/env node

import assert from 'node:assert/strict'

const { installMemberSelectionRuntime } = await import('../lib/members.js')
const registrations = []
const runtime = installMemberSelectionRuntime({
  subagents: { sendMessage() {} },
  on(name, handler) {
    registrations.push([name, handler])
    return () => undefined
  },
  effect() {
    return () => undefined
  },
  logger: { warn() {} },
}, '.agent-teams')

assert.equal(runtime.compatible, true)
assert.ok(registrations.some(([name]) => name === 'agent/created'))

const warnings = []
const incompatible = installMemberSelectionRuntime({
  subagents: {},
  logger: { warn(message) { warnings.push(message) } },
}, '.agent-teams')
assert.equal(incompatible.compatible, false)
assert.equal(warnings.length, 1)
assert.match(warnings[0], /0\.1\.2-alpha\.4/)
await assert.rejects(
  incompatible.withPending('captain', 'agent-teams:team:member', { provider: 'provider', model: 'model' }, async () => undefined),
  /requires DeepSeek Harness 0\.1\.2-alpha\.4/,
)
console.log('Host compatibility verification passed')
