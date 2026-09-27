import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch.js';
import { getMeal, updateMeal, deleteMeal } from '../api/meals.api.js';
import Banner from '../components/Banner.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

export default function MealProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const { data: meal, loading, error, refetch } = useFetch(() => getMeal(id), [id]);
  const [banner, setBanner] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const goBackToList = () => navigate('/manage/meals');

  const uploadPhoto = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setBanner({ type: 'error', text: 'Please choose an image file.' });
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setBanner({ type: 'error', text: 'Image is too large (max 5MB).' });
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await updateMeal(id, { photo: dataUrl });
      refetch();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    uploadPhoto(file);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounterRef.current += 1;
    setIsDragOver(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    if (uploading) return;
    uploadPhoto(e.dataTransfer.files?.[0]);
  };

  const handleRemovePhoto = async () => {
    setUploading(true);
    try {
      await updateMeal(id, { photo: null });
      refetch();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    try {
      const result = await deleteMeal(id);
      navigate('/manage/meals', {
        state: {
          banner: result.softDeleted
            ? `"${meal.name}" is referenced in history, so it was deactivated instead of deleted.`
            : `"${meal.name}" deleted.`,
        },
      });
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
      setPendingDelete(false);
    }
  };

  return (
    <div className="page">
      <button className="btn btn-text back-link" onClick={goBackToList}>
        &larr; Back to Meals
      </button>

      {loading && <p>Loading meal...</p>}
      {error && <Banner type="error">{error.message}</Banner>}
      <Banner type={banner?.type} onDismiss={() => setBanner(null)}>
        {banner?.text}
      </Banner>

      {meal && (
        <div className="meal-profile">
          <div
            className={`meal-profile-photo${isDragOver ? ' drag-over' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {meal.photo ? (
              <img src={meal.photo} alt={meal.name} />
            ) : (
              <div className="meal-profile-photo-placeholder">
                {isDragOver ? 'Drop image to upload' : 'No photo yet — drag & drop or click Add Photo'}
              </div>
            )}
            <div className="meal-profile-photo-actions">
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : meal.photo ? 'Change Photo' : 'Add Photo'}
              </button>
              {meal.photo && (
                <button
                  type="button"
                  className="btn btn-text btn-small btn-danger-text"
                  onClick={handleRemovePhoto}
                  disabled={uploading}
                >
                  Remove
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} hidden />
            </div>
          </div>

          <div className="meal-profile-header">
            <div>
              <h1>{meal.name}</h1>
              {meal.description && <p className="meal-profile-description">{meal.description}</p>}
              <div className="meal-profile-tags">
                {meal.types.map((t) => (
                  <span key={t} className="pill">
                    {t}
                  </span>
                ))}
                {meal.cuisines.map((c) => (
                  <span key={c} className="pill">
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div className="meal-profile-header-actions">
              <button className="btn btn-secondary btn-small" onClick={() => navigate(`/manage/meals/${id}/edit`)}>
                Edit
              </button>
              <button
                className="btn btn-text btn-small btn-danger-text"
                onClick={() => setPendingDelete(true)}
              >
                Delete
              </button>
            </div>
          </div>

          <section className="meal-profile-section">
            <h3>Ingredients</h3>
            {meal.ingredients.length > 0 ? (
              <ul className="meal-profile-ingredients">
                {meal.ingredients.map((ing) => (
                  <li key={ing.ingredient_id}>
                    <span>{ing.name}</span>
                    <span className="meal-profile-ingredient-qty">
                      {[ing.quantity, ing.unit || ing.default_unit].filter(Boolean).join(' ')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">No ingredients listed.</p>
            )}
          </section>

          <section className="meal-profile-section">
            <h3>Instructions</h3>
            {meal.instructions.length > 0 ? (
              <ol className="meal-profile-instructions">
                {meal.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            ) : (
              <p className="hint">No instructions added.</p>
            )}
          </section>

          {meal.notes && (
            <section className="meal-profile-section meal-profile-notes">
              <h3>Notes</h3>
              <p>{meal.notes}</p>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete}
        title="Delete meal?"
        message={`Delete "${meal?.name}"? If it's referenced in history it will be deactivated instead.`}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(false)}
      />
    </div>
  );
}
