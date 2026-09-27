// Runs the Python recipe_ingestion tool (scrape/paste -> local Gemma via
// Ollama -> structured JSON) as a subprocess through its JSON-lines bridge
// (recipe_ingestion/recipe_ingestion/bridge.py), relaying its progress events
// as they arrive. The Python side still writes its own
// output/recipes/<uuid>.json audit file; nothing touches the DB here.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError } from '../middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INGESTION_DIR = path.join(__dirname, '../../../recipe_ingestion');
const DEFAULT_PYTHON = path.join(INGESTION_DIR, '.venv/bin/python');

const STATUS_BY_CODE = {
  BAD_REQUEST: 400,
  SCRAPE_BLOCKED: 422,
  TEXT_TOO_SHORT: 422,
  LLM_UNAVAILABLE: 503,
  EXTRACTION_FAILED: 502,
};

// The Python message for a blocked site points at its own CLI; say what to do in the app instead.
const MESSAGE_BY_CODE = {
  SCRAPE_BLOCKED: "This site wouldn't let us read the recipe. Open it in your browser, copy the recipe text, and paste it instead.",
};

/**
 * @param {Object} request - {source:'url', url} | {source:'text', text, reference?} | {source:'scraped', scraped}
 * @param {Object} [opts]
 * @param {AbortSignal} [opts.signal] - aborts (kills the subprocess) e.g. when the client disconnects
 * @param {Function} [opts.onEvent] - called with each non-final bridge event ({type:'progress'|'scraped', ...})
 * @returns {Promise<Object>} the RecipeRecord JSON
 */
export function runIngestion(request, { signal, onEvent = () => {} } = {}) {
  const python = process.env.RECIPE_INGEST_PYTHON || DEFAULT_PYTHON;
  const timeoutMs = Number(process.env.RECIPE_INGEST_TIMEOUT_MS) || 300_000;

  if (!fs.existsSync(python)) {
    return Promise.reject(
      new ApiError(503, "Recipe import isn't set up yet — create recipe_ingestion's virtualenv (see recipe_ingestion/README.md).", {
        code: 'NOT_CONFIGURED',
      })
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-m', 'recipe_ingestion.bridge'], { cwd: INGESTION_DIR });
    let buffered = '';
    let stderr = '';
    let finalEvent = null;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fn(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject, new ApiError(502, `Recipe import timed out after ${Math.round(timeoutMs / 1000)}s.`, { code: 'TIMEOUT' }));
    }, timeoutMs);

    const onAbort = () => {
      child.kill('SIGKILL');
      finish(reject, new ApiError(499, 'Recipe import cancelled.', { code: 'CANCELLED' }));
    };
    signal?.addEventListener('abort', onAbort);

    const handleLine = (line) => {
      if (!line.trim()) return;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event.type === 'result' || event.type === 'error') finalEvent = event;
      else if (!settled) onEvent(event);
    };

    child.stdout.setEncoding('utf8'); // don't split multi-byte characters across chunks
    child.stdout.on('data', (chunk) => {
      buffered += chunk;
      const lines = buffered.split('\n');
      buffered = lines.pop();
      lines.forEach(handleLine);
    });
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (err) => finish(reject, new ApiError(503, `Could not start recipe import: ${err.message}`, { code: 'NOT_CONFIGURED' })));

    child.on('close', () => {
      handleLine(buffered);
      if (finalEvent?.type === 'result') return finish(resolve, finalEvent.record);
      if (finalEvent?.type === 'error') {
        const code = finalEvent.code || 'INTERNAL';
        const message = MESSAGE_BY_CODE[code] || finalEvent.error || 'Recipe import failed.';
        return finish(reject, new ApiError(STATUS_BY_CODE[code] || 502, message, { code }));
      }
      if (stderr) console.error('[recipe_ingestion]', stderr);
      finish(reject, new ApiError(502, 'Recipe import stopped without a result.', { code: 'INTERNAL' }));
    });

    child.stdin.end(JSON.stringify(request));
  });
}
