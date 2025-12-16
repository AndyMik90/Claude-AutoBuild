import { useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion'
import {
  RotateCcw,
  Sparkles,
  Zap,
  Heart,
  Star,
  Plus,
  Minus,
  ChevronLeft,
  Check,
  X,
  Sun,
  Moon
} from 'lucide-react'
import { cn } from './lib/utils'

// Import refactored modules
import { useTheme, ThemeSelector, ColorTheme, Mode, COLOR_THEMES } from './theme'
import { Button, Badge, Avatar, AvatarGroup, Card, Input, Toggle, ProgressCircle } from './components'
import {
  ProfileCard,
  NotificationsCard,
  CalendarCard,
  TeamMembersCard,
  ProjectStatusCard,
  MilestoneCard,
  IntegrationsCard
} from './demo-cards'
import { animationVariants, transitions } from './animations'

// ============================================
// MAIN APP
// ============================================

export default function App() {
  const [activeSection, setActiveSection] = useState('overview')
  const { colorTheme, mode, setColorTheme, toggleMode, themes } = useTheme()

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'colors', label: 'Colors' },
    { id: 'typography', label: 'Typography' },
    { id: 'components', label: 'Components' },
    { id: 'animations', label: 'Animations' },
    { id: 'themes', label: 'Themes' }
  ]

  const currentThemeInfo = themes.find(t => t.id === colorTheme) || themes[0]

  return (
    <div className="min-h-screen p-8 transition-colors duration-300">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <Card className="rounded-2xl!">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-display-medium">Auto-Build Design System</h1>
              <p className="text-body-large text-(--color-text-secondary) mt-1">
                A modern, friendly design system for building beautiful interfaces
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Theme Selector */}
              <ThemeSelector
                colorTheme={colorTheme}
                mode={mode}
                onColorThemeChange={setColorTheme}
                onModeToggle={toggleMode}
                themes={themes}
              />

              {/* Section Navigation */}
              <div className="flex gap-2">
                {sections.map((section) => (
                  <Button
                    key={section.id}
                    variant={activeSection === section.id ? 'primary' : 'ghost'}
                    pill
                    onClick={() => setActiveSection(section.id)}
                  >
                    {section.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        {activeSection === 'overview' && (
          <div className="space-y-8">
            {/* Demo Cards Grid - Replicating the screenshot layout */}
            <section>
              <h2 className="text-heading-large mb-6">Component Showcase</h2>
              <div className="flex flex-wrap gap-6">
                <ProfileCard />
                <CalendarCard />
                <ProjectStatusCard />
              </div>
              <div className="flex flex-wrap gap-6 mt-6">
                <NotificationsCard />
                <TeamMembersCard />
                <div className="space-y-6">
                  <MilestoneCard />
                  <IntegrationsCard />
                </div>
              </div>
            </section>
          </div>
        )}

        {activeSection === 'colors' && (
          <div className="space-y-8">
            <Card>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-heading-large">Color Palette</h2>
                <p className="text-body-small text-(--color-text-tertiary)">
                  Currently showing: <strong className="text-(--color-text-primary)">{currentThemeInfo.name}</strong> theme
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-heading-small mb-3">Background</h3>
                  <div className="flex gap-4">
                    <div className="text-center">
                      <div className="w-20 h-20 rounded-lg bg-(--color-background-primary) border border-(--color-border-default)" />
                      <p className="text-label-small mt-2">Primary</p>
                      <p className="text-body-small text-(--color-text-tertiary)">--bg-primary</p>
                    </div>
                    <div className="text-center">
                      <div className="w-20 h-20 rounded-lg bg-(--color-background-secondary) border border-(--color-border-default)" />
                      <p className="text-label-small mt-2">Secondary</p>
                      <p className="text-body-small text-(--color-text-tertiary)">--bg-secondary</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-heading-small mb-3">Accent</h3>
                  <div className="flex gap-4">
                    <div className="text-center">
                      <div className="w-20 h-20 rounded-lg bg-(--color-accent-primary)" />
                      <p className="text-label-small mt-2">Primary</p>
                      <p className="text-body-small text-(--color-text-tertiary)">--accent</p>
                    </div>
                    <div className="text-center">
                      <div className="w-20 h-20 rounded-lg bg-(--color-accent-primary-hover)" />
                      <p className="text-label-small mt-2">Hover</p>
                      <p className="text-body-small text-(--color-text-tertiary)">--accent-hover</p>
                    </div>
                    <div className="text-center">
                      <div className="w-20 h-20 rounded-lg bg-(--color-accent-primary-light) border border-(--color-border-default)" />
                      <p className="text-label-small mt-2">Light</p>
                      <p className="text-body-small text-(--color-text-tertiary)">--accent-light</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-heading-small mb-3">Semantic</h3>
                  <div className="flex gap-4">
                    <div className="text-center">
                      <div className="w-20 h-20 rounded-lg bg-(--color-semantic-success)" />
                      <p className="text-label-small mt-2">Success</p>
                      <p className="text-body-small text-(--color-text-tertiary)">--success</p>
                    </div>
                    <div className="text-center">
                      <div className="w-20 h-20 rounded-lg bg-(--color-semantic-warning)" />
                      <p className="text-label-small mt-2">Warning</p>
                      <p className="text-body-small text-(--color-text-tertiary)">--warning</p>
                    </div>
                    <div className="text-center">
                      <div className="w-20 h-20 rounded-lg bg-(--color-semantic-error)" />
                      <p className="text-label-small mt-2">Error</p>
                      <p className="text-body-small text-(--color-text-tertiary)">--error</p>
                    </div>
                    <div className="text-center">
                      <div className="w-20 h-20 rounded-lg bg-(--color-semantic-info)" />
                      <p className="text-label-small mt-2">Info</p>
                      <p className="text-body-small text-(--color-text-tertiary)">--info</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-heading-small mb-3">Text</h3>
                  <div className="flex gap-4">
                    <div className="text-center">
                      <div className="w-20 h-20 rounded-lg bg-(--color-text-primary)" />
                      <p className="text-label-small mt-2">Primary</p>
                      <p className="text-body-small text-(--color-text-tertiary)">--text-primary</p>
                    </div>
                    <div className="text-center">
                      <div className="w-20 h-20 rounded-lg bg-(--color-text-secondary)" />
                      <p className="text-label-small mt-2">Secondary</p>
                      <p className="text-body-small text-(--color-text-tertiary)">--text-secondary</p>
                    </div>
                    <div className="text-center">
                      <div className="w-20 h-20 rounded-lg bg-(--color-text-tertiary)" />
                      <p className="text-label-small mt-2">Tertiary</p>
                      <p className="text-body-small text-(--color-text-tertiary)">--text-tertiary</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Theme-specific color values */}
              <div className="mt-8 p-4 bg-(--color-background-secondary) rounded-lg">
                <p className="text-body-small text-(--color-text-secondary)">
                  <strong>Note:</strong> Colors vary by theme and mode. Switch themes using the dropdown above to see different palettes.
                  For specific hex values, see the <strong>Themes</strong> tab or check <code className="font-mono bg-(--color-background-neutral) px-1 rounded">design.json</code>.
                </p>
              </div>
            </Card>
          </div>
        )}

        {activeSection === 'typography' && (
          <div className="space-y-8">
            <Card>
              <h2 className="text-heading-large mb-6">Typography Scale</h2>

              <div className="space-y-6">
                <div className="border-b border-(--color-border-default) pb-4">
                  <p className="text-label-small text-(--color-text-tertiary) mb-2">Display Large • 36px / 700</p>
                  <p className="text-display-large">The quick brown fox jumps</p>
                </div>
                <div className="border-b border-(--color-border-default) pb-4">
                  <p className="text-label-small text-(--color-text-tertiary) mb-2">Display Medium • 30px / 700</p>
                  <p className="text-display-medium">The quick brown fox jumps over</p>
                </div>
                <div className="border-b border-(--color-border-default) pb-4">
                  <p className="text-label-small text-(--color-text-tertiary) mb-2">Heading Large • 24px / 600</p>
                  <p className="text-heading-large">The quick brown fox jumps over the lazy dog</p>
                </div>
                <div className="border-b border-(--color-border-default) pb-4">
                  <p className="text-label-small text-(--color-text-tertiary) mb-2">Heading Medium • 20px / 600</p>
                  <p className="text-heading-medium">The quick brown fox jumps over the lazy dog</p>
                </div>
                <div className="border-b border-(--color-border-default) pb-4">
                  <p className="text-label-small text-(--color-text-tertiary) mb-2">Heading Small • 16px / 600</p>
                  <p className="text-heading-small">The quick brown fox jumps over the lazy dog</p>
                </div>
                <div className="border-b border-(--color-border-default) pb-4">
                  <p className="text-label-small text-(--color-text-tertiary) mb-2">Body Large • 16px / 400</p>
                  <p className="text-body-large">The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.</p>
                </div>
                <div className="border-b border-(--color-border-default) pb-4">
                  <p className="text-label-small text-(--color-text-tertiary) mb-2">Body Medium • 14px / 400</p>
                  <p className="text-body-medium">The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.</p>
                </div>
                <div>
                  <p className="text-label-small text-(--color-text-tertiary) mb-2">Body Small • 12px / 400</p>
                  <p className="text-body-small">The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {activeSection === 'components' && (
          <div className="space-y-8">
            {/* Buttons */}
            <Card>
              <h2 className="text-heading-large mb-6">Buttons</h2>

              <div className="space-y-6">
                <div>
                  <h3 className="text-heading-small mb-3">Variants</h3>
                  <div className="flex flex-wrap gap-4">
                    <Button variant="primary">Primary</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="success">Success</Button>
                    <Button variant="danger">Danger</Button>
                  </div>
                </div>

                <div>
                  <h3 className="text-heading-small mb-3">Pill Buttons</h3>
                  <div className="flex flex-wrap gap-4">
                    <Button variant="primary" pill>Primary Pill</Button>
                    <Button variant="secondary" pill>Secondary Pill</Button>
                    <Button variant="ghost" pill>Ghost Pill</Button>
                  </div>
                </div>

                <div>
                  <h3 className="text-heading-small mb-3">Sizes</h3>
                  <div className="flex flex-wrap items-center gap-4">
                    <Button size="sm">Small</Button>
                    <Button size="md">Medium</Button>
                    <Button size="lg">Large</Button>
                  </div>
                </div>
              </div>
            </Card>

            {/* Badges */}
            <Card>
              <h2 className="text-heading-large mb-6">Badges</h2>
              <div className="flex flex-wrap gap-4">
                <Badge variant="default">Default</Badge>
                <Badge variant="primary">Primary</Badge>
                <Badge variant="success">Success</Badge>
                <Badge variant="warning">Warning</Badge>
                <Badge variant="error">Error</Badge>
                <Badge variant="outline">Outline</Badge>
              </div>
            </Card>

            {/* Avatars */}
            <Card>
              <h2 className="text-heading-large mb-6">Avatars</h2>

              <div className="space-y-6">
                <div>
                  <h3 className="text-heading-small mb-3">Sizes</h3>
                  <div className="flex items-end gap-4">
                    <Avatar size="xs" name="XS" />
                    <Avatar size="sm" name="SM" />
                    <Avatar size="md" name="MD" />
                    <Avatar size="lg" name="LG" />
                    <Avatar size="xl" name="XL" />
                    <Avatar size="2xl" name="2XL" />
                  </div>
                </div>

                <div>
                  <h3 className="text-heading-small mb-3">Avatar Group</h3>
                  <AvatarGroup
                    avatars={[
                      { name: 'Alice' },
                      { name: 'Bob' },
                      { name: 'Charlie' },
                      { name: 'Diana' },
                      { name: 'Eve' },
                      { name: 'Frank' }
                    ]}
                    max={4}
                  />
                </div>
              </div>
            </Card>

            {/* Progress Circles */}
            <Card>
              <h2 className="text-heading-large mb-6">Progress Circles</h2>
              <div className="flex items-end gap-8">
                <ProgressCircle value={25} size="sm" />
                <ProgressCircle value={50} size="md" />
                <ProgressCircle value={75} size="lg" />
                <ProgressCircle value={100} size="lg" color="var(--color-semantic-success)" />
              </div>
            </Card>

            {/* Inputs */}
            <Card>
              <h2 className="text-heading-large mb-6">Inputs</h2>
              <div className="space-y-4 max-w-md">
                <Input placeholder="Enter your name..." />
                <Input placeholder="Email address..." type="email" />
                <Input placeholder="Disabled input" disabled />
              </div>
            </Card>

            {/* Toggles */}
            <Card>
              <h2 className="text-heading-large mb-6">Toggle Switches</h2>
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <Toggle checked={false} onChange={() => {}} />
                  <span className="text-body-medium">Off</span>
                </div>
                <div className="flex items-center gap-2">
                  <Toggle checked={true} onChange={() => {}} />
                  <span className="text-body-medium">On</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Note: animations and themes sections would be added here */}
        {/* They can be extracted into separate files following the same pattern */}
        {activeSection === 'animations' && (
          <div className="space-y-8">
            <Card>
              <h2 className="text-heading-large mb-4">Animations</h2>
              <p className="text-body-medium text-(--color-text-secondary)">
                Animation demos are available in the original file. Extract them to a separate AnimationsSection component for better organization.
              </p>
            </Card>
          </div>
        )}

        {activeSection === 'themes' && (
          <div className="space-y-8">
            <Card>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-(--color-accent-primary-light)">
                    <Sparkles className="w-6 h-6 text-(--color-accent-primary)" />
                  </div>
                  <div>
                    <h2 className="text-heading-large">Theme Gallery</h2>
                    <p className="text-body-medium text-(--color-text-secondary)">
                      {themes.length} color themes × 2 modes = {themes.length * 2} combinations
                    </p>
                  </div>
                </div>

                {/* Mode Toggle */}
                <div className="flex items-center gap-3 p-1 bg-(--color-background-secondary) rounded-full">
                  <button
                    onClick={() => mode === 'dark' && toggleMode()}
                    className={cn(
                      "px-4 py-2 rounded-full text-body-medium font-medium transition-all",
                      mode === 'light'
                        ? "bg-(--color-surface-card) shadow-sm"
                        : "text-(--color-text-secondary)"
                    )}
                  >
                    <Sun className="w-4 h-4 inline mr-2" />
                    Light
                  </button>
                  <button
                    onClick={() => mode === 'light' && toggleMode()}
                    className={cn(
                      "px-4 py-2 rounded-full text-body-medium font-medium transition-all",
                      mode === 'dark'
                        ? "bg-(--color-surface-card) shadow-sm"
                        : "text-(--color-text-secondary)"
                    )}
                  >
                    <Moon className="w-4 h-4 inline mr-2" />
                    Dark
                  </button>
                </div>
              </div>
            </Card>

            {/* Theme Grid */}
            <div>
              <h3 className="text-heading-medium mb-4">Color Themes</h3>
              <div className="grid grid-cols-3 gap-6">
                {themes.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setColorTheme(theme.id)}
                    className={cn(
                      "p-6 rounded-2xl text-left transition-all border-2",
                      colorTheme === theme.id
                        ? "border-(--color-accent-primary) bg-(--color-accent-primary-light)"
                        : "border-(--color-border-default) bg-(--color-surface-card) hover:border-(--color-accent-primary)/50"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="w-8 h-8 rounded-full border-2 border-white shadow-sm"
                        style={{ backgroundColor: mode === 'dark' ? theme.previewColors.darkBg : theme.previewColors.bg }}
                      />
                      <div
                        className="w-8 h-8 rounded-full border-2 border-white shadow-sm"
                        style={{ backgroundColor: theme.previewColors.accent }}
                      />
                    </div>
                    <h3 className="text-heading-small mb-1">{theme.name}</h3>
                    <p className="text-body-small text-(--color-text-tertiary)">{theme.description}</p>
                    {colorTheme === theme.id && (
                      <div className="mt-3 inline-flex items-center px-2 py-1 rounded-full bg-(--color-accent-primary) text-white text-label-small">
                        Active
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
