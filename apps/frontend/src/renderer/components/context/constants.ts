import {
  Server,
  Globe,
  Cog,
  Code,
  Package,
  GitBranch,
  FileCode,
  Lightbulb,
  FolderTree,
  AlertTriangle
} from 'lucide-react';

// Service type icon mapping
export const serviceTypeIcons: Record<string, React.ElementType> = {
  backend: Server,
  frontend: Globe,
  worker: Cog,
  scraper: Code,
  library: Package,
  proxy: GitBranch,
  unknown: FileCode
};

// Service type color mapping
export const serviceTypeColors: Record<string, string> = {
  backend: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  frontend: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  worker: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  scraper: 'bg-green-500/10 text-green-400 border-green-500/30',
  library: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
  proxy: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  unknown: 'bg-muted text-muted-foreground border-muted'
};

// Memory type icon mapping
export const memoryTypeIcons: Record<string, React.ElementType> = {
  session_insight: Lightbulb,
  codebase_discovery: FolderTree,
  codebase_map: FolderTree,
  pattern: Code,
  gotcha: AlertTriangle
};
