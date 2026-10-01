'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FolderGit2,
  GitBranch,
  GitFork,
  Loader2,
  Lock,
  X,
} from 'lucide-react';
import {
  commitThemeToGitHub,
  fetchGitHubStatus,
  toPushFiles,
  type GitHubCommitResponse,
  type GitHubStatus,
} from '@/lib/github/push-client';
import type { ThemeFile } from '@/lib/shopify/types';

/**
 * "Save theme to GitHub" dialog (AGENTS.md §16). Lets the user commit the
 * generated Shopify theme into a repository so the source is versioned,
 * reviewable, and ready for CI — the ZIP download alone gives no history.
 *
 * Phases: check the server-side connection → pick a repository, branch and
 * folder → commit → show the resulting commit. The token never reaches this
 * component; it only ever calls our own API routes.
 */

type Phase = 'checking' | 'not_configured' | 'ready' | 'committing' | 'done' | 'error';

interface GitHubPushDialogProps {
  open: boolean;
  onClose: () => void;
  projectName: string;
  /** The built theme files, exactly as they went into the export ZIP. */
  files: ThemeFile[];
}

function formatPushedAt(iso: string | null): string {
  if (!iso) return '';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  const days = Math.floor((Date.now() - time) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'pushed today';
  if (days === 1) return 'pushed yesterday';
  return `pushed ${days}d ago`;
}

export default function GitHubPushDialog({
  open,
  onClose,
  projectName,
  files,
}: GitHubPushDialogProps) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('');
  const [basePath, setBasePath] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<GitHubCommitResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const branchRef = useRef<HTMLInputElement | null>(null);

  const pushFiles = toPushFiles(files);

  // On open (or after "Try again"): load the connection + repo list. The reset
  // and every state update live inside the async callback, never synchronously
  // in the effect body, so a fresh open can't trigger a cascading render.
  useEffect(() => {
    if (!open) return;
    let active = true;

    (async () => {
      setPhase('checking');
      setError('');
      try {
        const next = await fetchGitHubStatus();
        if (!active) return;
        setStatus(next);
        if (!next.connected) {
          setPhase('not_configured');
          return;
        }
        setRepo((current) => current || next.repositories[0]?.fullName || '');
        setPhase('ready');
      } catch {
        if (!active) return;
        setError('Could not reach GitHub. Please try again.');
        setPhase('error');
      }
    })();

    return () => {
      active = false;
    };
  }, [open, reloadKey]);

  useEffect(() => {
    if (open && phase === 'ready') branchRef.current?.focus();
  }, [open, phase]);

  if (!open) return null;

  const repositories = status?.repositories ?? [];
  const selected = repositories.find((r) => r.fullName === repo) ?? null;
  // The branch field starts empty and falls back to the chosen repository's
  // default branch — derived during render rather than synced by an effect.
  const effectiveBranch = branch || selected?.defaultBranch || 'main';

  const startCommit = async () => {
    if (!repo) {
      setError('Choose a repository first.');
      return;
    }
    if (pushFiles.length === 0) {
      setError('There are no text theme files to commit.');
      return;
    }
    setPhase('committing');
    setError('');
    try {
      const committed = await commitThemeToGitHub({
        repo,
        branch: effectiveBranch,
        basePath,
        message,
        projectName,
        files: pushFiles,
      });
      setResult(committed);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving the theme to GitHub failed.');
      setPhase('error');
    }
  };

  const retry = () => {
    setError('');
    setReloadKey((key) => key + 1);
  };

  const dialogShell = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Save theme to GitHub"
          className="w-[min(32rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-card shadow-[0_32px_64px_rgba(31,41,55,0.24)]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-elevated">
                <GitFork size={18} strokeWidth={2} className="text-fg" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-fg">Save theme to GitHub</h2>
                <p className="truncate text-[11px] text-muted">
                  {projectName || 'Storefront theme'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-elevated hover:text-fg-2"
            >
              <X size={17} strokeWidth={2} />
            </button>
          </div>
          <div className="px-5 py-5">{children}</div>
        </div>
      </div>
    </div>
  );

  if (phase === 'checking') {
    return dialogShell(
      <div className="flex items-center gap-3 py-6 text-sm text-fg-2">
        <Loader2 size={18} className="animate-spin text-accent" />
        Checking your GitHub connection…
      </div>
    );
  }

  if (phase === 'not_configured') {
    return dialogShell(
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-elevated">
          <GitFork size={26} strokeWidth={1.9} className="text-fg" />
        </span>
        <h3 className="mt-3 text-base font-bold text-fg">GitHub isn&apos;t connected yet</h3>
        <p className="mt-1.5 text-[13px] leading-6 text-fg-2">
          Add a <code className="rounded bg-elevated px-1 py-0.5 text-[12px]">GITHUB_TOKEN</code> in
          your project&apos;s environment settings, then try again. The token stays on the server —
          it is never sent to the browser.
        </p>
        <button
          onClick={retry}
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg transition hover:bg-accent-hover"
        >
          Check again
        </button>
        <button
          onClick={onClose}
          className="mt-2.5 flex h-10 w-full items-center justify-center rounded-xl px-4 text-sm font-medium text-fg-2 transition hover:bg-elevated"
        >
          Close
        </button>
      </div>
    );
  }

  if (phase === 'done' && result) {
    return dialogShell(
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success-soft">
          <CheckCircle2 size={30} strokeWidth={2} className="text-success" />
        </span>
        <h3 className="mt-3 text-base font-bold text-fg">Theme committed</h3>
        <p className="mt-1 text-[13px] leading-6 text-fg-2">
          {result.fileCount} theme file{result.fileCount === 1 ? '' : 's'} committed to{' '}
          <span className="font-semibold text-fg">
            {result.owner}/{result.name}
          </span>{' '}
          on <span className="font-semibold text-fg">{result.branch}</span> as{' '}
          <code className="rounded bg-elevated px-1 text-[12px]">{result.commitSha}</code>.
        </p>
        <a
          href={result.commitUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-5 flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg transition hover:bg-accent-hover"
        >
          <ExternalLink size={16} strokeWidth={2} />
          View commit on GitHub
        </a>
        <button
          onClick={onClose}
          className="mt-2.5 flex h-10 w-full items-center justify-center rounded-xl px-4 text-sm font-medium text-fg-2 transition hover:bg-elevated"
        >
          Done
        </button>
      </div>
    );
  }

  if (phase === 'error') {
    return dialogShell(
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-soft">
          <AlertTriangle size={28} strokeWidth={2} className="text-danger" />
        </span>
        <h3 className="mt-3 text-base font-bold text-fg">Couldn&apos;t commit the theme</h3>
        <p className="mt-1 break-words text-[13px] text-fg-2">{error}</p>
        <button
          onClick={retry}
          className="mt-5 flex h-11 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg transition hover:bg-accent-hover"
        >
          Try again
        </button>
        <button
          onClick={onClose}
          className="mt-2.5 flex h-10 w-full items-center justify-center rounded-xl px-4 text-sm font-medium text-fg-2 transition hover:bg-elevated"
        >
          Close
        </button>
      </div>
    );
  }

  return dialogShell(
    <div>
      {phase === 'committing' && (
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-accent-soft px-3.5 py-3 text-[13px] text-accent-fg-2">
          <Loader2 size={16} className="animate-spin text-accent" />
          Committing {pushFiles.length} theme file{pushFiles.length === 1 ? '' : 's'}…
        </div>
      )}

      <div className="flex items-center gap-3 rounded-xl border border-line bg-elevated px-3.5 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-card ring-1 ring-line">
          <GitFork size={16} className="text-fg" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-fg">
            {status?.account?.login ?? 'GitHub'}
          </p>
          <p className="text-[11px] text-muted">
            {repositories.length} repositor{repositories.length === 1 ? 'y' : 'ies'} available
          </p>
        </div>
      </div>

      <label className="mt-4 block text-[13px] font-semibold text-fg">Repository</label>
      {repositories.length === 0 ? (
        <p className="mt-1.5 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger">
          This GitHub account has no repositories the token can push to. Create one on GitHub, or
          grant the token access to an existing repository.
        </p>
      ) : (
        <div className="mt-1.5 flex items-center rounded-xl border-2 border-line px-3 focus-within:border-accent">
          <FolderGit2 size={15} className="shrink-0 text-muted" />
          <select
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            className="h-11 w-full bg-transparent px-2.5 text-sm text-fg outline-none"
          >
            {repositories.map((repository) => (
              <option key={repository.fullName} value={repository.fullName}>
                {repository.fullName}
                {repository.isPrivate ? '  (private)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      {selected && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
          {selected.isPrivate && <Lock size={11} strokeWidth={2.2} />}
          {selected.isPrivate ? 'Private repository' : 'Public repository'}
          {selected.pushedAt ? ` · ${formatPushedAt(selected.pushedAt)}` : ''}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-[13px] font-semibold text-fg">Branch</label>
          <div className="mt-1.5 flex items-center rounded-xl border-2 border-line px-3 focus-within:border-accent">
            <GitBranch size={15} className="shrink-0 text-muted" />
            <input
              ref={branchRef}
              value={effectiveBranch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="h-11 w-full bg-transparent px-2.5 text-sm text-fg outline-none placeholder:text-muted"
            />
          </div>
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-fg">Folder (optional)</label>
          <input
            value={basePath}
            onChange={(e) => setBasePath(e.target.value)}
            placeholder="themes/my-store"
            className="mt-1.5 h-11 w-full rounded-xl border-2 border-line px-3 text-sm text-fg outline-none placeholder:text-muted focus:border-accent"
          />
        </div>
      </div>

      <label className="mt-4 block text-[13px] font-semibold text-fg">
        Commit message (optional)
      </label>
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={`Update Shopify theme: ${projectName || 'storefront'}`}
        className="mt-1.5 h-11 w-full rounded-xl border-2 border-line px-3 text-sm text-fg outline-none placeholder:text-muted focus:border-accent"
      />

      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}

      <button
        onClick={() => void startCommit()}
        disabled={phase === 'committing' || repositories.length === 0}
        className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {phase === 'committing' ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Committing…
          </>
        ) : (
          <>
            <GitFork size={16} strokeWidth={2} />
            Commit theme to GitHub
          </>
        )}
      </button>
      <p className="mt-3 text-center text-[11px] leading-4 text-muted">
        One commit with {pushFiles.length} file{pushFiles.length === 1 ? '' : 's'}. Nothing is
        overwritten outside this folder, and the token is used server-side only.
      </p>
    </div>
  );
}
