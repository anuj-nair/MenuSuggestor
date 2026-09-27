import { useId, useState } from 'react';

export default function TagInput({ label, values, onChange, options, placeholder, required }) {
  const [draft, setDraft] = useState('');
  const datalistId = useId();

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const alreadyPresent = values.some((v) => v.toLowerCase() === trimmed.toLowerCase());
    if (!alreadyPresent) onChange([...values, trimmed]);
    setDraft('');
  };

  const removeAt = (index) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      removeAt(values.length - 1);
    }
  };

  return (
    <div className="tag-input">
      {label && (
        <span className="tag-input-label">
          {label}
          {required && values.length === 0 && <span className="field-error"> (at least one required)</span>}
        </span>
      )}
      <div className="tag-input-chips">
        {values.map((v, i) => (
          <span className="chip" key={`${v}-${i}`}>
            {v}
            <button type="button" className="chip-remove" onClick={() => removeAt(i)} aria-label={`Remove ${v}`}>
              &times;
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          list={datalistId}
          placeholder={placeholder}
          className="tag-input-field"
        />
      </div>
      <datalist id={datalistId}>
        {(options || []).map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}
