import { useRef, useState } from 'react';

export default function InstructionsEditor({ instructions, onChange }) {
  const [draft, setDraft] = useState('');
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragIndexRef = useRef(null);

  const addStep = (e) => {
    e?.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onChange([...instructions, trimmed]);
    setDraft('');
  };

  const updateStep = (index, value) => {
    onChange(instructions.map((step, i) => (i === index ? value : step)));
  };

  const removeStep = (index) => {
    onChange(instructions.filter((_, i) => i !== index));
  };

  const handleDragStart = (index) => (e) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (index) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleDrop = (index) => (e) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(null);
    if (from === null || from === index) return;
    const next = [...instructions];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    onChange(next);
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addStep();
    }
  };

  return (
    <div className="instructions-editor">
      <h4>Instructions (optional)</h4>

      {instructions.length > 0 && (
        <ol className="instructions-list">
          {instructions.map((step, i) => (
            <li
              key={i}
              className={dragOverIndex === i ? 'drag-over' : undefined}
              onDragOver={handleDragOver(i)}
              onDrop={handleDrop(i)}
            >
              <span
                className="instruction-drag-handle"
                draggable
                onDragStart={handleDragStart(i)}
                onDragEnd={handleDragEnd}
                aria-label={`Drag to reorder step ${i + 1}`}
                title="Drag to reorder"
              >
                &#9776;
              </span>
              <span className="instruction-step-number">{i + 1}</span>
              <input
                type="text"
                value={step}
                onChange={(e) => updateStep(i, e.target.value)}
                className="instruction-step-input"
              />
              <div className="instruction-step-actions">
                <button type="button" className="btn btn-text btn-small" onClick={() => removeStep(i)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="inline-form">
        <input
          type="text"
          placeholder="Add a step, press Enter to add"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          className="instruction-input"
        />
        <button type="button" className="btn btn-secondary btn-small" onClick={addStep} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}
