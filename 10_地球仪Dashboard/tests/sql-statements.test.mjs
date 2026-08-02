import assert from 'node:assert/strict'
import test from 'node:test'
import { splitSqlStatements } from '../cloudbase/scripts/sql-statements.mjs'

test('splits top-level PostgreSQL statements without splitting PL/pgSQL function bodies', () => {
  const sql = `
    create function public.example() returns void language plpgsql as $$
    begin
      perform 'one; two';
    end;
    $$;
    create table public.example_table (id integer);
  `

  assert.deepEqual(splitSqlStatements(sql), [
    `create function public.example() returns void language plpgsql as $$
    begin
      perform 'one; two';
    end;
    $$`,
    'create table public.example_table (id integer)',
  ])
})
