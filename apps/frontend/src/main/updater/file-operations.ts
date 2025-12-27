/**
 * File operation utilities for updates
 */

import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SKIP_FILES } from './config';

const execAsync = promisify(exec);

/**
 * Extract a .tar.gz file
 * Uses system tar command on Unix or PowerShell on Windows
 */
export async function extractTarball(tarballPath: string, destPath: string): Promise<void> {
  try {
    if (process.platform === 'win32') {
      // On Windows, try multiple approaches:
      // 1. Modern Windows 10/11 has built-in tar
      // 2. Fall back to PowerShell's Expand-Archive for .zip (but .tar.gz needs tar)
      // 3. Use PowerShell to extract via .NET
      try {
        // First try native tar (available on Windows 10 1803+)
        await execAsync(`tar -xzf "${tarballPath}" -C "${destPath}"`);
      } catch {
        // Fall back to PowerShell with .NET for gzip decompression
        // This is more complex but works on older Windows versions
        const psScript = `
          $tarball = "${tarballPath.replace(/\\/g, '\\\\')}"
          $dest = "${destPath.replace(/\\/g, '\\\\')}"
          $tempTar = Join-Path $env:TEMP "auto-claude-update.tar"

          # Decompress gzip
          $gzipStream = [System.IO.File]::OpenRead($tarball)
          $decompressedStream = New-Object System.IO.Compression.GZipStream($gzipStream, [System.IO.Compression.CompressionMode]::Decompress)
          $tarStream = [System.IO.File]::Create($tempTar)
          $decompressedStream.CopyTo($tarStream)
          $tarStream.Close()
          $decompressedStream.Close()
          $gzipStream.Close()

          # Extract tar using tar command (should work even if gzip didn't)
          tar -xf $tempTar -C $dest
          Remove-Item $tempTar -Force
        `;
        await execAsync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);
      }
    } else {
      // Unix systems - use native tar
      await execAsync(`tar -xzf "${tarballPath}" -C "${destPath}"`);
    }
  } catch (error) {
    throw new Error(`Failed to extract tarball: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Recursively copy directory
 */
export function copyDirectoryRecursive(
  src: string,
  dest: string,
  preserveExisting: boolean = false
): void {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip certain files/directories
    if (SKIP_FILES.includes(entry.name as (typeof SKIP_FILES)[number])) {
      continue;
    }

    // In preserve mode, skip existing files
    if (preserveExisting && existsSync(destPath)) {
      if (entry.isDirectory()) {
        copyDirectoryRecursive(srcPath, destPath, preserveExisting);
      }
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath, preserveExisting);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Preserve specified files before update
 */
export function preserveFiles(targetPath: string, filesToPreserve: readonly string[]): Record<string, Buffer> {
  const preservedContent: Record<string, Buffer> = {};

  for (const file of filesToPreserve) {
    const filePath = path.join(targetPath, file);
    if (existsSync(filePath)) {
      if (!statSync(filePath).isDirectory()) {
        preservedContent[file] = readFileSync(filePath);
      }
    }
  }

  return preservedContent;
}

/**
 * Restore preserved files after update
 */
export function restoreFiles(targetPath: string, preservedContent: Record<string, Buffer>): void {
  for (const [file, content] of Object.entries(preservedContent)) {
    writeFileSync(path.join(targetPath, file), content);
  }
}

/**
 * Clean target directory while preserving specified files
 */
export function cleanTargetDirectory(targetPath: string, preserveFiles: readonly string[]): void {
  const items = readdirSync(targetPath);
  for (const item of items) {
    if (!preserveFiles.includes(item)) {
      rmSync(path.join(targetPath, item), { recursive: true, force: true });
    }
  }
}
