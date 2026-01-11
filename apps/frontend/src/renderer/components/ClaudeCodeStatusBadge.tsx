import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Terminal,
  Check,
  AlertTriangle,
  X,
  Loader2,
  Download,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { cn } from "../lib/utils";
import type { ClaudeCodeVersionInfo } from "../../shared/types/cli";

interface ClaudeCodeStatusBadgeProps {
  className?: string;
}

type StatusType = "loading" | "installed" | "outdated" | "not-found" | "error";

// Check every 24 hours
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Claude Code CLI status badge for the sidebar.
 * Shows installation status and provides quick access to install/update.
 */
export function ClaudeCodeStatusBadge({ className }: ClaudeCodeStatusBadgeProps) {
  const { t } = useTranslation(["common", "navigation"]);
  const [status, setStatus] = useState<StatusType>("loading");
  const [versionInfo, setVersionInfo] = useState<ClaudeCodeVersionInfo | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showUpdateWarning, setShowUpdateWarning] = useState(false);

  // Check Claude Code version
  const checkVersion = useCallback(async () => {
    try {
      if (!window.electronAPI?.checkClaudeCodeVersion) {
        setStatus("error");
        return;
      }

      const result = await window.electronAPI.checkClaudeCodeVersion();

      if (result.success && result.data) {
        setVersionInfo(result.data);
        setLastChecked(new Date());

        if (!result.data.installed) {
          setStatus("not-found");
        } else if (result.data.isOutdated) {
          setStatus("outdated");
        } else {
          setStatus("installed");
        }
      } else {
        setStatus("error");
      }
    } catch (err) {
      console.error("Failed to check Claude Code version:", err);
      setStatus("error");
    }
  }, []);

  // Initial check and periodic re-check
  useEffect(() => {
    checkVersion();

    // Set up periodic check
    const interval = setInterval(() => {
      checkVersion();
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [checkVersion]);

  // Perform the actual install/update
  const performInstall = async () => {
    setIsInstalling(true);
    setShowUpdateWarning(false);
    try {
      if (!window.electronAPI?.installClaudeCode) {
        return;
      }

      const result = await window.electronAPI.installClaudeCode();

      if (result.success) {
        // Re-check after a delay
        setTimeout(() => {
          checkVersion();
        }, 5000);
      }
    } catch (err) {
      console.error("Failed to install Claude Code:", err);
    } finally {
      setIsInstalling(false);
    }
  };

  // Handle install/update button click
  const handleInstall = () => {
    if (status === "outdated") {
      // Show warning for updates since it will close running Claude sessions
      setShowUpdateWarning(true);
    } else {
      // Fresh install - no warning needed
      performInstall();
    }
  };

  // Get status indicator color
  const getStatusColor = () => {
    switch (status) {
      case "installed":
        return "bg-green-500";
      case "outdated":
        return "bg-yellow-500";
      case "not-found":
      case "error":
        return "bg-destructive";
      default:
        return "bg-muted-foreground";
    }
  };

  // Get status icon
  const getStatusIcon = () => {
    switch (status) {
      case "loading":
        return <Loader2 className="h-3 w-3 animate-spin" />;
      case "installed":
        return <Check className="h-3 w-3" />;
      case "outdated":
        return <AlertTriangle className="h-3 w-3" />;
      case "not-found":
        return <X className="h-3 w-3" />;
      case "error":
        return <AlertTriangle className="h-3 w-3" />;
    }
  };

  // Get tooltip text
  const getTooltipText = () => {
    switch (status) {
      case "loading":
        return t("navigation:claudeCode.checking", "Checking Claude Code...");
      case "installed":
        return t("navigation:claudeCode.upToDate", "Claude Code is up to date");
      case "outdated":
        return t("navigation:claudeCode.updateAvailable", "Claude Code update available");
      case "not-found":
        return t("navigation:claudeCode.notInstalled", "Claude Code not installed");
      case "error":
        return t("navigation:claudeCode.error", "Error checking Claude Code");
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "w-full justify-start gap-2 text-xs",
                status === "not-found" || status === "error" ? "text-destructive" : "",
                status === "outdated" ? "text-yellow-600 dark:text-yellow-500" : "",
                className
              )}
            >
              <div className="relative">
                <Terminal className="h-4 w-4" />
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full",
                    getStatusColor()
                  )}
                />
              </div>
              <span className="truncate">Claude Code</span>
              {status === "outdated" && (
                <span className="ml-auto text-[10px] bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 rounded">
                  {t("common:update", "Update")}
                </span>
              )}
              {status === "not-found" && (
                <span className="ml-auto text-[10px] bg-destructive/20 text-destructive px-1.5 py-0.5 rounded">
                  {t("common:install", "Install")}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{getTooltipText()}</TooltipContent>
      </Tooltip>

      <PopoverContent side="right" align="end" className="w-72">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Terminal className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h4 className="text-sm font-medium">Claude Code CLI</h4>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {getStatusIcon()}
                {status === "installed" && t("navigation:claudeCode.installed", "Installed")}
                {status === "outdated" && t("navigation:claudeCode.outdated", "Update available")}
                {status === "not-found" && t("navigation:claudeCode.missing", "Not installed")}
                {status === "loading" && t("navigation:claudeCode.checking", "Checking...")}
                {status === "error" && t("navigation:claudeCode.error", "Error")}
              </p>
            </div>
          </div>

          {/* Version info */}
          {versionInfo && status !== "loading" && (
            <div className="text-xs space-y-1 p-2 bg-muted rounded-md">
              {versionInfo.installed && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("navigation:claudeCode.current", "Current")}:
                  </span>
                  <span className="font-mono">{versionInfo.installed}</span>
                </div>
              )}
              {versionInfo.latest && versionInfo.latest !== "unknown" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("navigation:claudeCode.latest", "Latest")}:
                  </span>
                  <span className="font-mono">{versionInfo.latest}</span>
                </div>
              )}
              {lastChecked && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("navigation:claudeCode.lastChecked", "Last checked")}:</span>
                  <span>{lastChecked.toLocaleTimeString()}</span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {(status === "not-found" || status === "outdated") && (
              <Button
                size="sm"
                className="flex-1 gap-1"
                onClick={handleInstall}
                disabled={isInstalling}
              >
                {isInstalling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
                {status === "outdated"
                  ? t("common:update", "Update")
                  : t("common:install", "Install")}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => checkVersion()}
              disabled={status === "loading"}
            >
              <RefreshCw className={cn("h-3 w-3", status === "loading" && "animate-spin")} />
              {t("common:refresh", "Refresh")}
            </Button>
          </div>

          {/* Learn more link */}
          <Button
            variant="link"
            size="sm"
            className="w-full text-xs text-muted-foreground gap-1"
            onClick={() => window.electronAPI?.openExternal?.("https://claude.ai/code")}
            aria-label={t(
              "navigation:claudeCode.learnMoreAriaLabel",
              "Learn more about Claude Code (opens in new window)"
            )}
          >
            {t("navigation:claudeCode.learnMore", "Learn more about Claude Code")}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Button>

          {/* Changelog link */}
          <Button
            variant="link"
            size="sm"
            className="w-full text-xs text-muted-foreground gap-1"
            onClick={() =>
              window.electronAPI?.openExternal?.(
                "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md"
              )
            }
            aria-label={t(
              "navigation:claudeCode.viewChangelogAriaLabel",
              "View Claude Code Changelog (opens in new window)"
            )}
          >
            {t("navigation:claudeCode.viewChangelog", "View Claude Code Changelog")}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Button>
        </div>
      </PopoverContent>

      {/* Update warning dialog */}
      <AlertDialog open={showUpdateWarning} onOpenChange={setShowUpdateWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("navigation:claudeCode.updateWarningTitle", "Update Claude Code?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "navigation:claudeCode.updateWarningDescription",
                "Updating will close all running Claude Code sessions. Any unsaved work in those sessions may be lost. Make sure to save your work before proceeding."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={performInstall}>
              {t("navigation:claudeCode.updateAnyway", "Update Anyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Popover>
  );
}
