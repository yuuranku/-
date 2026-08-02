import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { resolve } from 'node:path'

const exportScriptPath = resolve('cloudbase/scripts/export-supabase-public-data.ps1')

test('Supabase public-data exporter prompts for a connection string without persisting it', () => {
  assert.equal(existsSync(exportScriptPath), true, 'expected the exporter script to exist')

  const script = readFileSync(exportScriptPath, 'utf8')
  assert.match(script, /Read-Host.*Supabase/i)
  assert.match(script, /Read-Host.*AsSecureString/)
  assert.match(script, /Replace\('\[YOUR-PASSWORD\]'/)
  assert.match(script, /EscapeDataString/)
  assert.match(script, /Get-Command pg_dump/)
  assert.match(script, /PostgreSQL.*17.*bin.*pg_dump\.exe/)
  assert.match(script, /& \$pgDumpPath/)
  assert.match(script, /--schema public/)
  assert.match(script, /--data-only/)
  assert.doesNotMatch(script, /Set-Content.*connection/i)
  assert.doesNotMatch(script, /\.env/i)
})
