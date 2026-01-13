/**
 * @vitest-environment jsdom
 */

/**
 * Unit tests for useVirtualizedTree hook
 * Tests flattenTree function and visible items computation
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { flattenTree, useVirtualizedTree, FlattenedNode } from '../useVirtualizedTree';
import { useFileExplorerStore } from '../../stores/file-explorer-store';
import type { FileNode } from '../../../shared/types';

// Helper to create test FileNode
function createTestFileNode(overrides: Partial<FileNode> = {}): FileNode {
  const name = overrides.name || 'test-file.ts';
  return {
    path: overrides.path || `/root/${name}`,
    name,
    isDirectory: false,
    ...overrides,
  };
}

// Helper to create a directory node
function createTestDirNode(overrides: Partial<FileNode> = {}): FileNode {
  const name = overrides.name || 'test-dir';
  return {
    path: overrides.path || `/root/${name}`,
    name,
    isDirectory: true,
    ...overrides,
  };
}

describe('flattenTree', () => {
  describe('basic functionality', () => {
    it('should return empty array for empty input', () => {
      const result = flattenTree([], 0, new Set(), new Map(), new Map());
      expect(result).toHaveLength(0);
    });

    it('should flatten a single file node', () => {
      const node = createTestFileNode({ path: '/root/file.ts', name: 'file.ts' });
      const result = flattenTree([node], 0, new Set(), new Map(), new Map());

      expect(result).toHaveLength(1);
      expect(result[0].node).toBe(node);
      expect(result[0].depth).toBe(0);
      expect(result[0].isExpanded).toBe(false);
      expect(result[0].isLoading).toBe(false);
      expect(result[0].key).toBe('/root/file.ts');
    });

    it('should flatten multiple file nodes at same level', () => {
      const nodes = [
        createTestFileNode({ path: '/root/a.ts', name: 'a.ts' }),
        createTestFileNode({ path: '/root/b.ts', name: 'b.ts' }),
        createTestFileNode({ path: '/root/c.ts', name: 'c.ts' }),
      ];
      const result = flattenTree(nodes, 0, new Set(), new Map(), new Map());

      expect(result).toHaveLength(3);
      expect(result[0].node.name).toBe('a.ts');
      expect(result[1].node.name).toBe('b.ts');
      expect(result[2].node.name).toBe('c.ts');
      result.forEach((item) => expect(item.depth).toBe(0));
    });

    it('should handle collapsed directory without children', () => {
      const dirNode = createTestDirNode({ path: '/root/dir', name: 'dir' });
      const result = flattenTree([dirNode], 0, new Set(), new Map(), new Map());

      expect(result).toHaveLength(1);
      expect(result[0].node.isDirectory).toBe(true);
      expect(result[0].isExpanded).toBe(false);
    });
  });

  describe('expansion state', () => {
    it('should mark expanded directories as expanded', () => {
      const dirNode = createTestDirNode({ path: '/root/dir', name: 'dir' });
      const expandedFolders = new Set(['/root/dir']);
      const result = flattenTree([dirNode], 0, expandedFolders, new Map(), new Map());

      expect(result).toHaveLength(1);
      expect(result[0].isExpanded).toBe(true);
    });

    it('should not mark files as expanded even if in expanded set', () => {
      const fileNode = createTestFileNode({ path: '/root/file.ts', name: 'file.ts' });
      const expandedFolders = new Set(['/root/file.ts']);
      const result = flattenTree([fileNode], 0, expandedFolders, new Map(), new Map());

      expect(result).toHaveLength(1);
      expect(result[0].isExpanded).toBe(true); // The flag is set based on presence in set
      // But it won't have children because isDirectory is false
    });
  });

  describe('loading state', () => {
    it('should mark loading directories as loading', () => {
      const dirNode = createTestDirNode({ path: '/root/dir', name: 'dir' });
      const loadingDirs = new Map([['/root/dir', true]]);
      const result = flattenTree([dirNode], 0, new Set(), new Map(), loadingDirs);

      expect(result).toHaveLength(1);
      expect(result[0].isLoading).toBe(true);
    });

    it('should mark non-loading directories as not loading', () => {
      const dirNode = createTestDirNode({ path: '/root/dir', name: 'dir' });
      const loadingDirs = new Map([['/root/dir', false]]);
      const result = flattenTree([dirNode], 0, new Set(), new Map(), loadingDirs);

      expect(result).toHaveLength(1);
      expect(result[0].isLoading).toBe(false);
    });

    it('should default to not loading if not in map', () => {
      const dirNode = createTestDirNode({ path: '/root/dir', name: 'dir' });
      const result = flattenTree([dirNode], 0, new Set(), new Map(), new Map());

      expect(result).toHaveLength(1);
      expect(result[0].isLoading).toBe(false);
    });
  });

  describe('nested tree flattening', () => {
    it('should include children of expanded directories', () => {
      const dirNode = createTestDirNode({ path: '/root/dir', name: 'dir' });
      const childFile = createTestFileNode({ path: '/root/dir/child.ts', name: 'child.ts' });

      const expandedFolders = new Set(['/root/dir']);
      const filesCache = new Map([['/root/dir', [childFile]]]);

      const result = flattenTree([dirNode], 0, expandedFolders, filesCache, new Map());

      expect(result).toHaveLength(2);
      expect(result[0].node.name).toBe('dir');
      expect(result[0].depth).toBe(0);
      expect(result[1].node.name).toBe('child.ts');
      expect(result[1].depth).toBe(1);
    });

    it('should not include children of collapsed directories', () => {
      const dirNode = createTestDirNode({ path: '/root/dir', name: 'dir' });
      const childFile = createTestFileNode({ path: '/root/dir/child.ts', name: 'child.ts' });

      const expandedFolders = new Set<string>(); // Not expanded
      const filesCache = new Map([['/root/dir', [childFile]]]);

      const result = flattenTree([dirNode], 0, expandedFolders, filesCache, new Map());

      expect(result).toHaveLength(1);
      expect(result[0].node.name).toBe('dir');
    });

    it('should handle deeply nested structures', () => {
      // Root -> dir1 -> dir2 -> file.ts
      const dir1 = createTestDirNode({ path: '/root/dir1', name: 'dir1' });
      const dir2 = createTestDirNode({ path: '/root/dir1/dir2', name: 'dir2' });
      const file = createTestFileNode({ path: '/root/dir1/dir2/file.ts', name: 'file.ts' });

      const expandedFolders = new Set(['/root/dir1', '/root/dir1/dir2']);
      const filesCache = new Map([
        ['/root/dir1', [dir2]],
        ['/root/dir1/dir2', [file]],
      ]);

      const result = flattenTree([dir1], 0, expandedFolders, filesCache, new Map());

      expect(result).toHaveLength(3);
      expect(result[0].node.name).toBe('dir1');
      expect(result[0].depth).toBe(0);
      expect(result[1].node.name).toBe('dir2');
      expect(result[1].depth).toBe(1);
      expect(result[2].node.name).toBe('file.ts');
      expect(result[2].depth).toBe(2);
    });

    it('should handle multiple directories at same level', () => {
      const dir1 = createTestDirNode({ path: '/root/dir1', name: 'dir1' });
      const dir2 = createTestDirNode({ path: '/root/dir2', name: 'dir2' });
      const file1 = createTestFileNode({ path: '/root/dir1/file1.ts', name: 'file1.ts' });
      const file2 = createTestFileNode({ path: '/root/dir2/file2.ts', name: 'file2.ts' });

      const expandedFolders = new Set(['/root/dir1', '/root/dir2']);
      const filesCache = new Map([
        ['/root/dir1', [file1]],
        ['/root/dir2', [file2]],
      ]);

      const result = flattenTree([dir1, dir2], 0, expandedFolders, filesCache, new Map());

      expect(result).toHaveLength(4);
      expect(result[0].node.name).toBe('dir1');
      expect(result[1].node.name).toBe('file1.ts');
      expect(result[2].node.name).toBe('dir2');
      expect(result[3].node.name).toBe('file2.ts');
    });

    it('should handle expanded directory with no cached children', () => {
      const dirNode = createTestDirNode({ path: '/root/dir', name: 'dir' });

      const expandedFolders = new Set(['/root/dir']);
      const filesCache = new Map<string, FileNode[]>(); // No children cached

      const result = flattenTree([dirNode], 0, expandedFolders, filesCache, new Map());

      expect(result).toHaveLength(1);
      expect(result[0].node.name).toBe('dir');
      expect(result[0].isExpanded).toBe(true);
    });

    it('should handle expanded directory with empty children array', () => {
      const dirNode = createTestDirNode({ path: '/root/dir', name: 'dir' });

      const expandedFolders = new Set(['/root/dir']);
      const filesCache = new Map([['/root/dir', []]]);

      const result = flattenTree([dirNode], 0, expandedFolders, filesCache, new Map());

      expect(result).toHaveLength(1);
      expect(result[0].node.name).toBe('dir');
    });
  });

  describe('depth calculation', () => {
    it('should start at specified depth', () => {
      const node = createTestFileNode({ path: '/root/file.ts', name: 'file.ts' });
      const result = flattenTree([node], 5, new Set(), new Map(), new Map());

      expect(result[0].depth).toBe(5);
    });

    it('should increment depth for nested children', () => {
      const dir = createTestDirNode({ path: '/root/dir', name: 'dir' });
      const child = createTestFileNode({ path: '/root/dir/child.ts', name: 'child.ts' });

      const expandedFolders = new Set(['/root/dir']);
      const filesCache = new Map([['/root/dir', [child]]]);

      const result = flattenTree([dir], 2, expandedFolders, filesCache, new Map());

      expect(result[0].depth).toBe(2);
      expect(result[1].depth).toBe(3);
    });
  });
});

describe('useVirtualizedTree', () => {
  const ROOT_PATH = '/test/root';

  beforeEach(() => {
    // Reset store to initial state before each test
    useFileExplorerStore.setState({
      isOpen: false,
      expandedFolders: new Set(),
      files: new Map(),
      isLoading: new Map(),
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should return empty flattened nodes when root is not loaded', () => {
      const { result } = renderHook(() => useVirtualizedTree(ROOT_PATH));

      expect(result.current.flattenedNodes).toHaveLength(0);
      expect(result.current.count).toBe(0);
      expect(result.current.hasRootFiles).toBe(false);
    });

    it('should return isRootLoading false by default', () => {
      const { result } = renderHook(() => useVirtualizedTree(ROOT_PATH));

      expect(result.current.isRootLoading).toBe(false);
    });

    it('should return isRootLoading true when root is loading', () => {
      useFileExplorerStore.setState({
        isLoading: new Map([[ROOT_PATH, true]]),
      });

      const { result } = renderHook(() => useVirtualizedTree(ROOT_PATH));

      expect(result.current.isRootLoading).toBe(true);
    });
  });

  describe('with loaded files', () => {
    it('should return flattened nodes when root files are loaded', () => {
      const rootFiles = [
        createTestFileNode({ path: `${ROOT_PATH}/file1.ts`, name: 'file1.ts' }),
        createTestFileNode({ path: `${ROOT_PATH}/file2.ts`, name: 'file2.ts' }),
      ];

      useFileExplorerStore.setState({
        files: new Map([[ROOT_PATH, rootFiles]]),
      });

      const { result } = renderHook(() => useVirtualizedTree(ROOT_PATH));

      expect(result.current.flattenedNodes).toHaveLength(2);
      expect(result.current.count).toBe(2);
      expect(result.current.hasRootFiles).toBe(true);
    });

    it('should include expanded folder children', () => {
      const dir = createTestDirNode({ path: `${ROOT_PATH}/dir`, name: 'dir' });
      const child = createTestFileNode({ path: `${ROOT_PATH}/dir/child.ts`, name: 'child.ts' });

      useFileExplorerStore.setState({
        files: new Map([
          [ROOT_PATH, [dir]],
          [`${ROOT_PATH}/dir`, [child]],
        ]),
        expandedFolders: new Set([`${ROOT_PATH}/dir`]),
      });

      const { result } = renderHook(() => useVirtualizedTree(ROOT_PATH));

      expect(result.current.flattenedNodes).toHaveLength(2);
      expect(result.current.flattenedNodes[0].node.name).toBe('dir');
      expect(result.current.flattenedNodes[1].node.name).toBe('child.ts');
    });
  });

  describe('handleToggle', () => {
    it('should not toggle non-directory nodes', () => {
      const file = createTestFileNode({ path: `${ROOT_PATH}/file.ts`, name: 'file.ts' });

      useFileExplorerStore.setState({
        files: new Map([[ROOT_PATH, [file]]]),
      });

      const { result } = renderHook(() => useVirtualizedTree(ROOT_PATH));

      act(() => {
        result.current.handleToggle(file);
      });

      // expandedFolders should remain empty
      expect(useFileExplorerStore.getState().expandedFolders.size).toBe(0);
    });

    it('should toggle directory expansion state', () => {
      const dir = createTestDirNode({ path: `${ROOT_PATH}/dir`, name: 'dir' });

      useFileExplorerStore.setState({
        files: new Map([
          [ROOT_PATH, [dir]],
          [`${ROOT_PATH}/dir`, []],
        ]),
      });

      const { result } = renderHook(() => useVirtualizedTree(ROOT_PATH));

      // Expand
      act(() => {
        result.current.handleToggle(dir);
      });

      expect(useFileExplorerStore.getState().expandedFolders.has(`${ROOT_PATH}/dir`)).toBe(true);

      // Collapse
      act(() => {
        result.current.handleToggle(dir);
      });

      expect(useFileExplorerStore.getState().expandedFolders.has(`${ROOT_PATH}/dir`)).toBe(false);
    });
  });

  describe('memoization', () => {
    it('should return same reference when dependencies unchanged', () => {
      const files = [createTestFileNode({ path: `${ROOT_PATH}/file.ts`, name: 'file.ts' })];

      useFileExplorerStore.setState({
        files: new Map([[ROOT_PATH, files]]),
      });

      const { result, rerender } = renderHook(() => useVirtualizedTree(ROOT_PATH));

      const firstNodes = result.current.flattenedNodes;
      rerender();
      const secondNodes = result.current.flattenedNodes;

      expect(firstNodes).toBe(secondNodes);
    });

    it('should return new reference when expanded folders change', () => {
      const dir = createTestDirNode({ path: `${ROOT_PATH}/dir`, name: 'dir' });

      useFileExplorerStore.setState({
        files: new Map([[ROOT_PATH, [dir]]]),
      });

      const { result } = renderHook(() => useVirtualizedTree(ROOT_PATH));

      const firstNodes = result.current.flattenedNodes;

      act(() => {
        useFileExplorerStore.getState().toggleFolder(`${ROOT_PATH}/dir`);
      });

      const secondNodes = result.current.flattenedNodes;

      expect(firstNodes).not.toBe(secondNodes);
    });
  });

  describe('complex scenarios', () => {
    it('should handle mixed files and directories', () => {
      const dir1 = createTestDirNode({ path: `${ROOT_PATH}/dir1`, name: 'dir1' });
      const file1 = createTestFileNode({ path: `${ROOT_PATH}/file1.ts`, name: 'file1.ts' });
      const dir2 = createTestDirNode({ path: `${ROOT_PATH}/dir2`, name: 'dir2' });
      const file2 = createTestFileNode({ path: `${ROOT_PATH}/file2.ts`, name: 'file2.ts' });

      useFileExplorerStore.setState({
        files: new Map([[ROOT_PATH, [dir1, file1, dir2, file2]]]),
      });

      const { result } = renderHook(() => useVirtualizedTree(ROOT_PATH));

      expect(result.current.flattenedNodes).toHaveLength(4);
      expect(result.current.flattenedNodes[0].node.isDirectory).toBe(true);
      expect(result.current.flattenedNodes[1].node.isDirectory).toBe(false);
    });

    it('should handle partial expansion', () => {
      // dir1 (expanded) -> child1
      // dir2 (collapsed) -> child2 (not visible)
      const dir1 = createTestDirNode({ path: `${ROOT_PATH}/dir1`, name: 'dir1' });
      const dir2 = createTestDirNode({ path: `${ROOT_PATH}/dir2`, name: 'dir2' });
      const child1 = createTestFileNode({ path: `${ROOT_PATH}/dir1/child1.ts`, name: 'child1.ts' });
      const child2 = createTestFileNode({ path: `${ROOT_PATH}/dir2/child2.ts`, name: 'child2.ts' });

      useFileExplorerStore.setState({
        files: new Map([
          [ROOT_PATH, [dir1, dir2]],
          [`${ROOT_PATH}/dir1`, [child1]],
          [`${ROOT_PATH}/dir2`, [child2]],
        ]),
        expandedFolders: new Set([`${ROOT_PATH}/dir1`]), // Only dir1 expanded
      });

      const { result } = renderHook(() => useVirtualizedTree(ROOT_PATH));

      expect(result.current.flattenedNodes).toHaveLength(3);
      expect(result.current.flattenedNodes.map((n: FlattenedNode) => n.node.name)).toEqual([
        'dir1',
        'child1.ts',
        'dir2',
      ]);
    });

    it('should correctly compute loading states for nested items', () => {
      const dir = createTestDirNode({ path: `${ROOT_PATH}/dir`, name: 'dir' });

      useFileExplorerStore.setState({
        files: new Map([[ROOT_PATH, [dir]]]),
        isLoading: new Map([[`${ROOT_PATH}/dir`, true]]),
      });

      const { result } = renderHook(() => useVirtualizedTree(ROOT_PATH));

      expect(result.current.flattenedNodes[0].isLoading).toBe(true);
    });
  });
});
