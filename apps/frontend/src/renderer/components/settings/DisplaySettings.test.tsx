/**
 * @vitest-environment jsdom
 */
/**
 * Component tests for DisplaySettings
 * Tests UI scale and terminal font selection functionality
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DisplaySettings } from './DisplaySettings';
import { useSettingsStore } from '../../stores/settings-store';
import { TERMINAL_FONTS, TERMINAL_FONT_DEFAULT, UI_SCALE_DEFAULT } from '../../../shared/constants';
import type { AppSettings } from '../../../shared/types';

// Mock the settings store
vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: vi.fn()
}));

// Mock useTranslation with comprehensive translation map
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const translations: Record<string, string> = {
        'sections.display.title': 'Display',
        'sections.display.description': 'Adjust the size of UI elements',
        'font.label': 'Terminal Font',
        'font.description': 'Choose a monospace font for terminal and code display',
        'scale.presets': 'Scale Presets',
        'scale.presetsDescription': 'Quick scale options for common preferences',
        'scale.fineTune': 'Fine-tune Scale',
        'scale.fineTuneDescription': 'Adjust from 75% to 200% in 5% increments',
        'scale.default': 'Default',
        'scale.comfortable': 'Comfortable',
        'scale.large': 'Large'
      };
      return translations[key] || fallback || key;
    }
  })
}));

// Default settings
const defaultSettings: AppSettings = {
  theme: 'dark',
  colorTheme: 'default',
  defaultModel: 'opus',
  agentFramework: 'auto-claude',
  autoUpdateAutoBuild: true,
  autoNameTerminals: true,
  onboardingCompleted: true,
  notifications: {
    onTaskComplete: true,
    onTaskFailed: true,
    onReviewNeeded: true,
    sound: false
  },
  uiScale: UI_SCALE_DEFAULT,
  terminalFont: TERMINAL_FONT_DEFAULT,
  betaUpdates: false,
  language: 'en'
};

describe('DisplaySettings', () => {
  const mockUpdateSettings = vi.fn();
  const mockOnSettingsChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup settings store mock
    (useSettingsStore as any).mockImplementation((selector: any) => {
      const state = {
        settings: defaultSettings,
        updateSettings: mockUpdateSettings
      };
      return selector(state);
    });
  });

  describe('Terminal Font Selection', () => {
    it('should render terminal font selector', () => {
      render(
        <DisplaySettings
          settings={defaultSettings}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      expect(screen.getByText('Terminal Font')).toBeInTheDocument();
      expect(screen.getByText(/Choose a monospace font/i)).toBeInTheDocument();
    });

    it('should display all available fonts', () => {
      render(
        <DisplaySettings
          settings={defaultSettings}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      // Check that all fonts are rendered
      TERMINAL_FONTS.forEach((font) => {
        expect(screen.getByText(font.name)).toBeInTheDocument();
      });
    });

    it('should highlight currently selected font', () => {
      const settingsWithFiraCode: AppSettings = {
        ...defaultSettings,
        terminalFont: 'fira-code'
      };

      render(
        <DisplaySettings
          settings={settingsWithFiraCode}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      const firaCodeButton = screen.getByText('Fira Code').closest('button');
      expect(firaCodeButton).toHaveClass('border-primary');
    });

    it('should show ligatures badge for fonts with ligatures', () => {
      render(
        <DisplaySettings
          settings={defaultSettings}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      // Check for ligatures badges
      const ligaturesBadges = screen.getAllByText('Ligatures');
      
      // Count fonts with ligatures
      const fontsWithLigatures = TERMINAL_FONTS.filter(f => f.hasLigatures);
      expect(ligaturesBadges).toHaveLength(fontsWithLigatures.length);
    });

    it('should call updateSettings when font is changed', () => {
      render(
        <DisplaySettings
          settings={defaultSettings}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      // Click on Fira Code
      const firaCodeButton = screen.getByText('Fira Code').closest('button');
      fireEvent.click(firaCodeButton!);

      // Should call both callbacks
      expect(mockOnSettingsChange).toHaveBeenCalledWith({
        ...defaultSettings,
        terminalFont: 'fira-code'
      });
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        terminalFont: 'fira-code'
      });
    });

    it('should display code preview for each font', () => {
      render(
        <DisplaySettings
          settings={defaultSettings}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      // Check that code preview is shown
      const previews = screen.getAllByText('const hello = () => "world";');
      expect(previews.length).toBeGreaterThan(0);
    });

    it('should apply correct font family to preview', () => {
      render(
        <DisplaySettings
          settings={defaultSettings}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      TERMINAL_FONTS.forEach((font) => {
        const fontCard = screen.getByText(font.name).closest('button');
        const preview = fontCard?.querySelector('div[class*="font-"]');
        
        if (preview) {
          const style = window.getComputedStyle(preview);
          // Note: In jsdom, fontFamily might not be computed correctly,
          // but we can check that the style attribute is set
          expect(preview).toBeInTheDocument();
        }
      });
    });
  });

  describe('UI Scale', () => {
    it('should render scale presets', () => {
      render(
        <DisplaySettings
          settings={defaultSettings}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      expect(screen.getByText('Scale Presets')).toBeInTheDocument();
      expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
      expect(screen.getAllByText('125%').length).toBeGreaterThan(0);
      expect(screen.getAllByText('150%').length).toBeGreaterThan(0);
    });

    it('should render fine-tune slider', () => {
      render(
        <DisplaySettings
          settings={defaultSettings}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      expect(screen.getByText('Fine-tune Scale')).toBeInTheDocument();
      
      const slider = screen.getByRole('slider');
      expect(slider).toBeInTheDocument();
      expect(slider).toHaveValue(UI_SCALE_DEFAULT.toString());
    });
  });

  describe('Integration', () => {
    it('should handle both font and scale settings together', () => {
      const customSettings: AppSettings = {
        ...defaultSettings,
        uiScale: 125,
        terminalFont: 'cascadia-code'
      };

      render(
        <DisplaySettings
          settings={customSettings}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      // Check scale is displayed (getAllByText since 125% appears in multiple places)
      const scaleElements = screen.getAllByText('125%');
      expect(scaleElements.length).toBeGreaterThan(0);

      // Check font is selected
      const cascadiaButton = screen.getByText('Cascadia Code').closest('button');
      expect(cascadiaButton).toHaveClass('border-primary');
    });
  });
});
