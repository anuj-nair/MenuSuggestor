import { useState } from 'react';

export default function WeekGenerateControls({ onGenerate, generating }) {
  const [includeFreeDay, setIncludeFreeDay] = useState(false);

  return (
    <div className="week-controls">
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={includeFreeDay}
          onChange={(e) => setIncludeFreeDay(e.target.checked)}
        />
        Include a free day this week (pizza/burger)
      </label>
      <button
        className="btn btn-primary"
        onClick={() => onGenerate({ include_free_day: includeFreeDay })}
        disabled={generating}
      >
        {generating ? 'Generating...' : 'Generate / Regenerate Week'}
      </button>
    </div>
  );
}
