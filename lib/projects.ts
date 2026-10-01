import { insforge } from './insforge';

/**
 * Project repository — all `projects` table access lives here (AGENTS.md §14/§17:
 * keep database queries out of UI components). Runs in the browser against the
 * InsForge SDK; every row is guarded by the `projects` RLS policies, so a user
 * can only ever read or write their own projects.
 */

export interface Project {
  id: string;
  user_id: string;
  name: string;
  prompt: string | null;
  status: string;
  /** Public URL of the auto-captured preview thumbnail, or null before first capture. */
  thumbnail_url: string | null;
  /** Storage object key for the thumbnail (kept alongside the URL per the InsForge pattern). */
  thumbnail_key: string | null;
  /** Selected CometAPI model id for this project; null = app default. */
  ai_model: string | null;
  created_at: string;
  updated_at: string;
}

/** Common lead-ins users write ("Create a landing page…") that add no signal to a title. */
const TITLE_FILLER = /^(please\s+)?(can you\s+)?(create|build|design|make|generate|develop|explore|add|show)\s+(me\s+)?(a|an|the|my|some)?\s*/i;

/**
 * Derive a short, human-friendly project title from the prompt. We strip common
 * command lead-ins ("Create a…", "Build a…") and capitalize so the card shows a
 * clean name like "Landing page for my Shopify store" instead of the raw prompt.
 */
function deriveProjectName(prompt: string): string {
  const firstLine = prompt.trim().split('\n')[0]?.trim() ?? '';
  if (!firstLine) return 'Untitled project';

  const stripped = firstLine.replace(TITLE_FILLER, '').trim() || firstLine;
  const title = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  return title.length > 60 ? `${title.slice(0, 57).trimEnd()}…` : title;
}

/** Raised when a Free user tries to create a project past their plan limit. */
export class ProjectLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectLimitError';
  }
}

/**
 * Create a project from a user prompt.
 *
 * Creation goes through `POST /api/projects` (not the client SDK) so the Free
 * plan project limit is enforced server-side — the browser can't bypass it
 * (product spec). We attach the user's access token; the route verifies it,
 * checks the entitlement, and inserts with the owner pinned. A 402 response maps
 * to `ProjectLimitError` so the UI can show the upgrade dialog.
 */
export async function createProject(prompt: string): Promise<Project> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error('A prompt is required to create a project.');
  }

  const token = await insforge.getHttpClient().getValidAccessToken();
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ name: deriveProjectName(trimmed), prompt: trimmed }),
  });

  const payload = await res.json().catch(() => null);

  if (res.status === 402) {
    throw new ProjectLimitError(
      payload?.message ?? 'You have reached your project limit. Upgrade to create more.'
    );
  }
  if (!res.ok) {
    throw new Error(payload?.error ?? 'Failed to create project.');
  }

  const project = payload?.project;
  if (!project) {
    throw new Error('Project was not returned after creation.');
  }
  return project as Project;
}

/**
 * List every project owned by the current user, newest first. RLS scopes the
 * query to the owner, so no client-supplied user id is trusted (AGENTS.md §14).
 */
export async function listProjects(): Promise<Project[]> {
  const { data, error } = await insforge.database
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message ?? 'Failed to load projects.');
  }
  return (Array.isArray(data) ? data : []) as Project[];
}

/**
 * Persist the auto-captured preview thumbnail for a project. Stores both the
 * public `url` and the storage `key`. RLS scopes the update to the owner.
 */
export async function saveProjectThumbnail(
  projectId: string,
  thumbnail: { url: string; key: string }
): Promise<void> {
  const { error } = await insforge.database
    .from('projects')
    .update({
      thumbnail_url: thumbnail.url,
      thumbnail_key: thumbnail.key,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);

  if (error) {
    throw new Error(error.message ?? 'Failed to save project thumbnail.');
  }
}

/** Fetch a single project by id. RLS guarantees it belongs to the current user. */
export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await insforge.database
    .from('projects')
    .select('*')
    .eq('id', id)
    .limit(1);

  if (error) {
    throw new Error(error.message ?? 'Failed to load project.');
  }

  const project = Array.isArray(data) ? data[0] : data;
  return (project as Project) ?? null;
}

/**
 * Rename a project. RLS scopes the update to the owner, so passing another
 * user's id silently affects zero rows (which we surface as an error).
 */
export async function renameProject(id: string, name: string): Promise<void> {
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) {
    throw new Error('A project name is required.');
  }

  const { data, error } = await insforge.database
    .from('projects')
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select();

  if (error) {
    throw new Error(error.message ?? 'Failed to rename project.');
  }
  if (Array.isArray(data) && data.length === 0) {
    throw new Error('Project not found.');
  }
}

/**
 * Persist the AI model this project generates with. RLS scopes the update to the
 * owner, so another user's project id affects zero rows (surfaced as an error).
 */
export async function saveProjectAIModel(projectId: string, model: string): Promise<void> {
  const { data, error } = await insforge.database
    .from('projects')
    .update({ ai_model: model, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .select();

  if (error) {
    throw new Error(error.message ?? 'Failed to save the model choice.');
  }
  if (Array.isArray(data) && data.length === 0) {
    throw new Error('Project not found.');
  }
}

/**
 * Permanently delete a project and every row scoped to it. RLS scopes each
 * delete to the owner. Storage objects (thumbnails, exported ZIPs) linger in
 * the buckets — acceptable for now; a cleanup job can reap orphaned objects.
 */
export async function deleteProject(id: string): Promise<void> {
  // Children first (no ON DELETE CASCADE guaranteed across environments).
  const children = [
    'project_pages',
    'project_messages',
    'project_themes',
    'project_revisions',
    'theme_exports',
  ] as const;

  for (const table of children) {
    const { error } = await insforge.database
      .from(table)
      .delete()
      .eq('project_id', id);
    // A missing table (feature not provisioned) shouldn't block the delete.
    if (error && !/relation|does not exist|schema/i.test(error.message ?? '')) {
      throw new Error(error.message ?? `Failed to delete project ${table}.`);
    }
  }

  const { data, error } = await insforge.database
    .from('projects')
    .delete()
    .eq('id', id)
    .select();

  if (error) {
    throw new Error(error.message ?? 'Failed to delete project.');
  }
  if (Array.isArray(data) && data.length === 0) {
    throw new Error('Project not found.');
  }
}
