'use client';

import { useEffect, useRef, useState } from 'react';import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  Store,
  Upload,
  X,
} from 'lucide-react';
import {
  beginShopifyConnect,
  disconnectShopify,
  fetchShopifyConnection,
  pushThemeToShopify,
  type ShopifyConnectionStatus,
} from '@/lib/shopify/push-client';

/**
 * "Send to Shopify" dialog (AGENTS.md §16). Two phases:
 *
 *   1. Not connected — the merchant types their `{store}.myshopify.com` address
 *      and is redirected to Shopify's OAuth authorize page. They come back to
 *      this exact dialog (returnTo is carried in the signed OAuth state) with
 *      `?shopify=connected` in the URL, which re-opens and advances the flow.
 *   2. Connected — one click installs the exported theme ZIP onto their store
 *      (server-side themeCreate from the ZIP's public URL) with an explicit
 *      choice to also publish it live. Publishing replaces the live theme, so
 *      it is opt-in, never automatic.
 */

type Phase = 'checking' | 'connect' | 'ready' | 'pushing' | 'done' | 'error';

interface ShopifyPushDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  /** Public download URL of the exported theme ZIP (required to push). */
  zipUrl: string;
  fileName: string;
  /** Path to return to after the OAuth round-trip (e.g. the editor page). */
  returnTo: string;
  /** True when the URL just came back from Shopify OAuth (?shopify=connected). */
  justConnected?: boolean;
}

function normalizeShop(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';
  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(trimmed)) return trimmed;
  // Accept "my-store" or "my-store.myshopify.com" typos and complete the domain.
  const slug = trimmed.replace(/\.?myshopify\.com$/, '').replace(/[^a-z0-9-]/g, '-');
  return slug ? `${slug}.myshopify.com` : '';
}

export default function ShopifyPushDialog({
  open,
  onClose,
  projectId,
  projectName,
  zipUrl,
  fileName,
  returnTo,
  justConnected = false,
}: ShopifyPushDialogProps) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [connection, setConnection] = useState<ShopifyConnectionStatus['connection'] | null>(null);
  const [shopInput, setShopInput] = useState('');
  const [publish, setPublish] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState('');
  const [doneInfo, setDoneInfo] = useState<{ shopDomain: string; published: boolean } | null>(null);
  // Bumped by "Try again" so the open-effect re-runs its connection check.
  const [reloadKey, setReloadKey] = useState(0);
  const shopRef = useRef<HTMLInputElement | null>(null);

  // On open (or "Try again"): check the connection state. All state updates
  // happen in the fetch's promise callbacks (never synchronously in the
  // effect body), so no cascading render is triggered.
  useEffect(() => {
    if (!open) return;
    let active = true;
    fetchShopifyConnection()
      .then((status) => {
        if (!active) return;
        if (status.connected && status.connection) {
          setConnection(status.connection);
          setPhase('ready');
        } else {
          setConnection(null);
          setPhase('connect');
        }
      })
      .catch(() => {
        if (!active) return;
        setError('Could not check your Shopify connection. Please try again.');
        setPhase('error');
      });
    return () => {
      active = false;
    };
  }, [open, reloadKey]);

  // Autofocus the shop field when the connect form appears.
  useEffect(() => {
    if (open && phase === 'connect') shopRef.current?.focus();
  }, [open, phase]);

  if (!open) return null;

  const startConnect = async () => {
    const shop = normalizeShop(shopInput);
    if (!shop) {
      setError('Enter your store address, e.g. my-store.myshopify.com.');
      return;
    }
    setConnecting(true);
    setError('');
    try {
      const { authorizeUrl } = await beginShopifyConnect({ shop, returnTo });
      window.location.href = authorizeUrl; // full redirect to Shopify
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the Shopify connection.');
      setConnecting(false);
    }
  };

  const startPush = async () => {
    setPushing(true);
    setError('');
    try {
      const result = await pushThemeToShopify({
        projectId,
        projectName,
        zipUrl,
        publish,
      });
      setDoneInfo({ shopDomain: result.shopDomain, published: result.published });
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sending the theme to Shopify failed.');
      setPhase('error');
    } finally {
      setPushing(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectShopify();
      setConnection(null);
      setPhase('connect');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect the store.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Send to Shopify"
          className="w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--app-shadow-lg)]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-success-soft">
                <Store size={18} strokeWidth={2} className="text-success" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-fg">Send to Shopify</h2>
                <p className="truncate text-[11px] text-muted">{projectName || 'Storefront theme'}</p>
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

          <div className="px-5 py-5">
            {phase === 'checking' && (
              <div className="flex items-center gap-3 py-6 text-sm text-fg-2">
                <Loader2 size={18} className="animate-spin text-accent-text" />
                Checking your Shopify connection…
              </div>
            )}

            {phase === 'connect' && (
              <div>
                {justConnected && (
                  <p className="mb-4 rounded-xl bg-success-soft px-3.5 py-2.5 text-[13px] text-success">
                    Store connected — but we couldn&apos;t find the theme to send. Start the export
                    again and choose &ldquo;Send to Shopify&rdquo;.
                  </p>
                )}
                <p className="text-sm leading-6 text-fg-2">
                  Connect your Shopify store once. We&apos;ll ask Shopify for permission to manage
                  your store&apos;s themes, then install this theme for you — no manual ZIP upload.
                </p>
                <label className="mt-4 block text-[13px] font-semibold text-fg">
                  Store address
                </label>
                <div className="mt-1.5 flex items-center rounded-xl border-2 border-line px-3 focus-within:border-accent">
                  <Globe size={15} className="shrink-0 text-muted" />
                  <input
                    ref={shopRef}
                    value={shopInput}
                    onChange={(e) => setShopInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void startConnect();
                    }}
                    placeholder="my-store.myshopify.com"
                    autoComplete="url"
                    className="h-11 w-full bg-transparent px-2.5 text-sm text-fg outline-none placeholder:text-muted"
                  />
                </div>
                {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
                <button
                  onClick={() => void startConnect()}
                  disabled={connecting}
                  className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg transition hover:bg-accent-hover disabled:opacity-60"
                >
                  {connecting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Redirecting to Shopify…
                    </>
                  ) : (
                    <>
                      <ExternalLink size={16} strokeWidth={2} />
                      Continue with Shopify
                    </>
                  )}
                </button>
                <p className="mt-3 text-center text-[11px] leading-4 text-muted">
                  You&apos;ll approve access on shopify.com. We only request theme permissions,
                  and your token is stored server-side.
                </p>
              </div>
            )}

            {phase === 'ready' && connection && (
              <div>
                <div className="flex items-center gap-3 rounded-xl border border-line bg-elevated px-3.5 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-card ring-1 ring-line">
                    <Store size={16} className="text-success" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-fg">
                      {connection.shopName ?? connection.shopDomain}
                    </p>
                    <p className="text-[11px] text-muted">{connection.shopDomain}</p>
                  </div>
                  <button
                    onClick={() => void handleDisconnect()}
                    className="shrink-0 text-[11.5px] font-medium text-muted underline-offset-2 hover:text-danger hover:underline"
                  >
                    Disconnect
                  </button>
                </div>

                <p className="mt-4 text-sm leading-6 text-fg-2">
                  Install <span className="font-semibold text-fg">{fileName}</span> as a new
                  theme on your store. It arrives <span className="font-semibold">unpublished</span>{' '}
                  so you can review it in your Shopify admin first.
                </p>

                <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-line px-3.5 py-3">
                  <input
                    type="checkbox"
                    checked={publish}
                    onChange={(e) => setPublish(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-accent"
                  />
                  <span className="text-[13px] leading-5 text-fg-2">
                    <span className="font-semibold text-fg">Also publish it live</span> —
                    replaces your current live theme immediately. Leave unchecked to review first.
                  </span>
                </label>

                {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}

                <button
                  onClick={() => void startPush()}
                  disabled={pushing}
                  className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg transition hover:bg-accent-hover disabled:opacity-60"
                >
                  {pushing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Installing on your store…
                    </>
                  ) : (
                    <>
                      <Upload size={16} strokeWidth={2} />
                      {publish ? 'Install & publish theme' : 'Install theme'}
                    </>
                  )}
                </button>
                <p className="mt-3 text-center text-[11px] text-muted">
                  Shopify imports the ZIP in the background — it may take a minute to appear under
                  Online Store → Themes.
                </p>
              </div>
            )}

            {phase === 'pushing' && (
              <div className="flex items-center gap-3 py-6 text-sm text-fg-2">
                <Loader2 size={18} className="animate-spin text-accent-text" />
                Installing the theme on your store…
              </div>
            )}

            {phase === 'done' && doneInfo && (
              <div className="text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success-soft">
                  <CheckCircle2 size={30} strokeWidth={2} className="text-success" />
                </span>
                <h3 className="mt-3 text-base font-bold text-fg">
                  {doneInfo.published ? 'Theme is live' : 'Theme installed'}
                </h3>
                <p className="mt-1 text-[13px] leading-6 text-fg-2">
                  {doneInfo.published
                    ? `Your theme is now the live theme on ${doneInfo.shopDomain}.`
                    : `The theme was sent to ${doneInfo.shopDomain}. Review and publish it under Online Store → Themes.`}
                </p>
                <a
                  href={`https://${doneInfo.shopDomain}/admin/themes`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-5 flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg transition hover:bg-accent-hover"
                >
                  <ExternalLink size={16} strokeWidth={2} />
                  Open Shopify themes
                </a>
                <button
                  onClick={onClose}
                  className="mt-2.5 flex h-10 w-full items-center justify-center rounded-xl px-4 text-sm font-medium text-fg-2 transition hover:bg-elevated"
                >
                  Done
                </button>
              </div>
            )}

            {phase === 'error' && !['connect', 'ready'].includes(phase) && (
              <div className="text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-soft">
                  <AlertTriangle size={28} strokeWidth={2} className="text-danger" />
                </span>
                <h3 className="mt-3 text-base font-bold text-fg">Something went wrong</h3>
                <p className="mt-1 break-words text-[13px] text-fg-2">{error}</p>
                <button
                  onClick={() => {
                    setPhase('checking');
                    setReloadKey((k) => k + 1);
                  }}
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
