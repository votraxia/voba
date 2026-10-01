import { insforge } from './insforge';
import type { PageType } from './ai/events';

/**
 * Project-revisions repository — all `project_revisions` table access lives
 * here (AGENTS.md §8: every accepted edit must create a revision; users must be
 * able to undo and restore). A revision is a full snapshot of the project's
 * pages at a moment in time, plus a short human label, so a restore returns the
 * store exactly as it was. Runs in the browser against the InsForge SDK; RLS
 * scopes every row to its owner.
 */

export interface RevisionPageSnapshot {
  pageKey: string;
  label: string;
  type: PageType;
  path: string;
  html: string;
  status: string;
  position: number;
}

export interface ProjectRevisionRow {
  id: string;
  project_id: string;
  user_id: string;
  label: string;
  pages: RevisionPageSnapshot[];
  created_at: string;
}

export interface RevisionInput {
  label: string;
  pages: RevisionPageSnapshot[];
}

/** Fetch a project's revision history, newest first. RLS scopes to the owner. */
export async function getProjectRevisions(projectId: string): Promise<ProjectRevisionRow[]> {
  const { data, error } = await insforge.database
    .from('project_revisions')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    throw new Error(error.message ?? 'Failed to load revision history.');
  }
  return (Array.isArray(data) ? data : []) as ProjectRevisionRow[];
}

/** Persist a new revision snapshot. `user_id` is filled by the column default. */
export async function createProjectRevision(
  projectId: string,
  input: RevisionInput
): Promise<ProjectRevisionRow> {
  const { data, error } = await insforge.database
    .from('project_revisions')
    .insert([
      {
        project_id: projectId,
        label: input.label,
        pages: input.pages,
      },
    ])
    .select();

  if (error) {
    throw new Error(error.message ?? 'Failed to save revision.');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('Revision was not returned after creation.');
  }
  return row as ProjectRevisionRow;
}

/**
 * Restore a revision: rewrite every page row it contains and delete page rows
 * that no longer exist in the snapshot, so the project matches the snapshot
 * exactly. Returns the restored pages (ordered by position).
 */
export async function restoreRevisionData(
  projectId: string,
  pages: RevisionPageSnapshot[]
): Promise<void> {
  // Upsert every page in the snapshot.
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const values = {
      label: page.label,
      type: page.type,
      path: page.path,
      html: page.html,
      status: page.status,
      position: page.position ?? i,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateError } = await insforge.database
      .from('project_pages')
      .update(values)
      .eq('project_id', projectId)
      .eq('page_key', page.pageKey)
      .select();

    if (updateError) {
      throw new Error(updateError.message ?? 'Failed to restore page.');
    }
    if (Array.isArray(updated) && updated.length > 0) continue;

    const { error: insertError } = await insforge.database
      .from('project_pages')
      .insert([{ project_id: projectId, page_key: page.pageKey, ...values }])
      .select();

    if (insertError) {
      throw new Error(insertError.message ?? 'Failed to restore page.');
    }
  }

  // Remove pages that exist now but aren't in the snapshot (a tab closed after
  // the revision was taken must disappear on restore).
  const { data: current, error: listError } = await insforge.database
    .from('project_pages')
    .select('page_key')
    .eq('project_id', projectId);

  if (listError) {
    throw new Error(listError.message ?? 'Failed to list pages for restore.');
  }

  const keep = new Set(pages.map((p) => p.pageKey));
  const stale = (Array.isArray(current) ? current : [])
    .map((row) => (row as { page_key: string }).page_key)
    .filter((key) => !keep.has(key));

  for (const pageKey of stale) {
    const { error } = await insforge.database
      .from('project_pages')
      .delete()
      .eq('project_id', projectId)
      .eq('page_key', pageKey);
    if (error) {
      throw new Error(error.message ?? 'Failed to remove a page during restore.');
    }
  }
}
