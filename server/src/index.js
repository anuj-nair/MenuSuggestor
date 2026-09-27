import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import mealsRoutes from './routes/meals.routes.js';
import ingredientsRoutes from './routes/ingredients.routes.js';
import mealIngredientsRoutes from './routes/mealIngredients.routes.js';
import planRoutes from './routes/plan.routes.js';
import historyRoutes from './routes/history.routes.js';
import recipesRoutes from './routes/recipes.routes.js';
import { listCuisines, listMealTypes } from './controllers/meals.controller.js';
import { errorHandler, asyncHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/cuisines', asyncHandler(listCuisines));
app.get('/api/meal-types', asyncHandler(listMealTypes));
app.use('/api/meals/:mealId/ingredients', mealIngredientsRoutes);
app.use('/api/meals', mealsRoutes);
app.use('/api/ingredients', ingredientsRoutes);
app.use('/api/plan', planRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/recipes', recipesRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
