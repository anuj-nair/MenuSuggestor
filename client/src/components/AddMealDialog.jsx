import { useEffect, useRef, useState } from 'react';
import { extractRecipe } from '../api/recipes.api.js';
import ImportTimeline from './ImportTimeline.jsx';

const OPTIONS = [
  { mode: 'manual', title: 'Add manually', hint: 'Start from a blank form.' },
  { mode: 'text', title: 'Paste recipe text', hint: 'Ingredients and steps copied from anywhere.' },
  { mode: 'url', title: 'From a recipe link', hint: 'A recipe website URL.' },
];

const STEP_LABELS = {
  fetch: 'Collecting data from the link',
  extract: 'Finding the recipe on the page',
  read: 'Reading your text',
  structure: 'Converting to structured data',
  check: 'Checking the result',
  form: 'Filling in the form',
};

const FLOWS = {
  url: ['fetch', 'extract', 'structure', 'check', 'form'],
  text: ['read', 'structure', 'check', 'form'],
};

// Detail line under the timeline, keyed by the server's progress stage.
const STAGE_DETAILS = {
  fetch: 'Downloading the recipe page…',
  extract: 'Pulling the ingredients and steps out of the page…',
  read: 'Getting your text ready…',
  structure: 'Your local model is sorting it into ingredients, quantities and steps — this is the slow part.',
  check: 'Making sure every ingredient really appears in the recipe…',
  repair: 'The model missed a detail — asking it to fix it…',
  form: 'Almost done — opening the form…',
};

// Failures that happen in the conversion step, where re-running just that
// step (without fetching the page again) is worth offering.
const RETRYABLE_CODES = new Set(['EXTRACTION_FAILED', 'LLM_UNAVAILABLE', 'TIMEOUT', 'INTERNAL']);

// Plain-language summaries shown above the technical message for conversion failures.
const FRIENDLY_ERRORS = {
  EXTRACTION_FAILED: "The model's answer came back incomplete or garbled. Retrying usually works.",
  LLM_UNAVAILABLE: "Couldn't reach your local model. Make sure Ollama is running, then retry.",
  TIMEOUT: 'The model took too long to answer. Retry, or paste a shorter version of the recipe.',
};

// Three ways to start a new meal. Text and link run the local recipe
// extractor and hand back a draft that pre-fills the manual form for review.
export default function AddMealDialog({ open, onClose, onManual, onImported }) {
  const [mode, setMode] = useState(null);
  const [text, setText] = useState('');
  const [reference, setReference] = useState('');
  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [run, setRun] = useState(null); // {steps, activeIndex, failed, detail, startedAt, endedAt}
  const [now, setNow] = useState(Date.now());
  const [scraped, setScraped] = useState(null); // page text from the last link import, for retries
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      setMode(null);
      setText('');
      setReference('');
      setUrl('');
      setImporting(false);
      setRun(null);
      setScraped(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!importing) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [importing]);

  if (!open) return null;

  const pickOption = (next) => {
    if (next === 'manual') {
      onManual();
      return;
    }
    setError(null);
    setRun(null);
    setMode(next);
  };

  const runImport = async (body, flow, startIndex) => {
    const steps = flow.map((id) => ({ id, label: STEP_LABELS[id] }));
    const startedAt = Date.now();
    setError(null);
    setImporting(true);
    setNow(startedAt);
    setRun({ steps, activeIndex: startIndex, failed: false, detail: STAGE_DETAILS[flow[startIndex]], startedAt });

    const controller = new AbortController();
    abortRef.current = controller;
    const onEvent = (event) => {
      if (event.type === 'scraped') {
        setScraped(event.scraped);
      } else if (event.type === 'progress') {
        const index = flow.indexOf(event.stage === 'repair' ? 'check' : event.stage);
        if (index === -1) return;
        setRun((r) => ({ ...r, activeIndex: Math.max(r.activeIndex, index), detail: STAGE_DETAILS[event.stage] }));
      }
    };

    try {
      const result = await extractRecipe(body, { signal: controller.signal, onEvent });
      setRun((r) => ({ ...r, activeIndex: steps.length }));
      onImported(result);
    } catch (err) {
      if (err.name === 'AbortError') {
        setRun(null);
        return;
      }
      setRun((r) => ({ ...r, failed: true, detail: 'Stopped at this step.', endedAt: Date.now() }));
      setError({ message: err.message, code: err.body?.code });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setImporting(false);
    }
  };

  const handleImport = (e) => {
    e.preventDefault();
    if (mode === 'url') {
      setScraped(null);
      runImport({ source: 'url', url: url.trim() }, FLOWS.url, 0);
    } else {
      runImport({ source: 'text', text, reference: reference.trim() || undefined }, FLOWS.text, 0);
    }
  };

  // Re-runs only the conversion step: a link import reuses the page text it
  // already fetched instead of downloading the page again.
  const retryConversion = () => {
    const structureIndex = FLOWS[mode].indexOf('structure');
    if (mode === 'url') {
      runImport({ source: 'scraped', scraped }, FLOWS.url, structureIndex);
    } else {
      runImport({ source: 'text', text, reference: reference.trim() || undefined }, FLOWS.text, structureIndex);
    }
  };

  const handleCancel = () => {
    if (importing) {
      abortRef.current?.abort();
      return;
    }
    onClose();
  };

  const switchToPaste = () => {
    setReference(url.trim());
    setError(null);
    setRun(null);
    setMode('text');
  };

  const canRetryConversion =
    error && RETRYABLE_CODES.has(error.code) && (mode === 'text' || (mode === 'url' && scraped));
  const elapsedSeconds = run ? Math.max(0, Math.floor(((run.endedAt ?? now) - run.startedAt) / 1000)) : null;

  return (
    <div className="dialog-overlay" onClick={importing ? undefined : onClose}>
      <div className="dialog dialog-wide" onClick={(e) => e.stopPropagation()}>
        <h3>Add Meal</h3>

        {!mode && (
          <>
            <div className="add-meal-options">
              {OPTIONS.map((opt) => (
                <button key={opt.mode} type="button" className="add-meal-option" onClick={() => pickOption(opt.mode)}>
                  <span className="add-meal-option-title">{opt.title}</span>
                  <span className="add-meal-option-hint">{opt.hint}</span>
                </button>
              ))}
            </div>
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {mode && (
          <form onSubmit={handleImport} className="add-meal-import">
            {mode === 'text' ? (
              <>
                <label>
                  Recipe text
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={run ? 5 : 10}
                    placeholder="Paste the ingredient list (and steps, if you have them)..."
                    disabled={importing}
                    autoFocus
                    required
                  />
                </label>
                <label>
                  Where's it from? (optional URL)
                  <input
                    type="url"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="https://..."
                    disabled={importing}
                  />
                </label>
              </>
            ) : (
              <label>
                Recipe link
                <input
                  type="url"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setScraped(null);
                  }}
                  placeholder="https://www.example.com/my-favourite-recipe"
                  disabled={importing}
                  autoFocus
                  required
                />
              </label>
            )}

            {run && (
              <ImportTimeline
                steps={run.steps}
                activeIndex={run.activeIndex}
                failed={run.failed}
                detail={run.detail}
                elapsedSeconds={elapsedSeconds}
              />
            )}

            {error && (
              <div className="field-error">
                {FRIENDLY_ERRORS[error.code] ? (
                  <>
                    <p>
                      {FRIENDLY_ERRORS[error.code]}
                      {mode === 'url' && scraped && ' The page is already downloaded, so only the conversion runs again.'}
                    </p>
                    <details className="import-error-details">
                      <summary>Details</summary>
                      {error.message}
                    </details>
                  </>
                ) : (
                  <p>{error.message}</p>
                )}
                {error.code === 'SCRAPE_BLOCKED' && (
                  <button type="button" className="btn btn-text btn-small" onClick={switchToPaste}>
                    Switch to paste text
                  </button>
                )}
              </div>
            )}

            <div className="dialog-actions">
              {!importing && (
                <button type="button" className="btn btn-text" onClick={() => setMode(null)}>
                  Back
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
              {canRetryConversion ? (
                <button type="button" className="btn btn-primary" onClick={retryConversion}>
                  Retry conversion
                </button>
              ) : (
                <button type="submit" className="btn btn-primary" disabled={importing}>
                  {importing ? 'Importing...' : 'Import'}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
