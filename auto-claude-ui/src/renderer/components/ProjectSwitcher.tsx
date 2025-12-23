/**
 * ProjectSwitcher - Command palette for quickly switching between projects
 *
 * Features:
 * - Searchable list of all registered projects
 * - Keyboard navigation (arrow keys + Enter)
 * - Recent projects shown first
 * - Shows project path for disambiguation
 * - Opens with Cmd+P / Ctrl+P
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Folder, FolderOpen, Plus, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from './ui/dialog';
import { Input } from './ui/input';
import { cn } from '../lib/utils';
import type { Project } from '../../shared/types';

interface ProjectSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  activeProjectId: string | null;
  recentProjectIds?: string[];
  onProjectSelect: (projectId: string) => void;
  onAddProject: () => void;
}

export function ProjectSwitcher({
  open,
  onOpenChange,
  projects,
  activeProjectId,
  recentProjectIds = [],
  onProjectSelect,
  onAddProject,
}: ProjectSwitcherProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Sort projects: recent first, then alphabetically
  const sortedProjects = useMemo(() => {
    const filtered = projects.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.path.toLowerCase().includes(search.toLowerCase())
    );

    // Separate recent and other projects
    const recent: Project[] = [];
    const other: Project[] = [];

    filtered.forEach((p) => {
      if (recentProjectIds.includes(p.id)) {
        recent.push(p);
      } else {
        other.push(p);
      }
    });

    // Sort recent by their order in recentProjectIds
    recent.sort((a, b) =>
      recentProjectIds.indexOf(a.id) - recentProjectIds.indexOf(b.id)
    );

    // Sort other alphabetically
    other.sort((a, b) => a.name.localeCompare(b.name));

    return [...recent, ...other];
  }, [projects, search, recentProjectIds]);

  // Reset selection when search changes or dialog opens
  useEffect(() => {
    setSelectedIndex(0);
  }, [search, open]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const itemCount = sortedProjects.length + 1; // +1 for "Add Project" option

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % itemCount);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + itemCount) % itemCount);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex < sortedProjects.length) {
          const project = sortedProjects[selectedIndex];
          onProjectSelect(project.id);
          onOpenChange(false);
        } else {
          // "Add Project" option
          onAddProject();
          onOpenChange(false);
        }
        break;
      case 'Escape':
        onOpenChange(false);
        break;
    }
  }, [sortedProjects, selectedIndex, onProjectSelect, onAddProject, onOpenChange]);

  const handleProjectClick = (projectId: string) => {
    onProjectSelect(projectId);
    onOpenChange(false);
  };

  const handleAddProjectClick = () => {
    onAddProject();
    onOpenChange(false);
  };

  // Get shortened path for display
  const getShortPath = (fullPath: string) => {
    const home = '/Users/';
    if (fullPath.startsWith(home)) {
      const afterHome = fullPath.slice(home.length);
      const firstSlash = afterHome.indexOf('/');
      if (firstSlash > 0) {
        return '~' + afterHome.slice(firstSlash);
      }
    }
    return fullPath;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg p-0 gap-0 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center border-b border-border px-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-12"
          />
          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Project List */}
        <div
          ref={listRef}
          className="max-h-[400px] overflow-y-auto py-2"
        >
          {sortedProjects.length === 0 && search && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No projects found matching "{search}"
            </div>
          )}

          {sortedProjects.map((project, index) => {
            const isActive = project.id === activeProjectId;
            const isSelected = index === selectedIndex;
            const isRecent = recentProjectIds.includes(project.id);

            return (
              <button
                key={project.id}
                data-index={index}
                onClick={() => handleProjectClick(project.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                  isSelected && "bg-accent",
                  !isSelected && "hover:bg-accent/50"
                )}
              >
                <div className={cn(
                  "shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {isActive ? (
                    <FolderOpen className="h-5 w-5" />
                  ) : (
                    <Folder className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-medium truncate",
                      isActive && "text-primary"
                    )}>
                      {project.name}
                    </span>
                    {isRecent && !isActive && (
                      <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    {isActive && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {getShortPath(project.path)}
                  </div>
                </div>
              </button>
            );
          })}

          {/* Add Project Option */}
          <button
            data-index={sortedProjects.length}
            onClick={handleAddProjectClick}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-t border-border mt-2",
              selectedIndex === sortedProjects.length && "bg-accent",
              selectedIndex !== sortedProjects.length && "hover:bg-accent/50"
            )}
          >
            <div className="shrink-0 text-muted-foreground">
              <Plus className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <span className="font-medium">Add Project</span>
              <div className="text-xs text-muted-foreground">
                Open a folder to add as a new project
              </div>
            </div>
          </button>
        </div>

        {/* Footer with keyboard hints */}
        <div className="border-t border-border px-4 py-2 flex items-center justify-between text-xs text-muted-foreground bg-muted/30">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border">↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border">↵</kbd>
              Select
            </span>
          </div>
          <span>{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
