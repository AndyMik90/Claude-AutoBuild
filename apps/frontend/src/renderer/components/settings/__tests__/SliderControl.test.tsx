/**
 * @vitest-environment jsdom
 */
/**
 * Comprehensive unit tests for SliderControl component
 * Tests rendering, user interactions, i18n integration, accessibility,
 * floating-point comparison, and boundary conditions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SliderControl } from '../SliderControl';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(() => ({
    t: vi.fn((key: string) => key)
  }))
}));

// Mock Label component
vi.mock('../../ui/label', () => ({
  Label: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <label className={className}>{children}</label>
  )
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Minus: ({ className }: { className?: string }) => <svg className={className} data-icon="minus" />,
  Plus: ({ className }: { className?: string }) => <svg className={className} data-icon="plus" />,
  RotateCcw: ({ className }: { className?: string }) => <svg className={className} data-icon="reset" />
}));

describe('SliderControl', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering - Basic Props', () => {
    it('should render with direct label and description', () => {
      const { container } = render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={13}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      expect(container.textContent).toContain('Font Size');
      expect(container.textContent).toContain('Adjust the font size');
    });

    it('should render with labelKey and descriptionKey (i18n)', () => {
      const { container } = render(
        <SliderControl
          labelKey="terminal.fontSize"
          descriptionKey="terminal.fontSizeDescription"
          value={13}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      // useTranslation mock returns the key as the translated string
      expect(container.textContent).toContain('terminal.fontSize');
      expect(container.textContent).toContain('terminal.fontSizeDescription');
    });

    it('should render with custom displayValue', () => {
      const { container } = render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={13}
          displayValue="13px"
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      expect(container.textContent).toContain('13px');
    });

    it('should render with numeric value when no displayValue provided', () => {
      const { container } = render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={13}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      expect(container.textContent).toContain('13');
    });

    it('should render slider input with correct attributes', () => {
      render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={13}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      const slider = screen.getByRole('slider', { name: 'Font Size' }) as HTMLInputElement;
      expect(slider).toBeDefined();
      expect(slider.min).toBe('10');
      expect(slider.max).toBe('20');
      expect(slider.step).toBe('1');
      expect(slider.value).toBe('13');
    });

    it('should render min/max markers', () => {
      const { container } = render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={13}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      expect(container.textContent).toContain('10');
      expect(container.textContent).toContain('20');
    });
  });

  describe('Reset Button Visibility', () => {
    it('should show reset button when value differs from default (exact comparison)', () => {
      const { container } = render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={14}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      // Find the reset button - it should exist when value differs from default
      const resetButton = Array.from(container.querySelectorAll('button')).find(btn =>
        btn.querySelector('[data-icon="reset"]')
      );
      expect(resetButton).toBeDefined();
    });

    it('should hide reset button when value equals default (exact comparison)', () => {
      const { container } = render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={13}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      // Reset button should not exist when value equals default
      const resetButton = Array.from(container.querySelectorAll('button')).find(btn =>
        btn.querySelector('[data-icon="reset"]')
      );
      expect(resetButton).toBeUndefined();
    });

    it('should use epsilon comparison when approxEqual is provided', () => {
      const approxEqual = (a: number, b: number) => Math.abs(a - b) < 0.01;

      const { container } = render(
        <SliderControl
          label="Line Height"
          description="Adjust line height"
          value={1.2}
          min={1.0}
          max={1.5}
          step={0.05}
          defaultValue={1.2}
          ariaLabel="Line Height"
          onChange={mockOnChange}
          approxEqual={approxEqual}
        />
      );

      // Reset button should not exist when values are within epsilon
      const resetButton = Array.from(container.querySelectorAll('button')).find(btn =>
        btn.querySelector('[data-icon="reset"]')
      );
      expect(resetButton).toBeUndefined();
    });

    it('should show reset button for floating-point values outside epsilon', () => {
      const approxEqual = (a: number, b: number) => Math.abs(a - b) < 0.01;

      const { container } = render(
        <SliderControl
          label="Line Height"
          description="Adjust line height"
          value={1.25}
          min={1.0}
          max={1.5}
          step={0.05}
          defaultValue={1.2}
          ariaLabel="Line Height"
          onChange={mockOnChange}
          approxEqual={approxEqual}
        />
      );

      // Reset button should exist when values differ beyond epsilon
      const resetButton = Array.from(container.querySelectorAll('button')).find(btn =>
        btn.querySelector('[data-icon="reset"]')
      );
      expect(resetButton).toBeDefined();
    });
  });

  describe('Reset Button Interaction', () => {
    it('should call onChange with defaultValue when reset button clicked', () => {
      const { container } = render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={14}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      const resetButton = Array.from(container.querySelectorAll('button')).find(btn =>
        btn.querySelector('[data-icon="reset"]')
      );
      expect(resetButton).toBeDefined();
      if (resetButton) {
        fireEvent.click(resetButton);

        expect(mockOnChange).toHaveBeenCalledTimes(1);
        expect(mockOnChange).toHaveBeenCalledWith(13);
      }
    });

    it('should call onChange with defaultValue for floating-point values', () => {
      const approxEqual = (a: number, b: number) => Math.abs(a - b) < 0.01;

      const { container } = render(
        <SliderControl
          label="Line Height"
          description="Adjust line height"
          value={1.3}
          min={1.0}
          max={1.5}
          step={0.05}
          defaultValue={1.2}
          ariaLabel="Line Height"
          onChange={mockOnChange}
          approxEqual={approxEqual}
        />
      );

      const resetButton = Array.from(container.querySelectorAll('button')).find(btn =>
        btn.querySelector('[data-icon="reset"]')
      );
      expect(resetButton).toBeDefined();
      if (resetButton) {
        fireEvent.click(resetButton);

        expect(mockOnChange).toHaveBeenCalledWith(1.2);
      }
    });
  });

  describe('Decrease Button Interaction', () => {
    it('should call onChange with value - step when decrease button clicked', () => {
      const { container } = render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={13}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      const decreaseButton = Array.from(container.querySelectorAll('button')).find(btn =>
        btn.querySelector('[data-icon="minus"]')
      );
      expect(decreaseButton).toBeDefined();
      if (decreaseButton) {
        fireEvent.click(decreaseButton);

        expect(mockOnChange).toHaveBeenCalledWith(12);
      }
    });

    it('should be disabled when value is at minimum', () => {
      const { container } = render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={10}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      const decreaseButton = Array.from(container.querySelectorAll('button')).find(btn =>
        btn.querySelector('[data-icon="minus"]')
      );
      expect(decreaseButton).toBeDefined();
      if (decreaseButton) {
        expect(decreaseButton.hasAttribute('disabled')).toBe(true);
      }
    });

    it('should not be disabled when value is above minimum', () => {
      const { container } = render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={11}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      const decreaseButton = Array.from(container.querySelectorAll('button')).find(btn =>
        btn.querySelector('[data-icon="minus"]')
      );
      expect(decreaseButton).toBeDefined();
      if (decreaseButton) {
        expect(decreaseButton.hasAttribute('disabled')).toBe(false);
      }
    });

    it('should handle floating-point step correctly', () => {
      const { container } = render(
        <SliderControl
          label="Letter Spacing"
          description="Adjust letter spacing"
          value={0}
          min={-2}
          max={2}
          step={0.5}
          defaultValue={0}
          ariaLabel="Letter Spacing"
          onChange={mockOnChange}
        />
      );

      const decreaseButton = Array.from(container.querySelectorAll('button')).find(btn =>
        btn.querySelector('[data-icon="minus"]')
      );
      expect(decreaseButton).toBeDefined();
      if (decreaseButton) {
        fireEvent.click(decreaseButton);

        expect(mockOnChange).toHaveBeenCalledWith(-0.5);
      }
    });
  });

  describe('Increase Button Interaction', () => {
    it('should call onChange with value + step when increase button clicked', () => {
      const { container } = render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={13}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      const increaseButton = Array.from(container.querySelectorAll('button')).find(btn =>
        btn.querySelector('[data-icon="plus"]')
      );
      expect(increaseButton).toBeDefined();
      if (increaseButton) {
        fireEvent.click(increaseButton);

        expect(mockOnChange).toHaveBeenCalledWith(14);
      }
    });

    it('should be disabled when value is at maximum', () => {
      const { container } = render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={20}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      const increaseButton = Array.from(container.querySelectorAll('button')).find(btn =>
        btn.querySelector('[data-icon="plus"]')
      );
      expect(increaseButton).toBeDefined();
      if (increaseButton) {
        expect(increaseButton.hasAttribute('disabled')).toBe(true);
      }
    });

    it('should not be disabled when value is below maximum', () => {
      const { container } = render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={19}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      const increaseButton = Array.from(container.querySelectorAll('button')).find(btn =>
        btn.querySelector('[data-icon="plus"]')
      );
      expect(increaseButton).toBeDefined();
      if (increaseButton) {
        expect(increaseButton.hasAttribute('disabled')).toBe(false);
      }
    });

    it('should handle floating-point step correctly', () => {
      const { container } = render(
        <SliderControl
          label="Letter Spacing"
          description="Adjust letter spacing"
          value={0}
          min={-2}
          max={2}
          step={0.5}
          defaultValue={0}
          ariaLabel="Letter Spacing"
          onChange={mockOnChange}
        />
      );

      const increaseButton = Array.from(container.querySelectorAll('button')).find(btn =>
        btn.querySelector('[data-icon="plus"]')
      );
      expect(increaseButton).toBeDefined();
      if (increaseButton) {
        fireEvent.click(increaseButton);

        expect(mockOnChange).toHaveBeenCalledWith(0.5);
      }
    });
  });

  describe('Slider Input Interaction', () => {
    it('should call onChange with parsed float value when slider changes', () => {
      render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={13}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      const slider = screen.getByRole('slider', { name: 'Font Size' });
      fireEvent.change(slider, { target: { value: '15' } });

      expect(mockOnChange).toHaveBeenCalledWith(15);
    });

    it('should parse floating-point values correctly', () => {
      render(
        <SliderControl
          label="Line Height"
          description="Adjust line height"
          value={1.2}
          min={1.0}
          max={1.5}
          step={0.05}
          defaultValue={1.2}
          ariaLabel="Line Height"
          onChange={mockOnChange}
        />
      );

      const slider = screen.getByRole('slider', { name: 'Line Height' });
      fireEvent.change(slider, { target: { value: '1.35' } });

      expect(mockOnChange).toHaveBeenCalledWith(1.35);
    });
  });

  describe('Accessibility', () => {
    it('should have aria-label on slider input', () => {
      render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={13}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size Control"
          onChange={mockOnChange}
        />
      );

      const slider = screen.getByRole('slider', { name: 'Font Size Control' });
      expect(slider).toBeDefined();
    });

    it('should have proper button titles for accessibility', () => {
      const { container } = render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={14}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      // Buttons should have titles for accessibility
      const buttons = container.querySelectorAll('button[title]');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should have visible label for screen readers', () => {
      const { container } = render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={13}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      expect(container.textContent).toContain('Font Size');
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle negative values correctly', () => {
      const { container } = render(
        <SliderControl
          label="Letter Spacing"
          description="Adjust letter spacing"
          value={-1}
          min={-2}
          max={2}
          step={0.5}
          defaultValue={0}
          ariaLabel="Letter Spacing"
          onChange={mockOnChange}
        />
      );

      expect(container.textContent).toContain('-1');

      const decreaseButton = Array.from(container.querySelectorAll('button')).find(btn =>
        btn.querySelector('[data-icon="minus"]')
      );
      expect(decreaseButton).toBeDefined();
      if (decreaseButton) {
        fireEvent.click(decreaseButton);
        expect(mockOnChange).toHaveBeenCalledWith(-1.5);
      }
    });

    it('should handle zero value correctly', () => {
      const { container } = render(
        <SliderControl
          label="Letter Spacing"
          description="Adjust letter spacing"
          value={0}
          min={-2}
          max={2}
          step={0.5}
          defaultValue={0}
          ariaLabel="Letter Spacing"
          onChange={mockOnChange}
        />
      );

      expect(container.textContent).toContain('0');
    });

    it('should handle very small step values', () => {
      render(
        <SliderControl
          label="Precision"
          description="Adjust precision"
          value={0.5}
          min={0}
          max={1}
          step={0.01}
          defaultValue={0.5}
          ariaLabel="Precision"
          onChange={mockOnChange}
        />
      );

      const slider = screen.getByRole('slider', { name: 'Precision' }) as HTMLInputElement;
      expect(slider.step).toBe('0.01');
    });

    it('should handle large ranges', () => {
      render(
        <SliderControl
          label="Range"
          description="Adjust range"
          value={500}
          min={0}
          max={1000}
          step={10}
          defaultValue={500}
          ariaLabel="Range"
          onChange={mockOnChange}
        />
      );

      const slider = screen.getByRole('slider', { name: 'Range' }) as HTMLInputElement;
      expect(slider.min).toBe('0');
      expect(slider.max).toBe('1000');
      expect(slider.step).toBe('10');
    });
  });

  describe('Defensive Programming', () => {
    it('should handle empty labelKey with fallback to empty string', () => {
      const { container } = render(
        <SliderControl
          labelKey=""
          descriptionKey=""
          value={13}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      // Component should not crash, just render empty labels
      expect(container).toBeDefined();
    });

    it('should handle missing displayValue gracefully', () => {
      const { container } = render(
        <SliderControl
          label="Font Size"
          description="Adjust the font size"
          value={13}
          min={10}
          max={20}
          step={1}
          defaultValue={13}
          ariaLabel="Font Size"
          onChange={mockOnChange}
        />
      );

      // Should display numeric value instead
      expect(container.textContent).toContain('13');
    });
  });
});
