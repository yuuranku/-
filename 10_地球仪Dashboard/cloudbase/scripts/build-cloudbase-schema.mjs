import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizedStatementStart, splitSqlStatements } from './sql-statements.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const sourceDirectory = resolve(scriptDirectory, '../../supabase/migrations')
const outputDirectory = resolve(scriptDirectory, '../migrations')
const outputPath = resolve(outputDirectory, '202608030001_palis_schema.sql')

function transformMigration(fileName, sourceSql) {
  if (fileName === '202608010003_mainline_realtime.sql') {
    return null
  }

  let sql = sourceSql

  if (fileName === '202607270001_archive_workflow.sql') {
    sql = sql.replace(/^create extension if not exists pgcrypto;\s*/im, '')
    sql = sql.replace(
      /create or replace function public\.handle_new_user\(\)[\s\S]*?\$\$;\s*create trigger on_auth_user_created after insert on auth\.users\s*for each row execute function public\.handle_new_user\(\);\s*/i,
      '',
    )
  }

  if (fileName === '202607270002_repair_admin_and_official_archives.sql') {
    sql = sql.replace(/-- Repair accounts[\s\S]*?enabled = true;\s*/i, '')
  }

  sql = sql.replace(
    /id uuid primary key references auth\.users\(id\) on delete cascade,/i,
    'id uuid primary key,',
  )
  sql = sql.replace(/auth\.uid\(\)(?!::)/g, 'auth.uid()::uuid')

  return splitSqlStatements(sql)
    .filter((statement) => {
      const start = normalizedStatementStart(statement)
      const isTopLevelPublicSeed =
        (start.startsWith('insert') || start.startsWith('with')) && /\binsert into public\./i.test(start)
      return !isTopLevelPublicSeed
    })
    .join(';\n\n')
    .trim()
}

const files = (await readdir(sourceDirectory))
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort()

const sections = []
for (const fileName of files) {
  const sourceSql = await readFile(resolve(sourceDirectory, fileName), 'utf8')
  const sql = transformMigration(fileName, sourceSql)
  if (sql) {
    sections.push(`-- Source migration: ${fileName}\n${sql}`)
  }
}

await mkdir(outputDirectory, { recursive: true })
await writeFile(
  outputPath,
  `-- Generated from supabase/migrations. Do not edit by hand.\n-- CloudBase changes: preserved user UUIDs live in auth.users.sub; Supabase Realtime is omitted.\n\n${sections.join('\n\n')}
`,
  'utf8',
)

console.log(`Generated ${outputPath}`)
