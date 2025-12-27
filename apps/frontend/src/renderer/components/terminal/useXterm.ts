import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { terminalBufferManager } from '../../lib/terminal-buffer-manager';

interface UseXtermOptions {
  terminalId: string;
  onCommandEnter?: (command: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

export function useXterm({ terminalId, onCommandEnter, onResize }: UseXtermOptions) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const commandBufferRef = useRef<string>('');

  // Initialize xterm.js UI
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const xterm = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: 'var(--font-mono), "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
      lineHeight: 1.2,
      letterSpacing: 0,
      theme: {
        background: '#0B0B0F',
        foreground: '#E8E6E3',
        cursor: '#D6D876',
        cursorAccent: '#0B0B0F',
        selectionBackground: '#D6D87640',
        selectionForeground: '#E8E6E3',
        black: '#1A1A1F',
        red: '#FF6B6B',
        green: '#87D687',
        yellow: '#D6D876',
        blue: '#6BB3FF',
        magenta: '#C792EA',
        cyan: '#89DDFF',
        white: '#E8E6E3',
        brightBlack: '#4A4A50',
        brightRed: '#FF8A8A',
        brightGreen: '#A5E6A5',
        brightYellow: '#E8E87A',
        brightBlue: '#8AC4FF',
        brightMagenta: '#DEB3FF',
        brightCyan: '#A6E8FF',
        brightWhite: '#FFFFFF',
      },
      allowProposedApi: true,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    xterm.open(terminalRef.current);

    setTimeout(() => {
      fitAddon.fit();
    }, 50);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Replay buffered output if this is a remount or restored session
    const bufferedOutput = terminalBufferManager.get(terminalId);
    if (bufferedOutput && bufferedOutput.length > 0) {
      xterm.write(bufferedOutput);
      // Clear buffer after replay to avoid duplicate output
      terminalBufferManager.clear(terminalId);
    }

    // Handle terminal input
    xterm.onData((data) => {
      window.electronAPI.sendTerminalInput(terminalId, data);

      // Track commands for auto-naming
      if (data === '\r' || data === '\n') {
        const command = commandBufferRef.current;
        commandBufferRef.current = '';
        if (onCommandEnter) {
          onCommandEnter(command);
        }
      } else if (data === '\x7f' || data === '\b') {
        commandBufferRef.current = commandBufferRef.current.slice(0, -1);
      } else if (data === '\x03') {
        commandBufferRef.current = '';
      } else if (data.charCodeAt(0) >= 32 && data.charCodeAt(0) < 127) {
        commandBufferRef.current += data;
      }
    });

    // Handle resize
    xterm.onResize(({ cols, rows }) => {
      if (onResize) {
        onResize(cols, rows);
      }
    });

    return () => {
      // Cleanup handled by parent component
    };
  }, [terminalId, onCommandEnter, onResize]);

  // Handle resize on container resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
      }
    };

    const container = terminalRef.current?.parentElement;
    if (container) {
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
      return () => resizeObserver.disconnect();
    }
  }, []);

  const fit = useCallback(() => {
    if (fitAddonRef.current && xtermRef.current) {
      fitAddonRef.current.fit();
    }
  }, []);

  const write = useCallback((data: string) => {
    if (xtermRef.current) {
      xtermRef.current.write(data);
    }
  }, []);

  const writeln = useCallback((data: string) => {
    if (xtermRef.current) {
      xtermRef.current.writeln(data);
    }
  }, []);

  const focus = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.focus();
    }
  }, []);

  const dispose = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.dispose();
      xtermRef.current = null;
    }
  }, []);

  return {
    terminalRef,
    xtermRef,
    fitAddonRef,
    fit,
    write,
    writeln,
    focus,
    dispose,
    cols: xtermRef.current?.cols || 80,
    rows: xtermRef.current?.rows || 24,
  };
}
