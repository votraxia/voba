'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import EditorTopBar from '@/components/editor/EditorTopBar';
import EditorChatPanel from '@/components/editor/EditorChatPanel';
import EditorPreview from '@/components/editor/EditorPreview';
import { BuilderProvider } from '@/components/editor/BuilderContext';
import { getProject, type Project } from '@/lib/projects';
import { useAuth } from '@/components';

export default function EditorPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found'>('loading');
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/sign-in');
      return;
    }

    let active = true;
    (async () => {
      try {
        const result = await getProject(projectId);
        if (!active) return;
        if (!result) {
          setStatus('not-found');
          return;
        }
        setProject(result);
        setStatus('ready');
      } catch {
        if (active) setStatus('not-found');
      }
    })();

    return () => {
      active = false;
    };
  }, [projectId, user, authLoading, router]);

  if (status === 'loading') {
    return (
      <div className="grid h-screen place-items-center bg-elevated text-fg-2">
        <div className="flex items-center gap-3 text-sm font-medium">
          <Loader2 size={18} className="animate-spin text-accent-text" />
          Loading your project…
        </div>
      </div>
    );
  }

  if (status === 'not-found') {
    return (
      <div className="grid h-screen place-items-center bg-elevated px-6 text-center">
        <div>
          <h1 className="text-lg font-semibold text-fg">Project not found</h1>
          <p className="mt-2 text-sm text-fg-2">
            This project doesn&apos;t exist or you don&apos;t have access to it.
          </p>
          <button
            onClick={() => router.push('/projects')}
            className="mt-5 inline-flex h-10 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg transition hover:bg-accent-hover"
          >
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <BuilderProvider
      projectId={projectId}
      initialPrompt={project?.prompt ?? ''}
      initialAiModel={project?.ai_model ?? null}
    >
      <div className="flex h-screen flex-col overflow-hidden bg-elevated">
        <EditorTopBar
          collapsed={collapsed}
          onToggleSidebar={() => setCollapsed((c) => !c)}
          projectId={projectId}
          projectName={project?.name ?? 'Storefront'}
        />

        <div className="relative flex min-h-0 flex-1">
          {!collapsed && <EditorChatPanel />}

          <EditorPreview projectName={project?.name} />
        </div>
      </div>
    </BuilderProvider>
  );
}
