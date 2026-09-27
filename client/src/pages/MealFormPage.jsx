import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch.js';
import { getMeal, getCuisines, getMealTypes } from '../api/meals.api.js';
import { getIngredients, getUnits } from '../api/ingredients.api.js';
import MealForm from '../components/MealForm.jsx';
import Banner from '../components/Banner.jsx';

export default function MealFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditing = Boolean(id);
  // Set by the Add Meal dialog after a paste-text / link import.
  const prefill = isEditing ? null : location.state?.prefill || null;
  const importWarnings = isEditing ? [] : location.state?.importWarnings || [];

  const { data: meal, loading, error } = useFetch(
    () => (isEditing ? getMeal(id) : Promise.resolve(null)),
    [id]
  );
  const { data: cuisines } = useFetch(() => getCuisines(), []);
  const { data: mealTypes } = useFetch(() => getMealTypes(), []);
  const { data: catalogIngredients } = useFetch(() => getIngredients(), []);
  const { data: units } = useFetch(() => getUnits(), []);

  const goBackToList = () => navigate('/manage/meals');

  const handleSaved = () => {
    navigate('/manage/meals', { state: { banner: isEditing ? 'Meal saved.' : 'Meal created.' } });
  };

  return (
    <div className="page">
      <button className="btn btn-text back-link" onClick={goBackToList}>
        &larr; Back to Meals
      </button>

      {isEditing && loading && <p>Loading meal...</p>}
      {isEditing && error && <Banner type="error">{error.message}</Banner>}

      {prefill && (
        <Banner type="warning">
          Imported — review everything below before saving.
          {importWarnings.length > 0 && (
            <ul className="import-warnings">
              {importWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </Banner>
      )}

      {(!isEditing || meal) && (
        <MealForm
          meal={isEditing ? meal : null}
          initialDraft={prefill}
          cuisines={cuisines}
          mealTypes={mealTypes}
          catalogIngredients={catalogIngredients}
          units={units}
          onSaved={handleSaved}
          onCancel={goBackToList}
        />
      )}
    </div>
  );
}
