/**
 * Tests for version-manager.ts
 *
 * Tests the compareVersions function with various version formats
 * including pre-release versions (alpha, beta, rc).
 */

import { describe, test, expect } from 'vitest';
import { compareVersions } from '../updater/version-manager';

describe('compareVersions', () => {
  describe('basic version comparison', () => {
    test('equal versions return 0', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('2.7.2', '2.7.2')).toBe(0);
    });

    test('newer major version returns 1', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('3.0.0', '2.7.2')).toBe(1);
    });

    test('older major version returns -1', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    });

    test('newer minor version returns 1', () => {
      expect(compareVersions('2.8.0', '2.7.2')).toBe(1);
    });

    test('older minor version returns -1', () => {
      expect(compareVersions('2.6.0', '2.7.2')).toBe(-1);
    });

    test('newer patch version returns 1', () => {
      expect(compareVersions('2.7.3', '2.7.2')).toBe(1);
    });

    test('older patch version returns -1', () => {
      expect(compareVersions('2.7.1', '2.7.2')).toBe(-1);
    });
  });

  describe('pre-release version comparison', () => {
    test('stable is newer than same-version beta', () => {
      expect(compareVersions('2.7.2', '2.7.2-beta.6')).toBe(1);
      expect(compareVersions('2.7.2-beta.6', '2.7.2')).toBe(-1);
    });

    test('stable is newer than same-version alpha', () => {
      expect(compareVersions('2.7.2', '2.7.2-alpha.1')).toBe(1);
    });

    test('beta is newer than alpha of same version', () => {
      expect(compareVersions('2.7.2-beta.1', '2.7.2-alpha.1')).toBe(1);
    });

    test('rc is newer than beta of same version', () => {
      expect(compareVersions('2.7.2-rc.1', '2.7.2-beta.6')).toBe(1);
    });

    test('higher beta number is newer', () => {
      expect(compareVersions('2.7.2-beta.7', '2.7.2-beta.6')).toBe(1);
      expect(compareVersions('2.7.2-beta.6', '2.7.2-beta.7')).toBe(-1);
    });

    test('equal pre-release versions return 0', () => {
      expect(compareVersions('2.7.2-beta.6', '2.7.2-beta.6')).toBe(0);
    });
  });

  describe('cross-version pre-release comparison', () => {
    test('beta of newer version is newer than stable of older version', () => {
      // 2.7.2-beta.1 > 2.7.1 (stable)
      expect(compareVersions('2.7.2-beta.1', '2.7.1')).toBe(1);
    });

    test('stable of older version is older than beta of newer version', () => {
      // 2.7.1 (stable) < 2.7.2-beta.6
      expect(compareVersions('2.7.1', '2.7.2-beta.6')).toBe(-1);
    });

    // THIS IS THE BUG WE'RE FIXING:
    // When on 2.7.2-beta.6, the updater was offering 2.7.1 as an "update"
    test('stable 2.7.1 is NOT newer than beta 2.7.2-beta.6', () => {
      expect(compareVersions('2.7.1', '2.7.2-beta.6')).toBe(-1);
    });
  });

  describe('edge cases', () => {
    test('handles versions with missing parts', () => {
      expect(compareVersions('2.7', '2.7.0')).toBe(0);
      expect(compareVersions('2', '2.0.0')).toBe(0);
    });

    test('handles pre-release without number', () => {
      // "beta" without a number should be treated as beta.0
      expect(compareVersions('2.7.2-beta', '2.7.2-beta.1')).toBe(-1);
    });
  });
});
