import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import MealsManager from '../components/MealsManager.jsx';
import IngredientsManager from '../components/IngredientsManager.jsx';
import MealFormPage from './MealFormPage.jsx';
import MealProfilePage from './MealProfilePage.jsx';

export default function ManagePage() {
  const tabClass = ({ isActive }) => `tab-link${isActive ? ' active' : ''}`;

  return (
    <div className="page">
      <h1>Manage Meals & Ingredients</h1>
      <div className="tabs">
        <NavLink to="meals" className={tabClass}>
          Meals & Cuisines
        </NavLink>
        <NavLink to="ingredients" className={tabClass}>
          Ingredients
        </NavLink>
      </div>

      <Routes>
        <Route index element={<Navigate to="meals" replace />} />
        <Route path="meals" element={<MealsManager />} />
        <Route path="meals/new" element={<MealFormPage />} />
        <Route path="meals/:id" element={<MealProfilePage />} />
        <Route path="meals/:id/edit" element={<MealFormPage />} />
        <Route path="ingredients" element={<IngredientsManager />} />
      </Routes>
    </div>
  );
}
