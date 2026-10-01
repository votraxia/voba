'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components';
import { useSubscription } from '@/components/billing/SubscriptionProvider';
import UpgradeDialog from '@/components/billing/UpgradeDialog';
import { savePendingPrompt } from '@/lib/pending-prompt';
import { createProject, ProjectLimitError } from '@/lib/projects';

/**
 * Owns the landing page's hero prompt so two separate sections can drive it:
 * the composer itself, and the templates section ("use this prompt" fills the
 * composer and scrolls back up to it).
 *
 * Submitting runs the same real flow as the in-app dashboard: a signed-out
 * visitor is sent to sign up with their prompt kept in sessionStorage, a Free
 * user at their project limit gets the upgrade dialog, and everyone else gets a
 * project created server-side and lands in the builder.
 */
interface LandingPromptValue {
  prompt: string;
  setPrompt: (value: string) => void;
  submitting: boolean;
  error: string | null;
  submit: (value?: string) => void;
  /** Fill the composer with a starting point, then focus it. */
  applyStartingPoint: (value: string) => void;
  registerComposer: (element: HTMLTextAreaElement | null) => void;
}

const LandingPromptContext = createContext<LandingPromptValue | null>(null);

export function LandingPromptProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { entitlement, refresh: refreshEntitlement } = useSubscription();

  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const registerComposer = useCallback((element: HTMLTextAreaElement | null) => {
    composerRef.current = element;
  }, []);

  const applyStartingPoint = useCallback((value: string) => {
    setPrompt(value);
    setError(null);
    const composer = composerRef.current;
    if (composer) {
      composer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      composer.focus({ preventScroll: true });
    }
  }, []);

  const submit = useCallback(
    (value?: string) => {
      const trimmed = (value ?? prompt).trim();
      if (!trimmed || submitting) return;

      // Not signed in yet: keep the prompt and send them through sign up. The
      // dashboard restores it once they are inside the app.
      if (!authLoading && !user) {
        savePendingPrompt(trimmed);
        router.push('/sign-up');
        return;
      }

      // Fast path: if we already know the Free limit is reached, skip the
      // round-trip. The server still enforces this authoritatively.
      if (entitlement && !entitlement.canCreateProject) {
        setUpgradeOpen(true);
        return;
      }

      setSubmitting(true);
      setError(null);

      void (async () => {
        try {
          const project = await createProject(trimmed);
          router.push(`/editor/${project.id}`);
        } catch (err) {
          if (err instanceof ProjectLimitError) {
            setUpgradeOpen(true);
            void refreshEntitlement();
          } else {
            setError(
              err instanceof Error ? err.message : 'Something went wrong. Please try again.'
            );
          }
          setSubmitting(false);
        }
      })();
    },
    [
      authLoading,
      entitlement,
      prompt,
      refreshEntitlement,
      router,
      submitting,
      user,
    ]
  );

  const value = useMemo<LandingPromptValue>(
    () => ({
      prompt,
      setPrompt,
      submitting,
      error,
      submit,
      applyStartingPoint,
      registerComposer,
    }),
    [applyStartingPoint, error, prompt, registerComposer, submit, submitting]
  );

  return (
    <LandingPromptContext.Provider value={value}>
      {children}
      <UpgradeDialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="You’ve reached your project limit"
        description="The Free plan includes 2 projects. Upgrade to create unlimited projects and export Shopify themes."
      />
    </LandingPromptContext.Provider>
  );
}

export function useLandingPrompt(): LandingPromptValue {
  const context = useContext(LandingPromptContext);
  if (!context) {
    throw new Error('useLandingPrompt must be used within a LandingPromptProvider');
  }
  return context;
}
