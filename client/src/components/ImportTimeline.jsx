// Horizontal step timeline for a recipe import. Each step is 'done',
// 'active', 'failed' or 'pending'; the active step's detail line and an
// elapsed-time counter sit underneath so a 1–2 minute wait feels tracked.
export default function ImportTimeline({ steps, activeIndex, failed, detail, elapsedSeconds }) {
  const stateOf = (i) => {
    if (i < activeIndex) return 'done';
    if (i === activeIndex) return failed ? 'failed' : 'active';
    return 'pending';
  };

  return (
    <div className="import-timeline-wrap" aria-live="polite">
      <ol className="import-timeline">
        {steps.map((step, i) => {
          const state = stateOf(i);
          return (
            <li key={step.id} className={`import-step import-step-${state}`}>
              <span className="import-step-dot" aria-hidden="true">
                {state === 'done' ? '✓' : state === 'failed' ? '!' : i + 1}
              </span>
              <span className="import-step-label">{step.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="import-timeline-detail">
        <span>{detail}</span>
        {elapsedSeconds != null && <span className="import-timeline-elapsed">{formatElapsed(elapsedSeconds)}</span>}
      </p>
    </div>
  );
}

function formatElapsed(total) {
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}
