/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LogViewer } from '../LogViewer';

// Mock the translation hook
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'logs.sourceLabel': 'Log Source',
        'logs.sources.all': 'All Logs',
        'logs.sources.errorsOnly': 'Errors Only',
        'logs.filterLabel': 'Filter by Level',
        'logs.autoScroll': 'Auto-scroll',
        'logs.refreshButton': 'Refresh',
        'logs.clearButton': 'Clear Logs',
        'logs.noLogs': 'No logs available for this source.',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock the electron API
const mockGetRecentErrors = vi.fn();
const mockGetRecentLogs = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.window = {
    ...global.window,
    electronAPI: {
      getRecentErrors: mockGetRecentErrors,
      getRecentLogs: mockGetRecentLogs,
    },
  } as any;
});

describe('LogViewer', () => {
  it('should render log source selector', () => {
    mockGetRecentLogs.mockResolvedValue([]);
    
    render(<LogViewer />);
    
    expect(screen.getByText('Log Source')).toBeInTheDocument();
  });

  it('should load all logs on mount', async () => {
    const mockLogs = [
      '[2024-01-01 10:00:00.000] [info] Test info message',
      '[2024-01-01 10:00:01.000] [error] Test error message',
    ];
    mockGetRecentLogs.mockResolvedValue(mockLogs);
    
    render(<LogViewer />);
    
    await waitFor(() => {
      expect(mockGetRecentLogs).toHaveBeenCalledWith(200);
    });
  });

  it('should load errors only when source is changed', async () => {
    const mockErrors = [
      '[2024-01-01 10:00:01.000] [error] Test error message',
    ];
    mockGetRecentErrors.mockResolvedValue(mockErrors);
    mockGetRecentLogs.mockResolvedValue([]);
    
    const { container } = render(<LogViewer />);
    
    // Find and click the select trigger
    const selectTrigger = container.querySelector('[role="combobox"]');
    if (selectTrigger) {
      fireEvent.click(selectTrigger);
    }
    
    // Wait for the select to open and options to be available
    await waitFor(() => {
      const errorsOption = screen.queryByText('Errors Only');
      if (errorsOption) {
        fireEvent.click(errorsOption);
      }
    });
    
    // Verify errors endpoint was called
    await waitFor(() => {
      expect(mockGetRecentErrors).toHaveBeenCalledWith(100);
    });
  });

  it('should clear logs when clear button is clicked', async () => {
    const mockLogs = [
      '[2024-01-01 10:00:00.000] [info] Test message',
    ];
    mockGetRecentLogs.mockResolvedValue(mockLogs);
    
    render(<LogViewer />);
    
    await waitFor(() => {
      expect(screen.getByText(/Test message/)).toBeInTheDocument();
    });
    
    const clearButton = screen.getByText('Clear Logs');
    fireEvent.click(clearButton);
    
    await waitFor(() => {
      expect(screen.getByText('No logs available for this source.')).toBeInTheDocument();
    });
  });

  it('should refresh logs when refresh button is clicked', async () => {
    mockGetRecentLogs.mockResolvedValue([]);
    
    render(<LogViewer />);
    
    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);
    
    await waitFor(() => {
      expect(mockGetRecentLogs).toHaveBeenCalledTimes(2); // Once on mount, once on refresh
    });
  });

  it('should parse log lines correctly', async () => {
    const mockLogs = [
      '[2024-01-01 10:00:00.123] [error] Test error',
      '[2024-01-01 10:00:01.456] [warn] Test warning',
      '[2024-01-01 10:00:02.789] [info] Test info',
      '[2024-01-01 10:00:03.012] [debug] Test debug',
    ];
    mockGetRecentLogs.mockResolvedValue(mockLogs);
    
    render(<LogViewer />);
    
    await waitFor(() => {
      expect(screen.getByText(/ERROR/)).toBeInTheDocument();
      expect(screen.getByText(/WARN/)).toBeInTheDocument();
      expect(screen.getByText(/INFO/)).toBeInTheDocument();
      expect(screen.getByText(/DEBUG/)).toBeInTheDocument();
    });
  });
});
