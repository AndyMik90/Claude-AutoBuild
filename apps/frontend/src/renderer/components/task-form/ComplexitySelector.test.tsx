/**
 * @vitest-environment jsdom
 */
/**
 * Tests for ComplexitySelector component
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComplexitySelector } from './ComplexitySelector';

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'tasks:executionComplexity.label': 'Task Complexity',
        'tasks:executionComplexity.helpText': 'Choose how much planning and effort the AI should invest in this task.',
        'tasks:executionComplexity.auto.label': 'Auto-detect',
        'tasks:executionComplexity.auto.description': 'Let AI assess the task complexity',
        'tasks:executionComplexity.quick.label': 'Quick',
        'tasks:executionComplexity.quick.description': 'Simple tasks with minimal planning',
        'tasks:executionComplexity.standard.label': 'Standard',
        'tasks:executionComplexity.standard.description': 'Normal tasks with full planning',
        'tasks:executionComplexity.complex.label': 'Complex',
        'tasks:executionComplexity.complex.description': 'Large features with extensive research'
      };
      return translations[key] || key;
    }
  })
}));

describe('ComplexitySelector', () => {
  const defaultProps = {
    value: 'auto' as const,
    onChange: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with label and help text', () => {
    render(<ComplexitySelector {...defaultProps} />);

    expect(screen.getByText('Task Complexity')).toBeInTheDocument();
    expect(screen.getByText(/choose how much planning/i)).toBeInTheDocument();
  });

  it('displays Auto-detect as default value', () => {
    render(<ComplexitySelector {...defaultProps} />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('Auto-detect');
  });

  it('shows all complexity options when dropdown is opened', async () => {
    render(<ComplexitySelector {...defaultProps} />);

    // Open the dropdown
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    // Wait for dropdown to open and check options
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('Auto-detect')).toBeInTheDocument();
    expect(within(listbox).getByText('Quick')).toBeInTheDocument();
    expect(within(listbox).getByText('Standard')).toBeInTheDocument();
    expect(within(listbox).getByText('Complex')).toBeInTheDocument();
  });

  it('shows descriptions for each option', async () => {
    render(<ComplexitySelector {...defaultProps} />);

    // Open the dropdown
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    // Check descriptions are present
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText(/let ai assess/i)).toBeInTheDocument();
    expect(within(listbox).getByText(/simple tasks with minimal/i)).toBeInTheDocument();
    expect(within(listbox).getByText(/normal tasks with full/i)).toBeInTheDocument();
    expect(within(listbox).getByText(/large features with extensive/i)).toBeInTheDocument();
  });

  it('calls onChange when a different option is selected', async () => {
    const onChange = vi.fn();
    render(<ComplexitySelector value="auto" onChange={onChange} />);

    // Open the dropdown
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    // Click on Quick option
    const listbox = await screen.findByRole('listbox');
    const quickOption = within(listbox).getByRole('option', { name: /quick/i });
    fireEvent.click(quickOption);

    expect(onChange).toHaveBeenCalledWith('quick');
  });

  it('reflects the selected value correctly', () => {
    const { rerender } = render(<ComplexitySelector value="auto" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Auto-detect');

    rerender(<ComplexitySelector value="quick" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Quick');

    rerender(<ComplexitySelector value="standard" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Standard');

    rerender(<ComplexitySelector value="complex" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Complex');
  });

  it('respects disabled state', () => {
    render(<ComplexitySelector {...defaultProps} disabled />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeDisabled();
  });

  it('uses idPrefix for accessibility', () => {
    render(<ComplexitySelector {...defaultProps} idPrefix="test" />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('id', 'test-execution-complexity');
    expect(trigger).toHaveAttribute('aria-describedby', 'test-execution-complexity-help');

    // Verify help text has correct id
    const helpText = screen.getByText(/choose how much planning/i);
    expect(helpText).toHaveAttribute('id', 'test-execution-complexity-help');
  });

  describe('icon colors', () => {
    it('shows info color for Auto-detect icon in trigger', () => {
      render(<ComplexitySelector value="auto" onChange={vi.fn()} />);

      const trigger = screen.getByRole('combobox');
      const icon = trigger.querySelector('svg');
      expect(icon).toHaveClass('text-info');
    });

    it('shows warning color for Quick icon in trigger', () => {
      render(<ComplexitySelector value="quick" onChange={vi.fn()} />);

      const trigger = screen.getByRole('combobox');
      const icon = trigger.querySelector('svg');
      expect(icon).toHaveClass('text-warning');
    });

    it('shows primary color for Standard icon in trigger', () => {
      render(<ComplexitySelector value="standard" onChange={vi.fn()} />);

      const trigger = screen.getByRole('combobox');
      const icon = trigger.querySelector('svg');
      expect(icon).toHaveClass('text-primary');
    });

    it('shows destructive color for Complex icon in trigger', () => {
      render(<ComplexitySelector value="complex" onChange={vi.fn()} />);

      const trigger = screen.getByRole('combobox');
      const icon = trigger.querySelector('svg');
      expect(icon).toHaveClass('text-destructive');
    });

    it('shows correct colors for all icons in dropdown', async () => {
      render(<ComplexitySelector {...defaultProps} />);

      // Open the dropdown
      const trigger = screen.getByRole('combobox');
      fireEvent.click(trigger);

      // Wait for dropdown to open
      const listbox = await screen.findByRole('listbox');
      const options = within(listbox).getAllByRole('option');

      // Check each option has correct icon color
      // Note: Radix Select adds a check icon to selected options, so we need to query
      // for our specific icon by finding the one that's NOT the checkmark
      // Our icons are in a div with flex items-center gap-2

      // Auto-detect (first option) - find icon within the content div
      const autoContentDiv = options[0].querySelector('div.flex.items-center.gap-2');
      const autoIcon = autoContentDiv?.querySelector('svg');
      expect(autoIcon).toHaveClass('text-info');

      // Quick (second option)
      const quickContentDiv = options[1].querySelector('div.flex.items-center.gap-2');
      const quickIcon = quickContentDiv?.querySelector('svg');
      expect(quickIcon).toHaveClass('text-warning');

      // Standard (third option)
      const standardContentDiv = options[2].querySelector('div.flex.items-center.gap-2');
      const standardIcon = standardContentDiv?.querySelector('svg');
      expect(standardIcon).toHaveClass('text-primary');

      // Complex (fourth option)
      const complexContentDiv = options[3].querySelector('div.flex.items-center.gap-2');
      const complexIcon = complexContentDiv?.querySelector('svg');
      expect(complexIcon).toHaveClass('text-destructive');
    });
  });

  describe('accessibility', () => {
    it('links trigger to help text via aria-describedby', () => {
      render(<ComplexitySelector {...defaultProps} />);

      const trigger = screen.getByRole('combobox');
      const helpText = screen.getByText(/choose how much planning/i);

      expect(trigger).toHaveAttribute('aria-describedby', 'execution-complexity-help');
      expect(helpText).toHaveAttribute('id', 'execution-complexity-help');
    });

    it('has proper label association', () => {
      render(<ComplexitySelector {...defaultProps} />);

      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveAttribute('id', 'execution-complexity');

      // Label should be associated via htmlFor
      const label = screen.getByText('Task Complexity');
      expect(label).toHaveAttribute('for', 'execution-complexity');
    });
  });
});
