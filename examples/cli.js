#!/usr/bin/env node


const { program } = require('commander');
const { TemporalDB } = require('../src/index');
const fs = require('fs').promises;
const path = require('path');

// Create a DB instance
const db = new TemporalDB();

// Helper to ensure DB is initialized
async function ensureInit() {
  try {
    await db.init();
  } catch (error) {
    console.error('Error initializing database:', error.message);
    process.exit(1);
  }
}

// Helper to read data from stdin or file
async function readData(file) {
  try {
    if (file) {
      const content = await fs.readFile(file, 'utf8');
      return JSON.parse(content);
    } else {
      return new Promise((resolve) => {
        let data = '';
        process.stdin.on('data', (chunk) => {
          data += chunk;
        });
        process.stdin.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            console.error('Error parsing JSON data:', error.message);
            process.exit(1);
          }
        });
      });
    }
  } catch (error) {
    console.error('Error reading data:', error.message);
    process.exit(1);
  }
}

// Initialize the database
program
  .command('init')
  .description('Initialize the database')
  .action(async () => {
    await ensureInit();
    console.log('Database initialized');
    db.close();
  });

// Create a branch
program
  .command('branch <name> [source]')
  .description('Create a new branch')
  .action(async (name, source) => {
    await ensureInit();
    try {
      await db.branch(name, source);
      console.log(`Branch '${name}' created from '${source || 'current branch'}'`);
    } catch (error) {
      console.error('Error creating branch:', error.message);
    } finally {
      db.close();
    }
  });

// Switch to a branch
program
  .command('checkout <branch>')
  .description('Switch to a branch')
  .action(async (branch) => {
    await ensureInit();
    try {
      await db.checkout(branch);
      console.log(`Switched to branch '${branch}'`);
    } catch (error) {
      console.error('Error switching branch:', error.message);
    } finally {
      db.close();
    }
  });

// List branches
program
  .command('branches')
  .description('List all branches')
  .action(async () => {
    await ensureInit();
    try {
      const branches = await db.listBranches();
      const current = await db.getCurrentBranch();
      
      branches.forEach(branch => {
        console.log(`${branch === current ? '* ' : '  '}${branch}`);
      });
    } catch (error) {
      console.error('Error listing branches:', error.message);
    } finally {
      db.close();
    }
  });

// Commit data
program
  .command('commit [file]')
  .description('Commit data from file or stdin')
  .option('-m, --message <message>', 'Commit message', 'Update data')
  .option('-b, --branch <branch>', 'Target branch (defaults to current branch)')
  .action(async (file, options) => {
    await ensureInit();
    try {
      const data = await readData(file);
      const branch = options.branch || await db.getCurrentBranch();
      
      await db.commit(branch, data, options.message);
      console.log(`Data committed to branch '${branch}'`);
    } catch (error) {
      console.error('Error committing data:', error.message);
    } finally {
      db.close();
    }
  });

// Get data
program
  .command('get')
  .description('Get current data')
  .option('-b, --branch <branch>', 'Branch to get data from (defaults to current branch)')
  .option('-t, --time <timestamp>', 'Get data at a specific point in time')
  .option('-o, --output <file>', 'Output file (defaults to stdout)')
  .action(async (options) => {
    await ensureInit();
    try {
      let data;
      const branch = options.branch || await db.getCurrentBranch();
      
      if (options.time) {
        data = await db.getDataAt(branch, new Date(options.time));
      } else {
        data = await db.getBranchData(branch);
      }
      
      const output = JSON.stringify(data, null, 2);
      
      if (options.output) {
        await fs.writeFile(options.output, output);
        console.log(`Data written to ${options.output}`);
      } else {
        console.log(output);
      }
    } catch (error) {
      console.error('Error getting data:', error.message);
    } finally {
      db.close();
    }
  });

// Set a value at a path
program
  .command('set <path> <value>')
  .description('Set a value at a specific path')
  .option('-b, --branch <branch>', 'Branch to modify (defaults to current branch)')
  .option('-m, --message <message>', 'Commit message', 'Set value')
  .action(async (path, valueStr, options) => {
    await ensureInit();
    try {
      const branch = options.branch || await db.getCurrentBranch();
      const data = await db.getBranchData(branch);
      
      // Try to parse the value as JSON, or use as string if it fails
      let value;
      try {
        value = JSON.parse(valueStr);
      } catch (e) {
        value = valueStr;
      }
      
      // Set the value at the path
      const updatedData = require('../src/storage').Storage.setValueAtPath(data, path, value);
      
      // Commit the updated data
      await db.commit(branch, updatedData, options.message);
      console.log(`Value at '${path}' set to:`, value);
    } catch (error) {
      console.error('Error setting value:', error.message);
    } finally {
      db.close();
    }
  });

// Merge branches
program
  .command('merge <source> [target]')
  .description('Merge a source branch into a target branch')
  .option('-m, --message <message>', 'Commit message for the merge')
  .option('-r, --resolve <json>', 'JSON object with conflict resolutions')
  .action(async (source, target, options) => {
    await ensureInit();
    try {
      const targetBranch = target || await db.getCurrentBranch();
      const mergeResult = await db.merge(source, targetBranch);
      
      if (mergeResult.hasConflicts()) {
        if (options.resolve) {
          // Parse conflict resolutions
          let resolutions;
          try {
            resolutions = JSON.parse(options.resolve);
          } catch (e) {
            throw new Error(`Invalid JSON for conflict resolutions: ${e.message}`);
          }
          
          // Apply merge with resolutions
          await mergeResult.resolveWith(resolutions, options.message);
          console.log(`Merged branch '${source}' into '${targetBranch}' with conflict resolutions`);
        } else {
          // Print conflicts and exit
          console.log(`Merge has conflicts that need to be resolved:`);
          const conflicts = mergeResult.getConflicts();
          
          conflicts.forEach(conflict => {
            console.log(`- Path: ${conflict.path}`);
            console.log(`  Ancestor: ${JSON.stringify(conflict.ancestor.value)}`);
            console.log(`  Source: ${JSON.stringify(conflict.source.value)}`);
            console.log(`  Target: ${JSON.stringify(conflict.target.value)}`);
            console.log();
          });
          
          console.log(`Use --resolve option to provide conflict resolutions as JSON`);
        }
      } else {
        // No conflicts, apply automatically
        await mergeResult.apply(options.message);
        console.log(`Merged branch '${source}' into '${targetBranch}' (no conflicts)`);
      }
    } catch (error) {
      console.error('Error merging branches:', error.message);
    } finally {
      db.close();
    }
  });

// Show history
program
  .command('history')
  .description('Show commit history')
  .option('-b, --branch <branch>', 'Branch to show history for (defaults to current branch)')
  .option('-n, --limit <number>', 'Limit the number of commits shown', parseInt)
  .action(async (options) => {
    await ensureInit();
    try {
      const branch = options.branch || await db.getCurrentBranch();
      let commits = await db.getHistory(branch);
      
      if (options.limit && options.limit > 0) {
        commits = commits.slice(0, options.limit);
      }
      
      if (commits.length === 0) {
        console.log(`No commits found for branch '${branch}'`);
      } else {
        commits.forEach(commit => {
          console.log(`Commit: ${commit.hash.substring(0, 8)}`);
          console.log(`Date: ${new Date(commit.timestamp).toISOString()}`);
          console.log(`Message: ${commit.message}`);
          console.log(`Parent: ${commit.parent ? commit.parent.substring(0, 8) : 'none'}`);
          console.log();
        });
      }
    } catch (error) {
      console.error('Error showing history:', error.message);
    } finally {
      db.close();
    }
  });

// Parse command line arguments
program.parse(process.argv);

// If no command is provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}