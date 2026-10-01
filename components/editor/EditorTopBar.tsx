'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Code2,
  Download,
  FileImage,
  History,
  Loader2,
  RotateCcw,
  Save,
  Store,
} from 'lucide-react';
import { useBuilder } from './BuilderContext';
import ExportDialog from './ExportDialog';
import ModelPicker from './ModelPicker';
import ShopifyPushDialog from './ShopifyPushDialog';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSubscription } from '@/components/billing/SubscriptionProvider';
import UpgradeDialog from '@/components/billing/UpgradeDialog';
import { exportPagesAsCodeZip } from '@/lib/export/code';
import { exportPagesAsPng } from '@/lib/export/png';
import type { ExportPage } from '@/lib/shopify/types';

interface EditorTopBarProps {
  collapsed: boolean;
  onToggleSidebar: () => void;
  projectId: string;
  projectName: string;
}

/** Format a revision timestamp as a short relative label. */
function formatRevisionTime(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  const diffMs = Date.now() - time;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function EditorTopBar({
  collapsed,
  onToggleSidebar,
  projectId,
  projectName,
}: EditorTopBarProps) {
  const {
    pages,
    themeCss,
    styleGuide,
    aiModel,
    saveNow,
    saving,
    saveError,
    revisions,
    restoreRevision,
    undo,
  } = useBuilder();
  const { entitlement } = useSubscription();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  // Which direct export (code/png) is currently running, plus any last error.
  const [busy, setBusy] = useState<null | 'code' | 'png'>(null);
  const [pngStatus, setPngStatus] = useState('');
  const [exportError, setExportError] = useState('');
  const exportRef = useRef<HTMLDivElement>(null);
  // Save feedback + history popover state.
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // "Send to Shopify" push flow (OAuth + server-side theme install).
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pushOpen, setPushOpen] = useState(false);
  const [pushZip, setPushZip] = useState<{ url: string; fileName: string } | null>(null);

  // Only fully generated pages (with HTML) are exportable.
  const exportPages = useMemo<ExportPage[]>(
    () =>
      pages
        .filter((p) => p.html && p.html.trim())
        .map((p) => ({ key: p.id, label: p.label, type: p.type, path: p.path, html: p.html })),
    [pages]
  );
  const hasExportablePages = exportPages.length > 0;

  const EXPORT_OPTIONS = [
    { id: 'shopify', label: 'Export to Shopify', icon: Store, action: () => openExport() },
    { id: 'zip', label: 'Download ZIP', icon: Download, action: () => openExport() },
    { id: 'code', label: 'Export Code', icon: Code2, action: () => void runCodeExport() },
    { id: 'png', label: 'Export to PNG image', icon: FileImage, action: () => void runPngExport() },
  ];

  // Shopify theme export is a paid feature. Free users get the upgrade dialog
  // instead of the export flow (product spec §"Free Plan Limits").
  const canExport = entitlement?.canExport ?? false;

  function openExport() {
    setMenuOpen(false);
    if (!canExport) {
      setUpgradeOpen(true);
      return;
    }
    setDialogOpen(true);
  }

  async function runCodeExport() {
    if (busy) return;
    setMenuOpen(false);
    setExportError('');
    setBusy('code');
    try {
      await exportPagesAsCodeZip(exportPages, themeCss, projectName);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function runPngExport() {
    if (busy) return;
    setMenuOpen(false);
    setExportError('');
    setPngStatus('Rendering pages…');
    setBusy('png');
    try {
      await exportPagesAsPng(exportPages, themeCss, projectName, ({ processed, total, label }) => {
        setPngStatus(
          processed < total ? `Rendering ${label || 'page'}… (${processed + 1}/${total})` : 'Packaging…'
        );
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'PNG export failed. Please try again.');
    } finally {
      setBusy(null);
      setPngStatus('');
    }
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(event: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!historyOpen) return;
    function onClick(event: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setHistoryOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [historyOpen]);

  async function handleSave() {
    const ok = await saveNow();
    setSaveState(ok ? 'saved' : 'failed');
    if (ok) {
      setTimeout(() => setSaveState('idle'), 2500);
    }
  }

  async function handleRestore(id: string) {
    setRestoringId(id);
    const ok = await restoreRevision(id);
    setRestoringId(null);
    if (ok) setHistoryOpen(false);
  }

  return (
    <header className="relative flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[#ece6e2] bg-white px-4">
      <div className="flex items-center gap-3">
        <Image
          src="/logo.png"
          alt="Shopify Theme Builder"
          width={34}
          height={34}
          className="shrink-0 rounded-lg"
          priority
        />
        <span className="hidden text-[15px] font-bold text-[#111827] sm:block">
          Shopify Theme Builder
        </span>
        <button
          aria-label={collapsed ? 'Expand chat panel' : 'Collapse chat panel'}
          onClick={onToggleSidebar}
          className="grid h-8 w-8 place-items-center rounded-lg border border-[#e8e2de] bg-white text-[#4b5563] transition hover:bg-[#fff8f5]"
        >
          <ChevronLeft
            size={17}
            strokeWidth={2}
            className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <ModelPicker />

        <div className="relative" ref={exportRef}>
          <button
            onClick={() => setMenuOpen((open) => !open)}
            disabled={dialogOpen || busy !== null}
            className="flex h-11 items-center gap-2 rounded-xl border border-[#e8e2de] bg-white px-4 text-sm font-medium text-[#111827] shadow-[0_8px_20px_rgba(31,41,55,0.04)] transition hover:bg-[#fff8f5] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 size={16} strokeWidth={2} className="animate-spin text-[#ff6747]" />
                {busy === 'png' ? pngStatus || 'Exporting…' : 'Exporting…'}
              </>
            ) : (
              <>
                <Store size={17} strokeWidth={1.9} className="text-[#35b86b]" />
                Export to Shopify
                <ChevronDown
                  size={16}
                  strokeWidth={2}
                  className={`text-[#9aa2af] transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                />
              </>
            )}
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-2xl border border-[#eee7e3] bg-white p-2 shadow-[0_24px_48px_rgba(31,41,55,0.14)]">
              <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#9aa2af]">
                Export options
              </p>
              {!hasExportablePages && (
                <p className="px-3 pb-2 text-[11px] text-[#b7ada4]">
                  Generate a page first to enable export.
                </p>
              )}
              {EXPORT_OPTIONS.map((option) => {
                const Icon = option.icon;
                const needsPages = ['shopify', 'zip', 'code', 'png'].includes(option.id);
                const disabled = (needsPages && !hasExportablePages) || busy !== null;
                return (
                  <button
                    key={option.id}
                    onClick={option.action}
                    disabled={disabled}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#111827] transition hover:bg-[#fff3ef] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Icon size={17} strokeWidth={1.9} className="text-[#6b7280]" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}

          {exportError && !menuOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-xl border border-[#f6d5cf] bg-[#fdeceb] px-3.5 py-2.5 text-[12px] text-[#c0432f] shadow-[0_16px_32px_rgba(31,41,55,0.12)]">
              {exportError}
            </div>
          )}
        </div>

        {/* Revision history (undo/restore) popover. */}
        <div className="relative" ref={historyRef}>
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            disabled={saving || busy !== null}
            aria-label="Version history"
            title={revisions.length > 0 ? 'Version history' : 'No saved versions yet'}
            className="relative grid h-11 w-11 place-items-center rounded-xl border border-[#e8e2de] bg-white text-[#4b5563] shadow-[0_8px_20px_rgba(31,41,55,0.04)] transition hover:bg-[#fff8f5] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <History size={17} strokeWidth={1.9} />
            {revisions.length > 0 && (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#ff6747] px-1 text-[10px] font-bold text-white">
                {Math.min(revisions.length, 30)}
              </span>
            )}
          </button>

          {historyOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-50 max-h-[420px] w-80 overflow-y-auto rounded-2xl border border-[#eee7e3] bg-white p-2 shadow-[0_24px_48px_rgba(31,41,55,0.14)]">
              <div className="flex items-center justify-between px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9aa2af]">
                  Version history
                </p>
                <button
                  onClick={() => void undo()}
                  disabled={revisions.length === 0 || saving}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-[#ff6747] transition hover:bg-[#fff3ef] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RotateCcw size={12} strokeWidth={2.2} /> Undo last
                </button>
              </div>
              {revisions.length === 0 ? (
                <p className="px-3 pb-3 pt-1 text-xs text-[#9aa2af]">
                  Versions are saved automatically each time the AI changes your build, so you can
                  always go back.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {revisions.map((revision) => (
                    <li key={revision.id}>
                      <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 transition hover:bg-[#fff8f5]">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-[#111827]">
                            {revision.label || 'Update'}
                          </p>
                          <p className="text-[11px] text-[#9aa2af]">
                            {formatRevisionTime(revision.createdAt)}
                          </p>
                        </div>
                        <button
                          onClick={() => void handleRestore(revision.id)}
                          disabled={saving || restoringId !== null}
                          className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-[#ff6747] transition hover:bg-[#fff3ef] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {restoringId === revision.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            'Restore'
                          )}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Save button with live state. */}
        <button
          onClick={() => void handleSave()}
          disabled={saving || busy !== null}
          className="flex h-11 items-center gap-2 rounded-xl bg-[#ff6747] px-5 text-sm font-semibold text-white shadow-[0_12px_22px_rgba(255,103,71,0.2)] transition hover:bg-[#f85b3a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <Loader2 size={17} strokeWidth={2} className="animate-spin" />
          ) : saveState === 'saved' ? (
            <Check size={17} strokeWidth={2.4} />
          ) : (
            <Save size={17} strokeWidth={1.9} />
          )}
          {saving ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save'}
        </button>
      </div>

      {saveError && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-40 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-[#f6d5cf] bg-[#fdeceb] px-4 py-2.5 text-[13px] font-medium text-[#c0432f] shadow-[0_16px_32px_rgba(31,41,55,0.12)]">
            <span>
              Your last change couldn&apos;t be saved. It&apos;s still in the preview — try Save again.
            </span>
            <button
              onClick={() => void handleSave()}
              className="rounded-lg bg-[#c0432f] px-3 py-1 text-xs font-semibold text-white transition hover:bg-[#a83a28]"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <ExportDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        projectId={projectId}
        projectName={projectName}
        pages={exportPages}
        themeCss={themeCss}
        styleGuide={styleGuide}
        model={aiModel}
        onSendToShopify={(zipUrl, fileName) => {
          setPushZip({ url: zipUrl, fileName });
          setPushOpen(true);
        }}
      />

      {pushZip && (
        <ShopifyPushDialog
          open={pushOpen}
          onClose={() => {
            setPushOpen(false);
            setPushZip(null);
          }}
          projectId={projectId}
          projectName={projectName}
          zipUrl={pushZip.url}
          fileName={pushZip.fileName}
          returnTo={pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '')}
          justConnected={searchParams.get('shopify') === 'connected'}
        />
      )}

      <UpgradeDialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Exporting is a Pro feature"
        description="Upgrade to export your design as a Shopify theme ZIP and unlock unlimited projects."
      />
    </header>
  );
}
