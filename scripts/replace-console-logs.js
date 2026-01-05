#!/usr/bin/env node

/**
 * Script to replace console.log/warn/info/debug calls with logger calls
 * This ensures all console logs go through our logger utility
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcDir = path.join(__dirname, '..', 'src');

function replaceConsoleInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Replace console.log with logger.log
  if (content.includes('console.log')) {
    content = content.replace(/console\.log\(/g, 'logger.log(');
    modified = true;
  }

  // Replace console.warn with logger.warn
  if (content.includes('console.warn')) {
    content = content.replace(/console\.warn\(/g, 'logger.warn(');
    modified = true;
  }

  // Replace console.info with logger.info
  if (content.includes('console.info')) {
    content = content.replace(/console\.info\(/g, 'logger.info(');
    modified = true;
  }

  // Replace console.debug with logger.debug
  if (content.includes('console.debug')) {
    content = content.replace(/console\.debug\(/g, 'logger.debug(');
    modified = true;
  }

  // Replace console.table with logger.table
  if (content.includes('console.table')) {
    content = content.replace(/console\.table\(/g, 'logger.table(');
    modified = true;
  }

  // Replace console.group with logger.group
  if (content.includes('console.group')) {
    content = content.replace(/console\.group\(/g, 'logger.group(');
    modified = true;
  }

  // Replace console.groupEnd with logger.groupEnd
  if (content.includes('console.groupEnd')) {
    content = content.replace(/console\.groupEnd\(/g, 'logger.groupEnd(');
    modified = true;
  }

  // Replace console.time with logger.time
  if (content.includes('console.time')) {
    content = content.replace(/console\.time\(/g, 'logger.time(');
    modified = true;
  }

  // Replace console.timeEnd with logger.timeEnd
  if (content.includes('console.timeEnd')) {
    content = content.replace(/console\.timeEnd\(/g, 'logger.timeEnd(');
    modified = true;
  }

  // Note: We keep console.error as-is since logger.error still uses console.error
  // but you can replace it if needed:
  // if (content.includes('console.error')) {
  //   content = content.replace(/console\.error\(/g, 'logger.error(');
  //   modified = true;
  // }

  // Add logger import if file was modified and doesn't already have it
  if (modified && !content.includes("from '../utils/logger'") && !content.includes("from './utils/logger'") && !content.includes("from '@/utils/logger'") && !content.includes("from '../utils/logger'") && !content.includes("import { logger }")) {
    // Find the last import statement
    const importRegex = /^import\s+.*$/gm;
    const imports = content.match(importRegex);
    
    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = content.lastIndexOf(lastImport);
      const insertIndex = lastImportIndex + lastImport.length;
      
      // Calculate relative path from file to logger
      const fileDir = path.dirname(filePath);
      const loggerPath = path.relative(fileDir, path.join(srcDir, 'utils', 'logger.ts'));
      // Convert to forward slashes and remove .ts extension
      const relativeImport = loggerPath.replace(/\\/g, '/').replace(/\.ts$/, '');
      // Ensure it starts with ./
      const finalPath = relativeImport.startsWith('.') ? relativeImport : './' + relativeImport;
      
      content = content.slice(0, insertIndex) + `\nimport { logger } from '${finalPath}';` + content.slice(insertIndex);
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }

  return false;
}

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  let totalModified = 0;

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules and build directories
      if (file !== 'node_modules' && file !== 'build' && file !== '.git') {
        totalModified += processDirectory(filePath);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
      // Skip backup files
      if (!file.includes('.bak') && !file.includes('.backup')) {
        if (replaceConsoleInFile(filePath)) {
          totalModified++;
          console.log(`Modified: ${filePath}`);
        }
      }
    }
  });

  return totalModified;
}

console.log('Starting console.log replacement...');
const modified = processDirectory(srcDir);
console.log(`\nDone! Modified ${modified} files.`);
console.log('Note: console.error calls are kept as-is (they still log in production for debugging).');

