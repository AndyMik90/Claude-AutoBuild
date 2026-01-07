import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({
      // Bundle these packages into the main process (they won't be in node_modules in packaged app)
      exclude: [
        'uuid',
        'chokidar',
        'kuzu',
        'electron-updater',
        '@electron-toolkit/utils'
      ]
    })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        },
        // Only node-pty needs to be external (native module rebuilt by electron-builder)
        external: ['@lydell/node-pty']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@features': resolve(__dirname, 'src/renderer/features'),
        '@components': resolve(__dirname, 'src/renderer/shared/components'),
        '@hooks': resolve(__dirname, 'src/renderer/shared/hooks'),
        '@lib': resolve(__dirname, 'src/renderer/shared/lib')
      }
    },
    server: {
      watch: {
        // Ignore directories to prevent HMR conflicts during merge operations
        // Using absolute paths and broader patterns
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.worktrees/**',
          '**/.auto-claude/**',
          '**/out/**',
          // Ignore the parent autonomous-coding directory's worktrees
          resolve(__dirname, '../.worktrees/**'),
          resolve(__dirname, '../.auto-claude/**'),
        ]
      }
    }
  }
});
