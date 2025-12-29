# Renderer Components

The React renderer process provides the user interface for Auto-Claude, built on React 19, Radix UI primitives, Tailwind CSS, and Zustand for state management. Components are organized hierarchically from foundational UI primitives to complex feature components.

## Component Hierarchy Overview

```mermaid
flowchart TB
    subgraph App["App.tsx - Root Component"]
        Providers[Context Providers<br/>TooltipProvider, DndContext]
        Layout[Layout Container]
    end

    subgraph Navigation["Navigation Layer"]
        Sidebar[Sidebar<br/>View Navigation]
        TabBar[ProjectTabBar<br/>Project Tabs]
    end

    subgraph Views["Main View Components"]
        Kanban[KanbanBoard<br/>Task Management]
        Terminals[TerminalGrid<br/>Agent Terminals]
        Roadmap[Roadmap<br/>Feature Planning]
        Context[Context<br/>Project Index]
        Ideation[Ideation<br/>Feature Ideas]
        Insights[Insights<br/>AI Chat]
        GitHubIssues[GitHubIssues<br/>Issue Triage]
        GitHubPRs[GitHubPRs<br/>PR Reviews]
        Changelog[Changelog<br/>Release Notes]
        Worktrees[Worktrees<br/>Git Branches]
    end

    subgraph Dialogs["Dialog Components"]
        TaskCreation[TaskCreationWizard]
        TaskDetail[TaskDetailModal]
        AppSettings[AppSettingsDialog]
        Onboarding[OnboardingWizard]
        RateLimitModal[RateLimitModal]
    end

    subgraph Cards["Card Components"]
        TaskCard[TaskCard<br/>Task Display]
        FeatureCard[SortableFeatureCard]
        IdeaCard[IdeaCard]
        MemoryCard[MemoryCard]
    end

    subgraph UILib["UI Primitives (Radix)"]
        Dialog[Dialog]
        Button[Button]
        Card[Card]
        Badge[Badge]
        Select[Select]
        Tabs[Tabs]
        Tooltip[Tooltip]
        ScrollArea[ScrollArea]
    end

    App --> Navigation
    App --> Views
    App --> Dialogs

    Navigation --> Sidebar
    Navigation --> TabBar

    Views --> Cards
    Kanban --> TaskCard
    Ideation --> IdeaCard

    Dialogs --> UILib
    Cards --> UILib
    Views --> UILib

    style App fill:#e3f2fd,stroke:#1976d2
    style Navigation fill:#f3e5f5,stroke:#9c27b0
    style Views fill:#e8f5e9,stroke:#4caf50
    style Dialogs fill:#fff3e0,stroke:#f57c00
    style Cards fill:#fce4ec,stroke:#e91e63
    style UILib fill:#f5f5f5,stroke:#9e9e9e
```

## Directory Structure

```
apps/frontend/src/renderer/
├── App.tsx                         # Root application component
├── components/                     # All React components
│   ├── ui/                        # Radix UI primitives (shadcn/ui)
│   │   ├── alert-dialog.tsx
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── checkbox.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── full-screen-dialog.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── progress.tsx
│   │   ├── scroll-area.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   ├── switch.tsx
│   │   ├── tabs.tsx
│   │   ├── textarea.tsx
│   │   └── tooltip.tsx
│   ├── Sidebar.tsx                # Navigation sidebar
│   ├── ProjectTabBar.tsx          # Project tab management
│   ├── KanbanBoard.tsx            # Task kanban view
│   ├── TaskCard.tsx               # Task display card
│   ├── TaskCreationWizard.tsx     # New task wizard
│   ├── TaskEditDialog.tsx         # Edit task dialog
│   ├── TerminalGrid.tsx           # Terminal container
│   ├── Terminal.tsx               # Individual terminal
│   ├── Roadmap.tsx                # Roadmap view
│   ├── Context.tsx                # Project context view
│   ├── Ideation.tsx               # Ideation view
│   ├── Insights.tsx               # AI insights view
│   ├── GitHubIssues.tsx           # GitHub issues view
│   ├── Changelog.tsx              # Changelog view
│   ├── Worktrees.tsx              # Git worktrees view
│   ├── WelcomeScreen.tsx          # New user welcome
│   │
│   ├── changelog/                 # Changelog feature
│   ├── context/                   # Context visualization
│   ├── github-issues/             # GitHub issues feature
│   ├── github-prs/                # GitHub PRs feature
│   ├── ideation/                  # Ideation feature
│   ├── linear-import/             # Linear import feature
│   ├── onboarding/                # Onboarding wizard
│   ├── project-settings/          # Project settings
│   ├── roadmap/                   # Roadmap feature
│   ├── settings/                  # App settings
│   └── task-detail/               # Task detail modal
├── hooks/                         # Custom React hooks
├── stores/                        # Zustand state stores
└── lib/                           # Utility functions
```

## Root Component: App.tsx

The `App` component serves as the application entry point, orchestrating global state, routing between views, and managing modals.

### Component State Flow

```mermaid
stateDiagram-v2
    [*] --> LoadingState: App mounts
    LoadingState --> ProjectsLoaded: loadProjects()
    LoadingState --> SettingsLoaded: loadSettings()

    ProjectsLoaded --> ProjectSelected: Has active project
    ProjectsLoaded --> WelcomeScreen: No projects

    SettingsLoaded --> OnboardingCheck: Check onboarding
    OnboardingCheck --> OnboardingWizard: Not completed
    OnboardingCheck --> NormalView: Completed

    ProjectSelected --> KanbanView: Default view
    KanbanView --> TerminalView: User navigates
    KanbanView --> RoadmapView: User navigates
    KanbanView --> ContextView: User navigates
    KanbanView --> IdeationView: User navigates
    KanbanView --> InsightsView: User navigates

    state NormalView {
        [*] --> ViewActive
        ViewActive --> DialogOpen: Open modal
        DialogOpen --> ViewActive: Close modal
    }
```

### Key Responsibilities

| Responsibility | Implementation |
|---------------|----------------|
| State Initialization | Loads projects, tasks, settings on mount |
| View Routing | Manages `activeView` state for navigation |
| Modal Management | Controls dialogs (settings, task creation, etc.) |
| Project Tab Management | Handles multi-project tab bar with DnD |
| Keyboard Shortcuts | Global keyboard navigation |
| IPC Listeners | Real-time updates via `useIpcListeners` |

### View Navigation Flow

```mermaid
flowchart LR
    subgraph SidebarNav["Sidebar Navigation"]
        K[Kanban K]
        A[Terminals A]
        N[Insights N]
        D[Roadmap D]
        I[Ideation I]
        L[Changelog L]
        C[Context C]
        G[GitHub Issues G]
        P[GitHub PRs P]
        W[Worktrees W]
    end

    subgraph ViewState["activeView State"]
        KanbanBoard
        TerminalGrid
        InsightsView
        RoadmapView
        IdeationView
        ChangelogView
        ContextView
        GitHubIssues
        GitHubPRs
        WorktreesView
    end

    K --> KanbanBoard
    A --> TerminalGrid
    N --> InsightsView
    D --> RoadmapView
    I --> IdeationView
    L --> ChangelogView
    C --> ContextView
    G --> GitHubIssues
    P --> GitHubPRs
    W --> WorktreesView

    style SidebarNav fill:#e3f2fd,stroke:#1976d2
    style ViewState fill:#e8f5e9,stroke:#4caf50
```

## UI Primitives (Radix UI)

The `/ui` directory contains foundational components built on [Radix UI](https://www.radix-ui.com/) primitives with Tailwind CSS styling, following the shadcn/ui pattern.

### Component Library

```mermaid
classDiagram
    class Dialog {
        +DialogTrigger
        +DialogContent
        +DialogHeader
        +DialogTitle
        +DialogDescription
        +DialogFooter
    }

    class AlertDialog {
        +AlertDialogTrigger
        +AlertDialogContent
        +AlertDialogHeader
        +AlertDialogTitle
        +AlertDialogDescription
        +AlertDialogFooter
        +AlertDialogAction
        +AlertDialogCancel
    }

    class FullScreenDialog {
        +FullScreenDialogContent
        +FullScreenDialogHeader
        +FullScreenDialogBody
        +FullScreenDialogFooter
        +FullScreenDialogTitle
        +FullScreenDialogDescription
    }

    class Button {
        +variant: default|destructive|outline|ghost|link|warning
        +size: default|sm|lg|icon
    }

    class Badge {
        +variant: default|secondary|destructive|outline|success|warning|info|purple
    }

    class Card {
        +CardHeader
        +CardTitle
        +CardDescription
        +CardContent
        +CardFooter
    }

    class Select {
        +SelectTrigger
        +SelectValue
        +SelectContent
        +SelectItem
        +SelectGroup
        +SelectLabel
    }

    class Tabs {
        +TabsList
        +TabsTrigger
        +TabsContent
    }
```

### UI Component Usage Patterns

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `Dialog` | Modal overlays for focused interactions | `open`, `onOpenChange` |
| `FullScreenDialog` | Full-screen modals (settings, onboarding) | `open`, `onOpenChange` |
| `AlertDialog` | Confirmation dialogs | `open`, `onOpenChange` |
| `Button` | Actions and interactions | `variant`, `size`, `disabled` |
| `Badge` | Status indicators and labels | `variant` |
| `Card` | Content containers | Uses CardContent, CardHeader |
| `Select` | Dropdown selection | `value`, `onValueChange` |
| `Tabs` | Tabbed content navigation | `value`, `onValueChange` |
| `ScrollArea` | Scrollable containers | Custom scrollbar styling |
| `Tooltip` | Contextual hints | Requires `TooltipProvider` |

## Navigation Components

### Sidebar

The `Sidebar` component provides primary navigation between views and project actions.

```mermaid
flowchart TB
    subgraph Sidebar["Sidebar Component"]
        Header[App Header<br/>electron-drag]

        subgraph ProjectNav["Project Section"]
            Kanban[Kanban K]
            Terminals[Terminals A]
            Insights[Insights N]
            Roadmap[Roadmap D]
            Ideation[Ideation I]
            Changelog[Changelog L]
            Context[Context C]
        end

        subgraph ToolsNav["Tools Section"]
            GitHubIssues[GitHub Issues G]
            GitHubPRs[GitHub PRs P]
            Worktrees[Worktrees W]
        end

        RateLimitIndicator[Rate Limit Indicator]

        subgraph Footer["Footer Actions"]
            Settings[Settings Button]
            Help[Help Button]
            NewTask[New Task Button]
        end
    end

    Header --> ProjectNav
    ProjectNav --> ToolsNav
    ToolsNav --> RateLimitIndicator
    RateLimitIndicator --> Footer

    style Sidebar fill:#f3e5f5,stroke:#9c27b0
    style ProjectNav fill:#e8f5e9,stroke:#4caf50
    style ToolsNav fill:#fff3e0,stroke:#f57c00
    style Footer fill:#e3f2fd,stroke:#1976d2
```

### ProjectTabBar

Manages multiple open projects with drag-and-drop tab reordering.

```mermaid
sequenceDiagram
    participant User
    participant TabBar as ProjectTabBar
    participant Store as projectStore
    participant DnD as DndContext

    User->>TabBar: Click tab
    TabBar->>Store: setActiveProject(id)
    Store-->>TabBar: Re-render with new active

    User->>TabBar: Start drag
    TabBar->>DnD: DragStart event
    DnD->>TabBar: Show DragOverlay

    User->>TabBar: Drop on new position
    DnD->>Store: reorderTabs(activeId, overId)
    Store-->>TabBar: Re-render with new order

    User->>TabBar: Click close (X)
    TabBar->>Store: closeProjectTab(id)
    Store-->>TabBar: Re-render without tab
```

## View Components

### KanbanBoard

The task management view with drag-and-drop columns for workflow visualization.

```mermaid
flowchart TB
    subgraph KanbanBoard["KanbanBoard Component"]
        Header[Filter Header<br/>Show Archived Toggle]

        subgraph DndContext["DnD Context"]
            subgraph Columns["Droppable Columns"]
                Backlog[Backlog<br/>+ Add Task]
                InProgress[In Progress]
                AIReview[AI Review]
                HumanReview[Human Review]
                Done[Done<br/>Archive All]
            end

            DragOverlay[DragOverlay<br/>Dragged Card Preview]
        end
    end

    subgraph TaskCards["Task Cards"]
        SC1[SortableTaskCard]
        SC2[SortableTaskCard]
        SC3[SortableTaskCard]
    end

    Backlog --> SC1
    InProgress --> SC2
    Done --> SC3

    style KanbanBoard fill:#e3f2fd,stroke:#1976d2
    style Columns fill:#e8f5e9,stroke:#4caf50
    style TaskCards fill:#fce4ec,stroke:#e91e63
```

### TerminalGrid

Container for multiple PTY terminal instances.

```mermaid
flowchart TB
    subgraph TerminalGrid["TerminalGrid Component"]
        GridLayout[Grid Layout Container]

        subgraph Terminals["Terminal Instances"]
            T1[Terminal 1<br/>xterm.js]
            T2[Terminal 2<br/>xterm.js]
            T3[Terminal 3<br/>xterm.js]
        end

        AddButton[Add Terminal Button]
    end

    GridLayout --> Terminals
    GridLayout --> AddButton

    subgraph Terminal["Terminal Component"]
        XTermCore[xterm.js Core]
        FitAddon[Fit Addon]
        WebLinksAddon[WebLinks Addon]
        WebglRenderer[WebGL Renderer]
    end

    T1 --> Terminal

    style TerminalGrid fill:#1a1a2e,stroke:#16213e
    style Terminals fill:#0f0f23,stroke:#1a1a2e
```

### Context View

Displays analyzed project context including services, dependencies, and memories.

```mermaid
flowchart TB
    subgraph Context["Context Component"]
        Tabs[TabsList]

        subgraph ProjectIndexTab["Project Index Tab"]
            ProjectOverview[Project Overview Card]
            ServiceCards[Service Cards]
        end

        subgraph MemoriesTab["Memories Tab"]
            MemoryList[Memory Card List]
            MemorySearch[Search/Filter]
        end
    end

    subgraph ServiceCard["ServiceCard Component"]
        ServiceHeader[Service Name + Type]

        subgraph Sections["Service Sections"]
            API[APIRoutesSection]
            DB[DatabaseSection]
            Deps[DependenciesSection]
            Env[EnvironmentSection]
            Ext[ExternalServicesSection]
            Mon[MonitoringSection]
        end
    end

    Tabs --> ProjectIndexTab
    Tabs --> MemoriesTab
    ServiceCards --> ServiceCard

    style Context fill:#e8f5e9,stroke:#4caf50
    style ServiceCard fill:#fff3e0,stroke:#f57c00
```

## Dialog Components

### TaskCreationWizard

Multi-step wizard for creating new tasks with metadata, images, and file references.

```mermaid
stateDiagram-v2
    [*] --> FormInput: Dialog opens

    FormInput --> ValidateTitle: Enter title
    ValidateTitle --> FormInput: Title required
    ValidateTitle --> OptionalFields: Title valid

    state OptionalFields {
        [*] --> Description
        Description --> Metadata: Show advanced
        Metadata --> AgentProfile: Select profile
        AgentProfile --> Images: Add images
        Images --> FileRefs: Reference files
        FileRefs --> GitOptions: Configure branch
    }

    OptionalFields --> DraftSaved: Auto-save draft
    DraftSaved --> OptionalFields: Continue editing

    OptionalFields --> Creating: Submit
    Creating --> Success: Task created
    Creating --> Error: Creation failed

    Success --> [*]: Close dialog
    Error --> OptionalFields: Show error
```

### TaskDetailModal

Full-screen modal for viewing and managing task details.

```mermaid
flowchart TB
    subgraph TaskDetailModal["TaskDetailModal Component"]
        Header[Task Header<br/>Title, Status, Actions]

        subgraph TabContent["Tab Navigation"]
            OverviewTab[Overview<br/>Metadata, Warnings]
            SubtasksTab[Subtasks<br/>Progress List]
            LogsTab[Logs<br/>Execution Output]
            ReviewTab[Review<br/>Feedback Form]
        end

        Footer[Action Buttons<br/>Start/Stop, Edit, Delete]
    end

    subgraph SubComponents["Child Components"]
        TaskMetadata[TaskMetadata]
        TaskWarnings[TaskWarnings]
        TaskSubtasks[TaskSubtasks]
        TaskLogs[TaskLogs]
        TaskReview[TaskReview]
        PhaseProgress[PhaseProgressIndicator]
    end

    OverviewTab --> TaskMetadata
    OverviewTab --> TaskWarnings
    SubtasksTab --> TaskSubtasks
    LogsTab --> TaskLogs
    ReviewTab --> TaskReview
    Header --> PhaseProgress

    style TaskDetailModal fill:#fff3e0,stroke:#f57c00
    style SubComponents fill:#e8f5e9,stroke:#4caf50
```

### AppSettingsDialog

Full-screen settings dialog with app and project configuration sections.

```mermaid
flowchart TB
    subgraph AppSettings["AppSettingsDialog Component"]
        subgraph NavSidebar["Navigation Sidebar"]
            AppHeader[App Settings Header]
            AppNav[App Navigation]
            ProjectHeader[Project Settings Header]
            ProjectNav[Project Navigation]
        end

        subgraph ContentArea["Content Area"]
            subgraph AppSections["App Sections"]
                Appearance[ThemeSettings]
                Display[DisplaySettings]
                Language[LanguageSettings]
                Agent[GeneralSettings]
                Paths[PathSettings]
                Integrations[IntegrationSettings]
                Updates[UpdateSettings]
                Notifications[NotificationSettings]
            end

            subgraph ProjectSections["Project Sections"]
                General[GeneralProjectSettings]
                Claude[ClaudeSettings]
                Linear[LinearSettings]
                GitHub[GitHubSettings]
                Memory[MemorySettings]
            end
        end
    end

    NavSidebar --> ContentArea

    style AppSettings fill:#e3f2fd,stroke:#1976d2
    style AppSections fill:#e8f5e9,stroke:#4caf50
    style ProjectSections fill:#fff3e0,stroke:#f57c00
```

### OnboardingWizard

First-run wizard for new user setup.

```mermaid
stateDiagram-v2
    [*] --> Welcome: First launch
    Welcome --> OAuth: Next
    OAuth --> Memory: Next/Skip
    Memory --> Completion: Next
    Completion --> [*]: Finish

    state Welcome {
        WelcomeContent: Feature overview
    }

    state OAuth {
        OAuthContent: Claude authentication
    }

    state Memory {
        MemoryContent: Memory system setup
    }

    state Completion {
        CompletionContent: Success + next steps
    }
```

## Card Components

### TaskCard

Displays task information in the kanban board with status, metadata, and actions.

```mermaid
flowchart TB
    subgraph TaskCard["TaskCard Component"]
        Header[Title + Status Badges]
        Description[Description Preview]

        subgraph MetadataBadges["Metadata Badges"]
            Category[Category Badge<br/>+ Icon]
            Impact[Impact Badge]
            Complexity[Complexity Badge]
            Priority[Priority Badge]
        end

        Progress[PhaseProgressIndicator]

        subgraph Footer["Footer"]
            Timestamp[Updated At]
            Actions[Start/Stop/Recover/Archive]
        end
    end

    Header --> Description
    Description --> MetadataBadges
    MetadataBadges --> Progress
    Progress --> Footer

    style TaskCard fill:#fce4ec,stroke:#e91e63
    style MetadataBadges fill:#f5f5f5,stroke:#9e9e9e
```

### SortableTaskCard

Wrapper around TaskCard providing drag-and-drop functionality via @dnd-kit.

```mermaid
sequenceDiagram
    participant User
    participant Sortable as SortableTaskCard
    participant DnD as useSortable hook
    participant Card as TaskCard

    User->>Sortable: Mouse down (8px threshold)
    DnD->>Sortable: isDragging = true
    Sortable->>Sortable: Apply drag styles
    Sortable->>DnD: Provide transform/transition

    User->>Sortable: Move to new position
    DnD->>DnD: Calculate new position

    User->>Sortable: Release
    DnD->>Sortable: isDragging = false
    DnD-->>DnD: Emit DragEnd event
```

## Feature Module Components

### Changelog Module

```mermaid
flowchart TB
    subgraph Changelog["Changelog Module"]
        ChangelogMain[Changelog.tsx]

        subgraph Components["Sub-Components"]
            Header[ChangelogHeader]
            Filters[ChangelogFilters]
            List[ChangelogList]
            Entry[ChangelogEntry]
            Details[ChangelogDetails]
            Config[ConfigurationPanel]
            Preview[PreviewPanel]
            Release[GitHubReleaseCard]
            Archive[ArchiveTasksCard]
            Success[Step3SuccessScreen]
        end

        subgraph Hooks["Custom Hooks"]
            UseChangelog[useChangelog]
            UseImageUpload[useImageUpload]
        end
    end

    ChangelogMain --> Header
    ChangelogMain --> Filters
    ChangelogMain --> List
    List --> Entry
    Entry --> Details
    ChangelogMain --> Config
    Config --> Preview
    Config --> Release
    Config --> Archive
    Config --> Success

    ChangelogMain --> UseChangelog
    Config --> UseImageUpload

    style Changelog fill:#e8f5e9,stroke:#4caf50
```

### GitHub Issues Module

```mermaid
flowchart TB
    subgraph GitHubIssues["GitHub Issues Module"]
        Main[GitHubIssues.tsx]

        subgraph Components["Sub-Components"]
            IssueList[IssueList]
            IssueListHeader[IssueListHeader]
            IssueListItem[IssueListItem]
            IssueDetail[IssueDetail]
            InvestigationDialog[InvestigationDialog]
            BatchReviewWizard[BatchReviewWizard]
            AutoFixButton[AutoFixButton]
            EmptyStates[EmptyStates]
        end

        subgraph Hooks["Custom Hooks"]
            UseIssues[useIssues]
            UseInvestigation[useInvestigation]
        end
    end

    Main --> IssueList
    IssueList --> IssueListHeader
    IssueList --> IssueListItem
    Main --> IssueDetail
    Main --> InvestigationDialog
    Main --> BatchReviewWizard
    IssueDetail --> AutoFixButton

    Main --> Hooks

    style GitHubIssues fill:#fff3e0,stroke:#f57c00
```

### Ideation Module

```mermaid
flowchart TB
    subgraph Ideation["Ideation Module"]
        Main[Ideation.tsx]

        subgraph Components["Sub-Components"]
            Header[IdeationHeader]
            Filters[IdeationFilters]
            EmptyState[IdeationEmptyState]
            IdeaCard[IdeaCard]
            SkeletonCard[IdeaSkeletonCard]
            DetailPanel[IdeaDetailPanel]
            Dialogs[IdeationDialogs]
            GenProgress[GenerationProgressScreen]
            TypeIcon[TypeIcon]
        end

        subgraph DetailsModule["details/"]
            Overview[OverviewTab]
            Technical[TechnicalTab]
            Implementation[ImplementationTab]
        end

        subgraph Hooks["Custom Hooks"]
            UseIdeation[useIdeation]
            UseIdeaDetails[useIdeaDetails]
        end
    end

    Main --> Header
    Main --> Filters
    Main --> IdeaCard
    Main --> DetailPanel
    DetailPanel --> DetailsModule

    Main --> Hooks

    style Ideation fill:#fce4ec,stroke:#e91e63
```

### Settings Module

```mermaid
flowchart TB
    subgraph Settings["Settings Module"]
        AppSettings[AppSettings.tsx]

        subgraph Sections["Settings Sections"]
            Theme[ThemeSettings]
            Display[DisplaySettings]
            Language[LanguageSettings]
            General[GeneralSettings]
            Advanced[AdvancedSettings]
            Integration[IntegrationSettings]
        end

        subgraph IntegrationsSub["integrations/"]
            ClaudeAPI[ClaudeAPISettings]
            GitHub[GitHubSettings]
            Linear[LinearSettings]
        end

        subgraph Hooks["Custom Hooks"]
            UseSettings[useSettings]
        end

        subgraph Common["common/"]
            SettingRow[SettingRow]
            PathInput[PathInput]
        end
    end

    AppSettings --> Sections
    Integration --> IntegrationsSub
    Sections --> Common
    AppSettings --> Hooks

    style Settings fill:#f3e5f5,stroke:#9c27b0
```

## Component Patterns

### Props Interface Pattern

All components follow a consistent props interface pattern:

```typescript
interface ComponentProps {
  // Required props first
  data: DataType;
  onAction: (value: ValueType) => void;

  // Optional props with defaults
  variant?: 'default' | 'secondary';
  disabled?: boolean;
  className?: string;
}

export function Component({
  data,
  onAction,
  variant = 'default',
  disabled = false,
  className
}: ComponentProps) {
  // Implementation
}
```

### State Management Pattern

Components use Zustand stores for global state and local React state for UI concerns:

```mermaid
flowchart TB
    subgraph GlobalState["Zustand Stores"]
        ProjectStore[projectStore]
        TaskStore[taskStore]
        SettingsStore[settingsStore]
        TerminalStore[terminalStore]
    end

    subgraph LocalState["Local Component State"]
        DialogOpen[isDialogOpen]
        FormData[formData]
        UIFlags[isLoading, isError]
    end

    subgraph Component["React Component"]
        UseStore[useStore hooks]
        UseState[useState hooks]
        Render[Render UI]
    end

    GlobalState --> UseStore
    UseStore --> Render
    LocalState --> UseState
    UseState --> Render

    style GlobalState fill:#e3f2fd,stroke:#1976d2
    style LocalState fill:#e8f5e9,stroke:#4caf50
```

### Styling Pattern

Components use Tailwind CSS with the `cn()` utility for conditional classes:

```typescript
import { cn } from '../lib/utils';

<div className={cn(
  'base-classes',
  variant === 'primary' && 'primary-classes',
  disabled && 'opacity-50 pointer-events-none',
  className
)}>
```

### IPC Communication Pattern

Components interact with the main process via the `window.electronAPI` bridge:

```mermaid
sequenceDiagram
    participant Component
    participant Store as Zustand Store
    participant API as window.electronAPI
    participant Main as Main Process

    Component->>Store: dispatch action
    Store->>API: invoke IPC method
    API->>Main: ipcRenderer.invoke()
    Main-->>API: IPCResult<T>
    API-->>Store: result
    Store-->>Component: state update
    Component->>Component: re-render
```

## Accessibility

Components follow accessibility best practices:

| Pattern | Implementation |
|---------|----------------|
| Keyboard Navigation | Focus management, keyboard shortcuts |
| ARIA Labels | Descriptive labels for screen readers |
| Focus Trapping | Modals trap focus within content |
| Color Contrast | Tailwind color palette meets WCAG |
| Motion Reduction | Respects `prefers-reduced-motion` |

## Internationalization

Components support i18n via react-i18next:

```typescript
import { useTranslation } from 'react-i18next';

function Component() {
  const { t } = useTranslation('namespace');
  return <span>{t('key.path')}</span>;
}
```

Translation namespaces: `common`, `tasks`, `settings`, `dialogs`, `navigation`, `onboarding`

## Related Documentation

- [State Management](./state.md) - Zustand stores and React hooks
- [IPC Handlers](./ipc-handlers.md) - Main process communication
- [Main Process](./main-process.md) - Electron main process architecture
- [Frontend Architecture](../architecture/frontend.md) - Overall frontend design
