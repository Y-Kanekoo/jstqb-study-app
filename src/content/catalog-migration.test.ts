import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/202608120020_content_catalog.sql'),
  'utf8',
);

describe('content catalog migration', () => {
  it('SECURITY DEFINERと固定search_pathをRPCへ適用する', () => {
    expect(migration).toMatch(/function public\.get_question_catalog_v1[\s\S]*security definer[\s\S]*set search_path = ''/u);
  });

  it('publicとpersonal_previewの公開状態を分離する', () => {
    expect(migration).toContain("target_channel = 'public'::public.content_catalog_channel");
    expect(migration).toContain("qv.status = 'published'::public.content_status");
    expect(migration).toContain("target_channel = 'personal_preview'::public.content_catalog_channel");
    expect(migration).toContain("p.role in ('reviewer', 'admin')");
    expect(migration).toContain("and sv.status = 'published'::public.content_status");
    expect(migration).toMatch(/target_channel = 'personal_preview'[\s\S]*and sv\.status in \([\s\S]*'reviewing'/u);
  });

  it('内部streamを遮断しRPCだけを公開する', () => {
    expect(migration).toContain('revoke all on table public.content_catalog_streams from public, anon, authenticated');
    expect(migration).toContain('revoke all on table public.content_catalog_changes from public, anon, authenticated');
    expect(migration).toContain('grant execute on function public.get_question_catalog_v1');
    expect(migration).toContain('revoke all on function public.track_question_version_catalog_change()');
    expect(migration).toContain('revoke all on function public.track_question_catalog_dependency_change()');
    expect(migration).toContain('revoke all on function public.track_learning_metadata_catalog_change()');
    expect(migration).toContain('revoke all on function public.track_question_catalog_selection_change()');
  });

  it('単調revision・tombstone・応答上限を定義する', () => {
    expect(migration).toContain('public.content_catalog_streams.revision + 1');
    expect(migration).toContain("'remove'::public.content_catalog_operation");
    expect(migration).toContain('selected_question_count > 2000');
    expect(migration).toContain('octet_length(result_payload::text) > 10485760');
  });
});
