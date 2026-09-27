#!/usr/bin/env node
// One entry point for the manual-recipe workflow: wipe the db, pull a recipe
// from a URL or pasted text straight into it, or (re-)import already-saved
// JSON files. Each subcommand just drives the existing standalone scripts
// (clearMeals.js, importRecipes.js) and the Python recipe_ingestion CLI, so
// none of their logic is duplicated here.
//
//   node src/db/recipes-cli.js clean-slate [--yes] [--meals-only]
//   node src/db/recipes-cli.js ingest-website <url>
//   node src/db/recipes-cli.js ingest-text <file> [--reference <url>]
//   node src/db/recipes-cli.js import [files...] [-d <folder>] [--dry-run] [--force]
//
// ingest-website/ingest-text run the Python extraction CLI (which saves the
// usual output/recipes/<uuid>.json backup either way), then import just that
// one new file into the db -- so a single command takes a URL or a pasted
// file straight from "nothing" to "in the app".
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '../../..');
const PYTHON_CLI = path.join(REPO_ROOT, 'recipe_ingestion/.venv/bin/recipe-ingest');
const CLEAR_SCRIPT = path.join(__dirname, 'clearMeals.js');
const IMPORT_SCRIPT = path.join(__dirname, 'importRecipes.js');
const SAVED_ID_RE = /Saved recipe ([0-9a-f-]{36})/;

function run(cmd, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit' });
    let output = '';
    if (capture) {
      child.stdout.on('data', (chunk) => {
        output += chunk;
        process.stdout.write(chunk);
      });
    }
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

async function cleanSlate(args) {
  const { code } = await run(process.execPath, [CLEAR_SCRIPT, ...args]);
  process.exit(code);
}

async function importJson(args) {
  const { code } = await run(process.execPath, [IMPORT_SCRIPT, ...args]);
  process.exit(code);
}

async function ingestAndImport(pythonArgs) {
  const { code, output } = await run(PYTHON_CLI, pythonArgs, { capture: true });
  if (code !== 0) {
    console.error('\nExtraction failed; nothing was imported into the db.');
    process.exit(code);
  }
  const match = output.match(SAVED_ID_RE);
  if (!match) {
    console.error('\nCould not find a "Saved recipe <id>" line in the output; skipping db import.');
    process.exit(1);
  }
  const jsonPath = path.join(REPO_ROOT, 'recipe_ingestion/output/recipes', `${match[1]}.json`);
  console.log(`\nImporting the new recipe into the db (${jsonPath})...\n`);
  const { code: importCode } = await run(process.execPath, [IMPORT_SCRIPT, jsonPath, '--force']);
  process.exit(importCode);
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case 'clean-slate':
    cleanSlate(rest);
    break;
  case 'import':
    importJson(rest);
    break;
  case 'ingest-website': {
    const [url, ...extra] = rest;
    if (!url) {
      console.error('Usage: recipes-cli ingest-website <url>');
      process.exit(1);
    }
    ingestAndImport(['ingest-website', url, ...extra]);
    break;
  }
  case 'ingest-text': {
    const [file, ...extra] = rest;
    if (!file) {
      console.error('Usage: recipes-cli ingest-text <file> [--reference <url>]');
      process.exit(1);
    }
    ingestAndImport(['ingest-text', file, ...extra]);
    break;
  }
  default:
    console.error(`Unknown command: ${command || '(none)'}

Usage:
  node src/db/recipes-cli.js clean-slate [--yes] [--meals-only]
  node src/db/recipes-cli.js ingest-website <url>
  node src/db/recipes-cli.js ingest-text <file> [--reference <url>]
  node src/db/recipes-cli.js import [files...] [-d <folder>] [--dry-run] [--force]`);
    process.exit(1);
}
