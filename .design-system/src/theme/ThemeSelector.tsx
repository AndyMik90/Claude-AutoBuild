import { useState } from 'react'
import { ChevronLeft, Check, Sun, Moon } from 'lucide-react'
import { cn } from '../lib/utils'
import { ColorTheme, Mode, ColorThemeDefinition } from './types'

interface ThemeSelectorProps {
  colorTheme: ColorTheme
  mode: Mode
  onColorThemeChange: (theme: ColorTheme) => void
  onModeToggle: () => void
  themes: ColorThemeDefinition[]
}

export function ThemeSelector({
  colorTheme,
  mode,
  onColorThemeChange,
  onModeToggle,
  themes
}: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Find theme with fallback to first theme (default)
  const currentTheme = themes.find(t => t.id === colorTheme) || themes[0]

  return (
    <div className="flex items-center gap-3">
      {/* Color Theme Dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-(--color-background-secondary) hover:bg-(--color-border-default) transition-colors"
        >
          <div
            className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
            style={{ backgroundColor: mode === 'dark' ? currentTheme.previewColors.accent : currentTheme.previewColors.bg }}
          />
          <span className="text-body-medium font-medium">{currentTheme.name}</span>
          <ChevronLeft className={cn(
            "w-4 h-4 text-(--color-text-tertiary) transition-transform",
            isOpen ? "rotate-90" : "-rotate-90"
          )} />
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute top-full right-0 mt-2 w-64 p-2 bg-(--color-surface-card) rounded-lg shadow-lg border border-(--color-border-default) z-50">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => {
                    onColorThemeChange(theme.id)
                    setIsOpen(false)
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-left",
                    colorTheme === theme.id
                      ? "bg-(--color-accent-primary-light)"
                      : "hover:bg-(--color-background-secondary)"
                  )}
                >
                  <div className="flex -space-x-1">
                    <div
                      className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                      style={{ backgroundColor: theme.previewColors.bg }}
                    />
                    <div
                      className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                      style={{ backgroundColor: theme.previewColors.accent }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-medium font-medium">{theme.name}</p>
                    <p className="text-body-small text-(--color-text-tertiary) truncate">{theme.description}</p>
                  </div>
                  {colorTheme === theme.id && (
                    <Check className="w-4 h-4 text-(--color-accent-primary)" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Light/Dark Toggle */}
      <button
        onClick={onModeToggle}
        className="p-2 rounded-lg bg-(--color-background-secondary) hover:bg-(--color-border-default) transition-colors"
        aria-label={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
      >
        {mode === 'light' ? (
          <Moon className="w-5 h-5 text-(--color-text-secondary)" />
        ) : (
          <Sun className="w-5 h-5 text-(--color-text-secondary)" />
        )}
      </button>
    </div>
  )
}
