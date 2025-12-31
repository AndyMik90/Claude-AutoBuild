# Auto Claude UI Components

Apple HIG-inspired component library with liquid glass effects. Built with Radix UI primitives, Tailwind CSS v4, and class-variance-authority.

## Design Principles

- **Apple HIG Compliant**: 44pt tap targets, proper spacing, semantic colors
- **Liquid Glass**: Optional glassmorphism variants for all applicable components
- **Motion Design**: Smooth transitions with Apple easing functions
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support

## Using Components

### Basic Usage

```tsx
import { Button } from '@/components/ui/button';

<Button variant="default">Click me</Button>
<Button variant="glass-primary">Glass Button</Button>
```

### Glass Variants

Components support glass effects via variant props or utility classes:

```tsx
// Via variant prop
<Button variant="glass-primary">Glass Button</Button>
<Card className="glass-surface">Glass Card</Card>

// Via utility class
<div className="glass-dialog">...</div>
<div className="glass-sidebar">...</div>
```

### Compound Components

Some components use compound patterns for flexibility:

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    Content
  </CardContent>
</Card>
```

```tsx
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Item 1</TableCell>
      <TableCell>Active</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

```tsx
import { InputGroup, InputLabel, Input, InputHint } from '@/components/ui/input-group';

<InputGroup>
  <InputLabel>Email</InputLabel>
  <Input type="email" placeholder="you@example.com" />
  <InputHint>We'll never share your email.</InputHint>
</InputGroup>
```

## Component Reference

### Forms

| Component | Description | Glass Support |
|-----------|-------------|---------------|
| Button | Clickable action button | ✅ `glass-primary`, `glass-outline`, `glass-ghost` |
| ButtonGroup | Grouped button actions with split button | ✅ `glass` variant |
| Field | Form field wrapper with label/hint/error | ✅ `glass` variant |
| Input | Text input field | ✅ via `glass-surface` class |
| InputGroup | Compound input with label/hint/error | ✅ via `glass-surface` class |
| Textarea | Multi-line text input | ✅ via `glass-surface` class |
| Select | Dropdown select | ✅ via `glass-surface` class |
| Switch | Toggle switch | ❌ |
| Checkbox | Checkbox input (via Radix) | ❌ |

### Layout

| Component | Description | Glass Support |
|-----------|-------------|---------------|
| Card | Container with header/content/footer | ✅ via `glass-surface` class |
| Separator | Visual divider | ❌ |
| ScrollArea | Custom scrollable area | ❌ |

### Overlays

| Component | Description | Glass Support |
|-----------|-------------|---------------|
| Dialog | Modal dialog | ✅ via `glass-dialog` class |
| Tooltip | Hover tooltip | ❌ |

### Data Display

| Component | Description | Glass Support |
|-----------|-------------|---------------|
| Table | Data table with compound API | ❌ |
| Badge | Status indicator | ✅ variants |
| Progress | Progress bar | ❌ |
| Skeleton | Loading placeholder | ❌ |
| Item | Reusable list item | ✅ `glass` variant |
| Empty | Empty state placeholder | ✅ `glass` variant |

### Feedback

| Component | Description | Glass Support |
|-----------|-------------|---------------|
| Spinner | Loading state indicator | ✅ `glass` variant |
| Alert | Dismissible alert | ✅ variants |
| Toast | Non-intrusive notification | ✅ variants |

### Typography

| Component | Description | Glass Support |
|-----------|-------------|---------------|
| Kbd | Keyboard shortcut display | ✅ `glass` variant |

### Navigation

| Component | Description | Glass Support |
|-----------|-------------|---------------|
| Tabs | Tabbed interface | ❌ |
| ToggleGroup | Segmented control | ✅ `glass` variant |

## New 2025 Components

### Spinner

Loading state indicator with Apple-style animations:

```tsx
import { Spinner, SpinnerDots, SpinnerBars } from '@/components/ui/spinner';

<Spinner size="md" variant="default" />
<SpinnerDots size="lg" variant="success" />
<SpinnerBars size="sm" variant="muted" />
<SpinnerGlass size="md" blur="xl" />
```

### Kbd (Keyboard)

Display keyboard shortcuts with macOS-style keys:

```tsx
import { Kbd, KbdCombo, KbdPreset } from '@/components/ui/kbd';

<Kbd>⌘</Kbd>
<KbdCombo keys={['⌘', '⇧', '4']} />
<KbdPreset preset="save" />
```

### ButtonGroup

Grouped button actions with split button support:

```tsx
import { ButtonGroup, SplitButton, SegmentedControl } from '@/components/ui/button-group';

<ButtonGroup>
  <Button>Button 1</Button>
  <Button>Button 2</Button>
  <Button>Button 3</Button>
</ButtonGroup>

<SplitButton
  label="Save"
  onClick={() => {}}
  items={[{ label: 'Save As', value: 'save-as', onClick: () => {} }]}
/>

<SegmentedControl
  segments={[
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
  ]}
  value="day"
  onChange={(v) => {}}
/>
```

### Field

Form field wrapper with labels, hints, and errors:

```tsx
import { Field, Fieldset, CheckboxField, SwitchField } from '@/components/ui/field';

<Field
  label="Email"
  description="We'll never share your email."
  error={error}
  required
>
  <Input type="email" />
</Field>

<CheckboxField
  label="Remember me"
  description="Keep me signed in"
  checked={remember}
  onCheckedChange={setRemember}
/>
```

### Item

Reusable list item with multiple layout options:

```tsx
import { Item, ItemGroup, CheckboxItem, AvatarItem } from '@/components/ui/item';

<Item
  icon={<Avatar src="/avatar.png" />}
  title="John Doe"
  description="Software Engineer"
  trailing={<Badge>Active</Badge>}
/>

<ItemGroup title="Team Members">
  <Item title="Jane" description="Designer" />
  <Item title="Bob" description="Developer" />
</ItemGroup>

<AvatarItem
  src="/avatar.png"
  title="John Doe"
  description="Online"
  online
/>
```

### Empty

Empty state placeholder with illustrations:

```tsx
import { Empty, EmptyPage, EmptyPreset } from '@/components/ui/empty';

<Empty
  state="noData"
  title="No tasks yet"
  description="Create your first task to get started."
  action={<Button>Create Task</Button>}
/>

<EmptyPage preset="noSearchResults" />

<EmptyPreset
  preset="noTasks"
  action={<Button>Create Task</Button>}
/>
```

## CLI Tool

Add new components using the CLI:

```bash
# List available components
npm run ui:list

# Add a component
npm run ui:add accordion

# Show help
npm run ui:help
```

## Glass Effect Classes

Utility classes for glassmorphism effects:

- `.glass-surface` - Card/container glass effect
- `.glass-dialog` - Modal/dialog glass effect
- `.glass-dropdown` - Dropdown glass effect
- `.glass-sidebar` - Sidebar glass effect
- `.glass-button` - Button glass effect

## CSS Variables

Glass effects use CSS variables for easy customization:

```css
:root {
  --glass-opacity-card: 0.6;
  --glass-opacity-dialog: 0.8;
  --glass-blur-lg: blur(20px);
  --glass-blur-xl: blur(30px);
  --glass-border-opacity: 0.1;
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}
```

## Apple HIG Motion Design

Components use Apple's easing functions:

```css
--ease-apple: cubic-bezier(0.25, 0.46, 0.45, 0.94);
--ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);
```

Animation durations:

```css
--duration-instant: 100ms;
--duration-quick: 150ms;
--duration-standard: 200ms;
--duration-deliberate: 300ms;
```

## Configuration

See `components.json` for library configuration:

```json
{
  "style": "new-york",
  "tsx": true,
  "tailwind": {
    "cssVariables": true
  },
  "aliases": {
    "components": "src/renderer/components",
    "ui": "src/renderer/components/ui"
  },
  "theme": {
    "name": "apple-hig-liquid-glass",
    "glassModifiers": {
      "enabled": true,
      "blurAmount": "backdrop-blur-xl"
    }
  }
}
```

## Component Metadata

The `metadata.ts` file provides:

- Component discovery and documentation
- Dependency tracking for tree-shaking
- Glass effect support indicators
- Apple HIG compliance status

```tsx
import { getAllComponents, getComponentsWithGlassSupport } from '@/components/ui/metadata';

const allComponents = getAllComponents();
const glassComponents = getComponentsWithGlassSupport();
```

## Architecture

### Dependencies

- **Radix UI**: Accessible component primitives
- **CVA**: Class Variance Authority for variant management
- **Tailwind CSS v4**: Utility-first CSS framework
- **clsx + tailwind-merge**: Intelligent class merging via `cn()`

### Patterns

1. **ForwardRef**: All components forward refs for DOM access
2. **CVA Variants**: Type-safe variant definitions
3. **Slot Pattern**: Polymorphic components via `asChild`
4. **Compound Components**: Flexible composition (Card, Table, InputGroup)
5. **Apple HIG**: 44pt tap targets, proper spacing, semantic colors

## Theming

All components support the 8 built-in themes:

- Default (Oscura Midnight)
- Apple Native
- Dusk
- Lime
- Ocean
- Retro
- Neo
- Forest

Glass effects automatically adapt to each theme via CSS variables.

## Accessibility

- ARIA attributes via Radix UI primitives
- Focus visible indicators
- Keyboard navigation support
- Screen reader friendly
- Reduced motion support

## Development

### Adding New Components

1. Use the CLI: `npm run ui:add <name>`
2. Edit the generated file
3. Add variants using CVA
4. Follow Apple HIG principles
5. Update `metadata.ts` with component info
6. Export from `index.ts`

### Glass Effect Guidelines

- Add glass variants for components that can benefit from translucency
- Use `backdrop-blur` for depth
- Keep `color-mix()` for theme compatibility
- Test across all 8 themes
- Respect user's `prefers-reduced-motion`

## Resources

- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [Tailwind CSS](https://tailwindcss.com)
- [Class Variance Authority](https://cva.style)
