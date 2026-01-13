import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, Minus, Square, Minimize2 } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { SortableProjectTab } from "./SortableProjectTab";
import { UsageIndicator } from "./UsageIndicator";
import type { Project } from "../../shared/types";

interface ProjectTabBarProps {
  projects: Project[];
  activeProjectId: string | null;
  onProjectSelect: (projectId: string) => void;
  onProjectClose: (projectId: string) => void;
  onAddProject: () => void;
  className?: string;
  // Control props for active tab
  onSettingsClick?: () => void;
}

const isMac =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Macintosh");
const showCustomControls = !isMac;

export function ProjectTabBar({
  projects,
  activeProjectId,
  onProjectSelect,
  onProjectClose,
  onAddProject,
  className,
  onSettingsClick,
}: ProjectTabBarProps) {
  const { t } = useTranslation("common");
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    // Listen for window state changes
    const cleanupMaximized = window.electronAPI?.onWindowMaximizedChange
      ? window.electronAPI.onWindowMaximizedChange(setIsMaximized)
      : undefined;

    const cleanupFullscreen = window.electronAPI?.onWindowFullscreenChange
      ? window.electronAPI.onWindowFullscreenChange(setIsFullscreen)
      : undefined;

    return () => {
      if (cleanupMaximized) cleanupMaximized();
      if (cleanupFullscreen) cleanupFullscreen();
    };
  }, []);

  // Keyboard shortcuts for tab navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if in input fields
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      // Cmd/Ctrl + 1-9: Switch to tab N
      if (e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (index < projects.length) {
          onProjectSelect(projects[index].id);
        }
        return;
      }

      // Cmd/Ctrl + Tab: Next tab
      // Cmd/Ctrl + Shift + Tab: Previous tab
      if (e.key === "Tab") {
        e.preventDefault();
        const currentIndex = projects.findIndex(
          (p) => p.id === activeProjectId
        );
        if (currentIndex === -1 || projects.length === 0) return;

        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + projects.length) % projects.length
          : (currentIndex + 1) % projects.length;
        onProjectSelect(projects[nextIndex].id);
        return;
      }

      // Cmd/Ctrl + W: Close current tab (only if more than one tab)
      if (e.key === "w" && activeProjectId && projects.length > 1) {
        e.preventDefault();
        onProjectClose(activeProjectId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [projects, activeProjectId, onProjectSelect, onProjectClose]);

  if (isFullscreen) {
    return null;
  }

  return (
    <div
      role="toolbar"
      className={cn(
        "flex items-center border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 h-12 electron-drag z-50 relative",
        "overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent",
        className
      )}
      onDoubleClick={() => {
        window.electronAPI?.maximizeWindow();
      }}
    >
      <div className="flex items-center flex-1 min-w-0">
        {projects.map((project, index) => {
          const isActiveTab = activeProjectId === project.id;
          return (
            <SortableProjectTab
              key={project.id}
              project={project}
              isActive={isActiveTab}
              canClose={projects.length > 1}
              tabIndex={index}
              onSelect={() => onProjectSelect(project.id)}
              onClose={(e) => {
                e.stopPropagation();
                onProjectClose(project.id);
              }}
              // Pass control props only for active tab
              onSettingsClick={isActiveTab ? onSettingsClick : undefined}
              onDoubleClick={() => window.electronAPI?.maximizeWindow()}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-2 px-2 py-1 electron-no-drag">
        <UsageIndicator />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onAddProject}
          aria-label={t("projectTab.addProjectAriaLabel")}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Window Controls - Windows & Linux */}
      {showCustomControls && (
        <div className="flex items-center gap-1 px-2 electron-no-drag border-l border-border/40 ml-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-muted"
            onClick={() => window.electronAPI?.minimizeWindow()}
            aria-label={t("window.controls.minimize")}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-muted"
            onClick={() => window.electronAPI?.maximizeWindow()}
            aria-label={
              isMaximized
                ? t("window.controls.restore")
                : t("window.controls.maximize")
            }
          >
            {isMaximized ? (
              <Minimize2 className="h-3 w-3" />
            ) : (
              <Square className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground transition-colors"
            onClick={() => window.electronAPI?.closeWindow()}
            aria-label={t("window.controls.close")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
