#!/usr/bin/env node
/**
 * Generate sitecustomize.py for bundled Python runtime.
 *
 * This script creates a sitecustomize.py file that automatically adds
 * the bundled packages directory to sys.path when Python starts.
 * This ensures that packages bundled in electron-builder's extraResources
 * are discoverable by the Python interpreter.
 *
 * sitecustomize.py is a special file that Python executes automatically
 * on startup (before any other imports), making it ideal for path
 * configuration in packaged applications.
 *
 * Usage:
 *   node scripts/generate-sitecustomize.cjs
 *
 * Output:
 *   python-runtime/sitecustomize.py
 */

const fs = require('fs');
const path = require('path');

// Output directory for sitecustomize.py (relative to frontend root)
const OUTPUT_DIR = 'python-runtime';

// sitecustomize.py content
// This file is automatically executed by Python on startup
const SITECUSTOMIZE_CONTENT = `import sys
import os

# Add bundled packages directory to sys.path at startup
bundled_packages = os.path.join(os.path.dirname(sys.executable), '..', 'python-site-packages')
if os.path.exists(bundled_packages):
    sys.path.insert(0, os.path.abspath(bundled_packages))
`;

/**
 * Generate sitecustomize.py file.
 * Creates the output directory if it doesn't exist.
 */
function generateSitecustomize() {
  console.log('[generate-sitecustomize] Generating sitecustomize.py...');

  const frontendDir = path.join(__dirname, '..');
  const outputDir = path.join(frontendDir, OUTPUT_DIR);
  const outputPath = path.join(outputDir, 'sitecustomize.py');

  try {
    // Ensure output directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    // Write sitecustomize.py
    fs.writeFileSync(outputPath, SITECUSTOMIZE_CONTENT, 'utf-8');

    console.log(`[generate-sitecustomize] Created: ${outputPath}`);
    console.log('[generate-sitecustomize] Done!');

    return { success: true, path: outputPath };
  } catch (error) {
    console.error(`[generate-sitecustomize] Error: ${error.message}`);
    throw error;
  }
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node generate-sitecustomize.cjs

Generates sitecustomize.py for the bundled Python runtime.
This file automatically adds the bundled packages directory to sys.path
when Python starts, ensuring packages in extraResources are discoverable.

Output: python-runtime/sitecustomize.py
`);
    process.exit(0);
  }

  try {
    generateSitecustomize();
  } catch (error) {
    console.error(`[generate-sitecustomize] Failed: ${error.message}`);
    process.exit(1);
  }
}

// Export for use in other scripts
module.exports = { generateSitecustomize };

// Run if called directly
if (require.main === module) {
  main();
}
