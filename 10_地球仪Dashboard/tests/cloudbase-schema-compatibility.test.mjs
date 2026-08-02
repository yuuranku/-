import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { resolve } from 'node:path'
import { normalizedStatementStart, splitSqlStatements } from '../cloudbase/scripts/sql-statements.mjs'

const generatorPath = resolve('cloudbase/scripts/build-cloudbase-schema.mjs')
const outputPath = resolve('cloudbase/migrations/202608030001_palis_schema.sql')

test('CloudBase schema bundle retains business migrations without Supabase-only auth or realtime objects', () => {
  assert.equal(existsSync(generatorPath), true, 'expected the CloudBase schema generator to exist')

  execFileSync('node', [generatorPath], { stdio: 'pipe' })
  const sql = readFileSync(outputPath, 'utf8')

  assert.doesNotMatch(sql, /references\s+auth\.users\(id\)/i)
  assert.doesNotMatch(sql, /on_auth_user_created/i)
  assert.doesNotMatch(sql, /raw_user_meta_data/i)
  assert.doesNotMatch(sql, /supabase_realtime/i)
  assert.doesNotMatch(sql, /create extension if not exists pgcrypto/i)
  assert.match(sql, /create table if not exists public\.archives/i)
  assert.match(sql, /auth\.uid\(\)::uuid/i)

  const topLevelPublicSeeds = splitSqlStatements(sql).filter((statement) => {
    const start = normalizedStatementStart(statement)
    return (start.startsWith('insert') || start.startsWith('with')) && /\binsert into public\./i.test(start)
  })
  assert.deepEqual(topLevelPublicSeeds, [])
})
