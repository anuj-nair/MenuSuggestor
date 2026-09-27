import { ApiError } from '../middleware/errorHandler.js';
import { runIngestion } from '../services/recipeIngestion.service.js';
import { recordToMealDraft } from '../services/recipeMapper.service.js';

const MIN_TEXT_CHARS = 30;

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildRequest(body) {
  const { source, url, text, reference, scraped } = body || {};
  if (source === 'url') {
    if (!isHttpUrl(url)) throw new ApiError(400, 'Enter a full recipe link starting with http:// or https://');
    return { source, url };
  }
  if (source === 'text') {
    if (typeof text !== 'string' || text.trim().length < MIN_TEXT_CHARS) {
      throw new ApiError(400, 'Paste the full recipe — at least the ingredient list.');
    }
    if (reference && !isHttpUrl(reference)) throw new ApiError(400, 'The source link must start with http:// or https://');
    return { source, text, reference: reference || null };
  }
  // Retry of just the conversion step, on page text a previous 'url' run already fetched.
  if (source === 'scraped') {
    if (!scraped || typeof scraped.raw_text !== 'string' || !isHttpUrl(scraped.url)) {
      throw new ApiError(400, 'Nothing to retry — import the link again.');
    }
    const { url: scrapedUrl, raw_text, extraction_method, expected_ingredient_count = null } = scraped;
    return { source, scraped: { url: scrapedUrl, raw_text, extraction_method, expected_ingredient_count } };
  }
  throw new ApiError(400, "source must be 'url', 'text' or 'scraped'");
}

// Extracts a recipe and streams progress as newline-delimited JSON:
//   {type:'progress', stage}  fetch | extract | structure | check | repair | form
//   {type:'scraped', scraped} page text, so a failed conversion can be retried without re-fetching
//   {type:'result', draft, warnings, source_url}   an unsaved meal-form draft for the user to review
//   {type:'error', error, code}
// Input problems are rejected up front as a normal JSON 400.
export async function extractRecipe(req, res) {
  const request = buildRequest(req.body);

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();
  const send = (event) => res.write(`${JSON.stringify(event)}\n`);

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    const record = await runIngestion(request, { signal: controller.signal, onEvent: send });
    send({ type: 'progress', stage: 'form' });
    const { draft, warnings } = recordToMealDraft(record);
    send({ type: 'result', draft, warnings, source_url: record.metadata?.source_url || null });
  } catch (err) {
    if (err.extra?.code === 'CANCELLED') return;
    if (!(err instanceof ApiError)) console.error(err);
    send({ type: 'error', error: err.message || 'Recipe import failed.', code: err.extra?.code || 'INTERNAL' });
  }
  res.end();
}
