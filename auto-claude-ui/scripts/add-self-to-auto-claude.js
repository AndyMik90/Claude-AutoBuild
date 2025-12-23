#!/usr/bin/env node

/**
 * Add auto-claude-ui project to Auto Claude
 *
 * This script programmatically adds the auto-claude-ui project
 * to Auto Claude's project list for recursive development.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// Find the projects.json file
const userDataDir = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'auto-claude-ui'
);
const storeDir = path.join(userDataDir, 'store');
const projectsFile = path.join(storeDir, 'projects.json');

console.log('Auto Claude project store:', projectsFile);

// Ensure store directory exists
if (!fs.existsSync(storeDir)) {
  console.log('Creating store directory...');
  fs.mkdirSync(storeDir, { recursive: true });
}

// Load existing projects or create new store
let storeData;
if (fs.existsSync(projectsFile)) {
  console.log('Loading existing projects...');
  const content = fs.readFileSync(projectsFile, 'utf-8');
  storeData = JSON.parse(content);
} else {
  console.log('Creating new projects store...');
  storeData = {
    projects: [],
    settings: {}
  };
}

// Auto Claude UI project details
const projectPath = '/Users/amenra/Auto-Claude/auto-claude-ui';
const autoBuildPath = '.auto-claude';

// Check if project already exists
const existing = storeData.projects.find(p => p.path === projectPath);
if (existing) {
  console.log('✅ Auto Claude UI project already exists in store');
  console.log('   ID:', existing.id);
  console.log('   Name:', existing.name);
  process.exit(0);
}

// Add new project
const project = {
  id: uuidv4(),
  name: 'Auto Claude UI',
  path: projectPath,
  autoBuildPath,
  settings: {
    autoBuild: {
      enabled: true,
      autoStart: false,
      model: 'sonnet',
      parallel: false,
      workers: 1
    }
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

storeData.projects.push(project);

// Save to disk
fs.writeFileSync(projectsFile, JSON.stringify(storeData, null, 2));

console.log('✅ Successfully added Auto Claude UI project!');
console.log('   ID:', project.id);
console.log('   Path:', project.path);
console.log('   Auto Build:', project.autoBuildPath);
console.log('\n🎯 Next: Open Auto Claude to start recursive development!');
