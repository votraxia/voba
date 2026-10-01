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
    <div className="min-h-screen bg-[#fffdfc] px-8 py-10">
      <div className="mx-auto max-w-[1120px]">
        <header className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold leading-tight text-[#111827]">Your projects</h1>
            <p className="mt-1 text-sm text-[#6b7280]">
              Every storefront you&apos;ve generated, ready to reopen and edit.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#ff6747] px-4 text-sm font-semibold text-white shadow-[0_12px_22px_rgba(255,103,71,0.2)] transition hover:bg-[#f85b3a]"
          >
            <Plus size={17} strokeWidth={2.2} />
            New project
          </Link>
        </header>

        {state === 'loading' && (
          <div className="grid place-items-center py-28 text-[#6b7280]">
            <div className="flex items-center gap-3 text-sm font-medium">
              <Loader2 size={18} className="animate-spin text-[#ff6747]" />
              Loading your projects…
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="grid place-items-center py-28 text-center">
            <p className="text-sm font-medium text-[#ef4444]">
              We couldn&apos;t load your projects. Please refresh and try again.
            </p>
          </div>
        )}

        {state === 'ready' && projects.length === 0 && (
          <div className="grid place-items-center rounded-2xl border border-dashed border-[#e7e2df] bg-white py-24 text-center">
            <div className="flex flex-col items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#fff3ef] text-[#f05a32]">
                <FolderOpen size={26} strokeWidth={1.8} />
              </span>
              <div>
                <h2 className="text-base font-bold text-[#111827]">No projects yet</h2>
                <p className="mt-1 text-sm text-[#6b7280]">
                  Describe a Shopify page from the home screen to create your first one.
                </p>
              </div>
              <Link
                href="/dashboard"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ff6747] px-4 text-sm font-semibold text-white transition hover:bg-[#f85b3a]"
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
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-[#eee7e3] bg-white shadow-[0_10px_24px_rgba(31,41,55,0.035)] transition hover:-translate-y-0.5 hover:border-[#ffd4c7] hover:shadow-[0_16px_32px_rgba(31,41,55,0.08)]"
    >
      <Link href={`/editor/${project.id}`} className="relative block aspect-[16/10] w-full overflow-hidden bg-[#f6f2ef]">
        {project.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote InsForge Storage URL, not optimizable at build time.
          <img
            src={project.thumbnail_url}
            alt={`${project.name} preview`}
            className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-[#c3bcb6]">
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
          className="grid h-8 w-8 place-items-center rounded-lg border border-[#eee7e3] bg-white/95 text-[#6b7280] opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 hover:text-[#111827] focus:opacity-100"
        >
          <MoreVertical size={15} strokeWidth={2} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-9 w-44 overflow-hidden rounded-xl border border-[#eee7e3] bg-white p-1 shadow-[0_18px_40px_rgba(31,41,55,0.14)]">
            <button
              onClick={() => {
                setMenuOpen(false);
                setNameDraft(project.name);
                setRenaming(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#111827] transition hover:bg-[#fff3ef]"
            >
              <Pencil size={14} strokeWidth={2} /> Rename
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setConfirmDelete(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#b4432a] transition hover:bg-[#fff4f1]"
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
            className="w-full rounded-lg border border-[#ffd4c7] bg-white px-2 py-1 text-[15px] font-bold text-[#111827] outline-none focus:border-[#ff6747]"
          />
        ) : (
          <Link href={`/editor/${project.id}`}>
            <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-[#111827]">
              {project.name}
            </h3>
          </Link>
        )}
        <p className="mt-auto pt-2 text-xs font-medium text-[#9aa2af]">
          Created {formatCreatedAt(project.created_at)}
        </p>
      </div>

      {confirmDelete && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-white/95 p-6 text-center">
          <div>
            <h4 className="text-sm font-bold text-[#111827]">Delete “{project.name}”?</h4>
            <p className="mt-1 text-xs text-[#6b7280]">
              This permanently removes the project, its pages, and its exports.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="h-9 rounded-lg border border-[#e8e2de] bg-white px-4 text-xs font-semibold text-[#374151] transition hover:bg-[#faf8f6] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitDelete()}
                disabled={deleting}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#dc2626] px-4 text-xs font-semibold text-white transition hover:bg-[#b91c1c] disabled:opacity-50"
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
