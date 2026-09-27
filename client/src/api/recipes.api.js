// The extract endpoint streams newline-delimited JSON events (see
// server/src/controllers/recipes.controller.js), so this reads the body
// incrementally instead of going through api.post.
//
// body: {source:'url', url} | {source:'text', text, reference?} | {source:'scraped', scraped}
// onEvent: called with each {type:'progress'|'scraped', ...} event as it arrives.
// Resolves with the final {draft, warnings, source_url}; rejects with an Error
// carrying .body.code on failure.
export async function extractRecipe(body, { signal, onEvent = () => {} } = {}) {
  const res = await fetch('/api/recipes/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw toError(errorBody?.error || `Request failed with status ${res.status}`, errorBody?.code);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === 'result') return event;
      if (event.type === 'error') throw toError(event.error, event.code);
      onEvent(event);
    }
  }
  throw toError('The import stopped unexpectedly — please try again.', 'INTERNAL');
}

function toError(message, code) {
  const error = new Error(message);
  error.body = { code };
  return error;
}
