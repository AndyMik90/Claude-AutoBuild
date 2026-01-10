# Terminal Font System

## Overview

The Auto-Claude UI includes an embedded terminal font system that ensures consistent font rendering across all platforms without requiring system font installation.

## Embedded Fonts

The following fonts are embedded in the application:

### 1. **JetBrains Mono** (Default)
- **License:** OFL (SIL Open Font License)
- **Features:** Programming ligatures, excellent readability
- **Variants:** Regular, Bold, Italic
- **Source:** https://github.com/JetBrains/JetBrainsMono

### 2. **Fira Code**
- **License:** OFL (SIL Open Font License)
- **Features:** Programming ligatures, clean design
- **Variants:** Regular, Bold
- **Source:** https://github.com/tonsky/FiraCode

### 3. **Cascadia Code**
- **License:** OFL (SIL Open Font License)
- **Features:** Microsoft's monospaced font with ligatures
- **Variants:** Regular, Bold
- **Source:** https://github.com/microsoft/cascadia-code

## System Fonts (Optional)

The following fonts are supported if installed on the system:

- **Source Code Pro** - Adobe's monospace font
- **Menlo** - macOS default terminal font
- **Consolas** - Windows default monospace font
- **SF Mono** - San Francisco Mono (macOS)
- **Monaco** - Classic macOS font
- **Courier New** - Universal fallback
- **Ubuntu Mono** - Ubuntu system font
- **DejaVu Sans Mono** - Open source font
- **Hack** - Font designed for source code
- **Inconsolata** - Clean monospace font
- **Roboto Mono** - Google's monospace font

## How It Works

### Font Loading

1. **Embedded Fonts:** Loaded via `@font-face` in `src/renderer/styles/fonts.css`
2. **System Fonts:** Used as fallbacks if available
3. **Font Selection:** User can choose font in Settings → Display

### Font Change Mechanism

When a user changes the font in settings:

1. **Settings Store Update:** `useSettingsStore` updates `terminalFont`
2. **Component Re-render:** `useXterm` hook detects font change via Zustand selector
3. **Font Application:** 
   - `xtermRef.current.options.fontFamily` is updated
   - `fitAddon.fit()` is called to recalculate terminal dimensions
4. **No Terminal Recreation:** Existing terminals update their font without losing state

### Key Implementation Details

**File:** `apps/frontend/src/renderer/components/terminal/useXterm.ts`

```typescript
// Subscribe to terminalFont specifically to ensure re-render on font change
const terminalFont = useSettingsStore((state) => state.settings.terminalFont ?? TERMINAL_FONT_DEFAULT);
const fontDefinition = TERMINAL_FONTS.find(f => f.id === terminalFont);
const fontFamily = fontDefinition?.cssFamily ?? "'JetBrains Mono', monospace";

// Store initial font family to prevent re-initialization on font change
const initialFontFamily = useRef<string>(fontFamily);

// Initialize terminal with initial font (happens once)
useEffect(() => {
  // ... terminal initialization with initialFontFamily.current
}, [terminalId, onCommandEnter, onResize]); // fontFamily NOT in dependencies

// Update font when settings change (happens on every font change)
useEffect(() => {
  if (xtermRef.current && fitAddonRef.current) {
    xtermRef.current.options.fontFamily = fontFamily;
    setTimeout(() => {
      fitAddonRef.current.fit(); // Recalculate terminal size
    }, 0);
  }
}, [fontFamily]); // Only fontFamily in dependencies
```

## Adding New Fonts

### 1. Download Font Files

Download `.woff2` files (Regular and Bold weights minimum):

```bash
cd apps/frontend/resources/fonts/webfonts/
# Add your font files here
```

### 2. Add @font-face Declaration

Edit `apps/frontend/src/renderer/styles/fonts.css`:

```css
@font-face {
  font-family: 'Your Font Name';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('../../../resources/fonts/webfonts/YourFont-Regular.woff2') format('woff2');
}
```

### 3. Register Font in Constants

Edit `apps/frontend/src/shared/constants/config.ts`:

```typescript
export const TERMINAL_FONTS: TerminalFontDefinition[] = [
  // ... existing fonts
  {
    id: 'your-font',
    name: 'Your Font Name',
    description: 'Description of your font',
    cssFamily: "'Your Font Name', monospace",
    hasLigatures: true // or false
  }
];
```

### 4. Update TypeScript Types

Edit `apps/frontend/src/shared/types/settings.ts`:

```typescript
export type TerminalFont = 
  | 'jetbrains-mono'
  | 'fira-code'
  // ... other fonts
  | 'your-font'; // Add your font ID
```

## Troubleshooting

### Issue: Fonts not loading

**Solution:** Check browser DevTools Network tab for 404 errors on font files.

### Issue: Squares/boxes (□) instead of characters

**Cause:** Font doesn't support Unicode characters in the output.

**Solution:** 
1. Switch to a font with better Unicode support (JetBrains Mono, Fira Code)
2. Check if the font file is corrupted

### Issue: Font doesn't change when selected

**Cause:** Zustand store not triggering re-render.

**Solution:** Verify `useXterm` is subscribed to `terminalFont` specifically:
```typescript
const terminalFont = useSettingsStore((state) => state.settings.terminalFont);
```

### Issue: Terminal recreates when changing font

**Cause:** `fontFamily` in dependencies of initialization `useEffect`.

**Solution:** Remove `fontFamily` from dependencies array, use `initialFontFamily.current` instead.

## File Structure

```
apps/frontend/
├── resources/
│   └── fonts/
│       └── webfonts/
│           ├── JetBrainsMono-Regular.woff2
│           ├── JetBrainsMono-Bold.woff2
│           ├── JetBrainsMono-Italic.woff2
│           ├── FiraCode-Regular.woff2
│           ├── FiraCode-Bold.woff2
│           ├── CascadiaCode-Regular.woff2
│           └── CascadiaCode-Bold.woff2
└── src/
    ├── renderer/
    │   ├── styles/
    │   │   ├── fonts.css           # @font-face declarations
    │   │   └── globals.css         # Imports fonts.css
    │   └── components/
    │       ├── terminal/
    │       │   └── useXterm.ts     # Font change logic
    │       └── settings/
    │           └── DisplaySettings.tsx # Font selector UI
    └── shared/
        ├── constants/
        │   └── config.ts           # Font definitions
        └── types/
            └── settings.ts         # TerminalFont type
```

## Performance

- **Bundle Size Impact:** ~830 KB for all embedded fonts (JetBrains Mono, Fira Code, Cascadia Code)
- **Load Time:** Fonts load asynchronously with `font-display: swap`
- **Memory:** Minimal impact, fonts shared across all terminals

## License Information

All embedded fonts are licensed under the SIL Open Font License (OFL):
- JetBrains Mono: https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt
- Fira Code: https://github.com/tonsky/FiraCode/blob/master/LICENSE
- Cascadia Code: https://github.com/microsoft/cascadia-code/blob/main/LICENSE
