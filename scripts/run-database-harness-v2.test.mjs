import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  calculateCanonicalSchemaSignature,
  enumeratePgTapTestFiles,
  normalizeDeterministicPgDump,
  sameContainerNames,
} from './run-database-harness.mjs';

describe('production database runner v2', () => {
  it('nested pgTAPを再帰的かつ決定的順序でexact列挙する', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jstqb-pgtap-enumeration-'));
    try {
      await mkdir(join(root, 'nested', 'deeper'), { recursive: true });
      await writeFile(join(root, 'z.test.sql'), 'select 1;');
      await writeFile(join(root, 'nested', 'a.test.sql'), 'select 1;');
      await writeFile(join(root, 'nested', 'deeper', 'b.test.sql'), 'select 1;');
      await writeFile(join(root, 'nested', 'fixture.sql'), 'select 1;');

      assert.deepEqual(await enumeratePgTapTestFiles(root), [
        join(root, 'nested', 'a.test.sql'),
        join(root, 'nested', 'deeper', 'b.test.sql'),
        join(root, 'nested', 'fixture.sql'),
        join(root, 'z.test.sql'),
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('canonical署名へcatalogとmigration filename・hash・orderを全て結合する', () => {
    const catalogRows = ['01', '02'];
    const first = [
      { path: '/repo/supabase/migrations/202608110001_initial.sql', content: 'select 1;\n' },
      { path: '/repo/supabase/migrations/202608120001_next.sql', content: 'select 2;\n' },
    ];
    const baseline = calculateCanonicalSchemaSignature(catalogRows, first);
    assert.match(baseline, /^[0-9a-f]{64}$/u);
    assert.notEqual(calculateCanonicalSchemaSignature(['01', '03'], first), baseline);
    assert.notEqual(calculateCanonicalSchemaSignature(catalogRows, [...first].reverse()), baseline);
    assert.notEqual(calculateCanonicalSchemaSignature(catalogRows, [first[0], { ...first[1], content: 'select 3;\n' }]), baseline);
    assert.throws(
      () => calculateCanonicalSchemaSignature(catalogRows, [{ path: 'fixture.sql', content: '' }]),
      /migration filenameが不正/u,
    );
  });

  it('pg_dumpの非決定的headerとrestrict tokenだけを除去する', () => {
    const first = '-- PostgreSQL database dump\n\\restrict random-a\nINSERT INTO public.audit VALUES (1);\n\\unrestrict random-a\n';
    const second = '-- PostgreSQL database dumped by another build\n\\restrict random-b\nINSERT INTO public.audit VALUES (1);\n\\unrestrict random-b\n';
    assert.equal(normalizeDeterministicPgDump(first), 'INSERT INTO public.audit VALUES (1);');
    assert.equal(normalizeDeterministicPgDump(first), normalizeDeterministicPgDump(second));
  });

  it('停止直前のcontainer名集合が所有証跡とexact一致しなければ拒否する', () => {
    const owned = [{ id: 'db-new-id', name: 'supabase_db_jstqb-study-app' }];
    assert.equal(sameContainerNames(owned, ['supabase_db_jstqb-study-app']), true);
    assert.equal(sameContainerNames([
      ...owned,
      { id: 'unknown', name: 'supabase_api_jstqb-study-app' },
    ], ['supabase_db_jstqb-study-app']), false);
    assert.equal(sameContainerNames([], ['supabase_db_jstqb-study-app']), false);
  });
});
