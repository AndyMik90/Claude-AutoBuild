import { Terminal, Container, Rocket, Layers, Wrench, HelpCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Guide } from './types';

const iconMap = {
  terminal: Terminal,
  container: Container,
  rocket: Rocket,
  layers: Layers,
  wrench: Wrench,
  help: HelpCircle
} as const;

const categoryColors = {
  setup: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  usage: 'bg-green-500/10 text-green-500 border-green-500/20',
  reference: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  faq: 'bg-amber-500/10 text-amber-500 border-amber-500/20'
} as const;

const categoryLabels = {
  setup: 'Setup',
  usage: 'Usage',
  reference: 'Reference',
  faq: 'FAQ'
} as const;

interface GuideCardProps {
  guide: Guide;
  onClick: () => void;
}

export function GuideCard({ guide, onClick }: GuideCardProps) {
  const Icon = iconMap[guide.icon as keyof typeof iconMap] || Terminal;

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex flex-col gap-4 rounded-xl border border-border bg-card p-6',
        'text-left transition-all duration-200',
        'hover:border-primary/50 hover:bg-accent/50 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <span
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs font-medium',
            categoryColors[guide.category]
          )}
        >
          {categoryLabels[guide.category]}
        </span>
      </div>

      <div className="flex-1">
        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
          {guide.title}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
          {guide.description}
        </p>
      </div>

      <div className="flex items-center text-sm text-muted-foreground">
        <span className="group-hover:text-primary transition-colors">
          Read guide &rarr;
        </span>
      </div>
    </button>
  );
}
