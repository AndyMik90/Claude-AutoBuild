/**
 * HTTP client utilities for fetching updates
 */

import https from 'https';
import { createWriteStream } from 'fs';
import { TIMEOUTS } from './config';

/**
 * Fetch JSON from a URL using https
 */
export function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Auto-Claude-UI',
      'Accept': 'application/vnd.github+json'
    };

    const request = https.get(url, { headers }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          fetchJson<T>(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        // Collect response body for error details (limit to 10KB)
        const maxErrorSize = 10 * 1024;
        let errorData = '';
        response.on('data', chunk => {
          if (errorData.length < maxErrorSize) {
            errorData += chunk.toString().slice(0, maxErrorSize - errorData.length);
          }
        });
        response.on('end', () => {
          const errorMsg = `HTTP ${response.statusCode}: ${errorData || response.statusMessage || 'No error details'}`;
          reject(new Error(errorMsg));
        });
        response.on('error', reject);
        return;
      }

      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch (_e) {
          reject(new Error('Failed to parse JSON response'));
        }
      });
      response.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(TIMEOUTS.requestTimeout, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Download a file with progress tracking
 */
export function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);

    // GitHub API URLs need the GitHub Accept header to get a redirect to the actual file
    // Non-API URLs (CDN, direct downloads) use octet-stream
    const isGitHubApi = url.includes('api.github.com');
    const headers = {
      'User-Agent': 'Auto-Claude-UI',
      'Accept': isGitHubApi ? 'application/vnd.github+json' : 'application/octet-stream'
    };

    const request = https.get(url, { headers }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, destPath, onProgress).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        // Collect response body for error details (limit to 10KB)
        const maxErrorSize = 10 * 1024;
        let errorData = '';
        response.on('data', chunk => {
          if (errorData.length < maxErrorSize) {
            errorData += chunk.toString().slice(0, maxErrorSize - errorData.length);
          }
        });
        response.on('end', () => {
          const errorMsg = `HTTP ${response.statusCode}: ${errorData || response.statusMessage || 'No error details'}`;
          reject(new Error(errorMsg));
        });
        response.on('error', reject);
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0 && onProgress) {
          onProgress(Math.round((downloadedSize / totalSize) * 100));
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        file.close();
        reject(err);
      });
    });

    request.on('error', (err) => {
      file.close();
      reject(err);
    });

    request.setTimeout(TIMEOUTS.downloadTimeout, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}
