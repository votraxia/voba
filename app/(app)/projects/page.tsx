'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FolderOpen, ImageOff, Loader2, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/components';
import { deleteProject, listProjects, renameProject, type Project } from '@/lib/projects';
import { ensureProjectThumbnail } from '@/lib/thumbnail';

type LoadState = 'loading' | 'ready' | 'error';

/** Format an ISO timestamp as e.g. "Jul 21, 2026". */
function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ProjectsPage() {
  const { user, loading: authLoading } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    if (authLoading || !user) return;

    let active = true;
    (async () => {
      try {
        const rows = await listProjects();
        if (!active) return;
        setProjects(rows);
        setState('ready');

        // Backfill previews for projects that don't have one yet (e.g. generated
        // before this feature). Sequential + best-effort so a burst of offscreen
        // renders doesn't hog the main thread; each card updates as it resolves.
        for (const project of rows) {
          if (!active) return;
          if (project.thumbnail_url) continue;
          const url = await ensureProjectThumbnail(project);
          if (!active) return;
          if (url) {
            setProjects((prev) =>
              prev.map((p) => (p.id === project.id ? { ...p, thumbnail_url: url } : p))
            );
          }
        }
      } catch {
        if (active) setState('error');
      }
    })();

    return () => {
      active = false;
    };
  }, [user, authLoading]);

  return (
    <div className="min-h-screen bg-app px-8 py-10">
      <div className="mx-auto max-w-[1120px]">
        <header className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold leading-tight text-fg">Your projects</h1>
            <p className="mt-1 text-sm text-fg-2">
              Every storefront you&apos;ve generated, ready to reopen and edit.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg shadow-[var(--app-shadow-md)] transition hover:bg-accent-hover"
          >
            <Plus size={17} strokeWidth={2.2} />
            New project
          </Link>
        </header>

        {state === 'loading' && (
          <div className="grid place-items-center py-28 text-fg-2">
            <div className="flex items-center gap-3 text-sm font-medium">
              <Loader2 size={18} className="animate-spin text-accent-text" />
              Loading your projects…
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="grid place-items-center py-28 text-center">
            <p className="text-sm font-medium text-danger">
              We couldn&apos;t load your projects. Please refresh and try again.
            </p>
          </div>
        )}

        {state === 'ready' && projects.length === 0 && (
          <div className="grid place-items-center rounded-2xl border border-dashed border-line bg-card py-24 text-center">
            <div className="flex flex-col items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-text">
                <FolderOpen size={26} strokeWidth={1.8} />
              </span>
              <div>
                <h2 className="text-base font-bold text-fg">No projects yet</h2>
                <p className="mt-1 text-sm text-fg-2">
                  Describe a Shopify page from the home screen to create your first one.
                </p>
              </div>
              <Link
                href="/dashboard"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg transition hover:bg-accent-hover"
              >
                <Plus size={17} strokeWidth={2.2} />
                Create a project
              </Link>
            </div>
          </div>
        )}

        {state === 'ready' && projects.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onRenamed={(id, name) =>
                  setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
                }
                onDeleted={(id) => {
                  setProjects((prev) => prev.filter((p) => p.id !== id));
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onRenamed,
  onDeleted,
}: {
  project: Project;
  onRenamed: (id: string, name: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  async function submitRename() {
    const next = nameDraft.trim();
    if (!next || next === project.name) {
      setRenaming(false);
      return;
    }
    try {
      await renameProject(project.id, next);
      onRenamed(project.id, next);
    } catch {
      // Keep the old name on failure.
    } finally {
      setRenaming(false);
    }
  }

  async function submitDelete() {
    setDeleting(true);
    try {
      await deleteProject(project.id);
      onDeleted(project.id);
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--app-shadow-sm)] transition hover:-translate-y-0.5 hover:border-accent-line hover:shadow-[var(--app-shadow-md)]"
    >
      <Link href={`/editor/${project.id}`} className="relative block aspect-[16/10] w-full overflow-hidden bg-elevated">
        {project.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote InsForge Storage URL, not optimizable at build time.
          <img
            src={project.thumbnail_url}
            alt={`${project.name} preview`}
            className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted">
            <div className="flex flex-col items-center gap-2">
              <ImageOff size={26} strokeWidth={1.6} />
              <span className="text-xs font-medium">Preview generating…</span>
            </div>
          </div>
        )}
      </Link>

      {/* Card menu */}
      <div className="absolute right-3 top-3 z-10" ref={menuRef}>
        <button
          aria-label={`Options for ${project.name}`}
          onClick={(e) => {
            e.preventDefault();
            setMenuOpen((v) => !v);
          }}
          className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-elevated/95 text-fg-2 opacity-0 shadow-[var(--app-shadow-sm)] backdrop-blur transition group-hover:opacity-100 hover:text-fg focus:opacity-100"
        >
          <MoreVertical size={15} strokeWidth={2} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-9 w-44 overflow-hidden rounded-xl border border-line bg-card p-1 shadow-[var(--app-shadow-md)]">
            <button
              onClick={() => {
                setMenuOpen(false);
                setNameDraft(project.name);
                setRenaming(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-accent-fg transition hover:bg-accent-soft"
            >
              <Pencil size={14} strokeWidth={2} /> Rename
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setConfirmDelete(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger transition hover:bg-danger-soft"
            >
              <Trash2 size={14} strokeWidth={2} /> Delete
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        {renaming ? (
          <input
            value={nameDraft}
            autoFocus
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            className="w-full rounded-lg border border-accent-line bg-card px-2 py-1 text-[15px] font-bold text-fg outline-none focus:border-accent"
          />
        ) : (
          <Link href={`/editor/${project.id}`}>
            <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-fg">
              {project.name}
            </h3>
          </Link>
        )}
        <p className="mt-auto pt-2 text-xs font-medium text-muted">
          Created {formatCreatedAt(project.created_at)}
        </p>
      </div>

      {confirmDelete && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-elevated/95 p-6 text-center">
          <div>
            <h4 className="text-sm font-bold text-fg">Delete “{project.name}”?</h4>
            <p className="mt-1 text-xs text-fg-2">
              This permanently removes the project, its pages, and its exports.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="h-9 rounded-lg border border-line bg-card px-4 text-xs font-semibold text-fg-2 transition hover:bg-elevated disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitDelete()}
                disabled={deleting}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-danger px-4 text-xs font-semibold text-fg transition hover:bg-danger disabled:opacity-50"
              >
                {deleting && <Loader2 size={13} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
