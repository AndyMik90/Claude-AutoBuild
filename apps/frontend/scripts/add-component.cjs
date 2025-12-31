#!/usr/bin/env node
/**
 * Auto Claude UI Component CLI
 * Add new components following shadcn/ui patterns with Apple HIG styling
 *
 * Usage:
 *   npm run ui:add <component>    Add a component
 *   npm run ui:list               List available components
 *   npm run ui:help               Show this help
 */

const fs = require('fs');
const path = require('path');

const COMPONENTS_JSON_PATH = path.join(__dirname, '../components.json');
const UI_DIR = path.join(__dirname, '../src/renderer/components/ui');

// Available component templates (following shadcn/ui naming)
const AVAILABLE_COMPONENTS = [
  'accordion',
  'alert',
  'alert-dialog',
  'avatar',
  'badge',
  'breadcrumb',
  'button-group',
  'calendar',
  'card',
  'carousel',
  'chart',
  'checkbox',
  'collapsible',
  'command',
  'context-menu',
  'data-table',
  'date-picker',
  'dialog',
  'divider',
  'drawer',
  'dropdown-menu',
  'empty',
  'field',
  'form',
  'hover-card',
  'input',
  'input-group',
  'input-otp',
  'item',
  'kbd',
  'label',
  'menubar',
  'navigation-menu',
  'pagination',
  'popover',
  'progress',
  'radio-group',
  'resizable',
  'resizable-panels',
  'scroll-area',
  'select',
  'separator',
  'sheet',
  'skeleton',
  'slider',
  'sonner',
  'spinner',
  'switch',
  'table',
  'tabs',
  'textarea',
  'time-picker',
  'toast',
  'toggle',
  'toggle-group',
  'tooltip',
];

// Load components.json
let config;
try {
  config = JSON.parse(fs.readFileSync(COMPONENTS_JSON_PATH, 'utf-8'));
} catch (err) {
  console.error('Error: components.json not found. Please run this from the frontend directory.');
  process.exit(1);
}

function printHelp() {
  console.log(`
Auto Claude UI Component CLI

Usage:
  npm run ui:add <component>    Add a component
  npm run ui:list               List available components
  npm run ui:help               Show this help

Examples:
  npm run ui:add accordion
  npm run ui:add table
  npm run ui:add form

Available components:
  ${AVAILABLE_COMPONENTS.slice(0, 20).join(', ')}
  ${AVAILABLE_COMPONENTS.slice(20).join(', ')}

Component template follows Apple HIG principles with liquid glass support.
  `);
}

function pascalCase(str) {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function generateComponentTemplate(name) {
  const pascalName = pascalCase(name);
  return `import * as React from 'react';
import { cn } from '../../lib/utils';

/* Apple HIG-inspired ${pascalName} component
   Key principles:
   - 44pt minimum tap targets
   - Smooth transitions with Apple easing
   - Liquid glass effects support
   - Proper semantic HTML
*/

const ${pascalName} = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'base-classes',
      className
    )}
    {...props}
  />
));
${pascalName}.displayName = '${pascalName}';

export { ${pascalName} };
`;
}

function updateIndexFile(name) {
  const indexPath = path.join(UI_DIR, 'index.ts');
  const pascalName = pascalCase(name);
  const exportLine = `export { ${pascalName} } from './${name}';`;

  try {
    let content = '';
    if (fs.existsSync(indexPath)) {
      content = fs.readFileSync(indexPath, 'utf-8');
    }

    // Check if export already exists
    if (content.includes(`from './${name}'`)) {
      console.log(`  ✓ Export already exists in index.ts`);
      return;
    }

    // Add export in alphabetical order
    if (!content) {
      content = exportLine + '\n';
    } else {
      const lines = content.split('\n');
      lines.push(exportLine);
      lines.sort((a, b) => {
        const aMatch = a.match(/from '\\\.\/([^']+)'/);
        const bMatch = b.match(/from '\\\.\/([^']+)'/);
        if (!aMatch || !bMatch) return 0;
        return aMatch[1].localeCompare(bMatch[1]);
      });
      content = lines.join('\n');
    }

    fs.writeFileSync(indexPath, content, 'utf-8');
    console.log(`  ✓ Updated index.ts`);
  } catch (err) {
    console.warn(`  ⚠ Could not update index.ts: ${err.message}`);
  }
}

async function addComponent(name) {
  const filePath = path.join(UI_DIR, `${name}.tsx`);

  // Check if component exists
  if (fs.existsSync(filePath)) {
    console.log(`\n✓ Component "${name}" already exists at ${filePath}`);
    return;
  }

  // Create component file
  const template = generateComponentTemplate(name);
  fs.writeFileSync(filePath, template, 'utf-8');
  console.log(`\n✓ Created component: ${filePath}`);

  // Update index file
  updateIndexFile(name);

  console.log(`\nComponent "${name}" added successfully!`);
  console.log(`\nNext steps:`);
  console.log(`  1. Edit ${path.relative(process.cwd(), filePath)} to customize the component`);
  console.log(`  2. Add variants using class-variance-authority (cva)`);
  console.log(`  3. Follow Apple HIG principles documented in globals.css`);
}

async function listComponents() {
  console.log('\nAvailable components:\n');
  AVAILABLE_COMPONENTS.forEach((c) => {
    const exists = fs.existsSync(path.join(UI_DIR, `${c}.tsx`));
    console.log(`  ${exists ? '✓' : ' '} ${c}`);
  });
  console.log(`\nLegend: ✓ = installed\n`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const command = args[0];
  const componentName = args[1];

  if (command === '--list' || command === '-l' || command === 'list') {
    await listComponents();
    process.exit(0);
  }

  // Treat first argument as component name
  const name = command.toLowerCase().replace(/[^a-z0-9-]/g, '');

  if (!AVAILABLE_COMPONENTS.includes(name)) {
    console.error(`\nError: Unknown component "${name}"`);
    console.error(`Run 'npm run ui:list' to see available components.\n`);
    process.exit(1);
  }

  await addComponent(name);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
