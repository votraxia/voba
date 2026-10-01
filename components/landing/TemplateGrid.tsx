'use client';

import { ArrowRight } from 'lucide-react';
import { startingPoints } from '@/components/starting-points';
import { useLandingPrompt } from './LandingPromptProvider';

/**
 * The four pages every generated theme starts with. Choosing one fills the hero
 * composer with a complete brief and scrolls back up to it, so the click always
 * leads somewhere real instead of a dead "learn more" link.
 */
export default function TemplateGrid() {
  const { applyStartingPoint } = useLandingPrompt();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {startingPoints.map((point) => {
        const Icon = point.icon;
        return (
          <button
            key={point.id}
            type="button"
            onClick={() => applyStartingPoint(point.prompt)}
            className="group flex h-full flex-col rounded-2xl border border-line bg-card p-5 text-left shadow-[var(--app-shadow-sm)] transition hover:-translate-y-0.5 hover:border-accent-line hover:shadow-[var(--app-shadow-md)]"
          >
            <span className={`grid h-11 w-11 place-items-center rounded-xl ${point.colour}`}>
              <Icon size={20} strokeWidth={1.9} />
            </span>
            <h3 className="mt-4 text-[15px] font-semibold text-fg">{point.title}</h3>
            <p className="mt-1.5 text-[13px] leading-5 text-fg-2">{point.desc}</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent-text">
              Use this prompt
              <ArrowRight
                size={14}
                strokeWidth={2.2}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
