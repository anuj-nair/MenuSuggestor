import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  listIngredients,
  createIngredient,
  updateIngredient,
  listUnits,
  listIngredientTags,
} from '../controllers/ingredients.controller.js';

const router = Router();

router.get('/units', asyncHandler(listUnits));
router.get('/tags', asyncHandler(listIngredientTags));
router.get('/', asyncHandler(listIngredients));
router.post('/', asyncHandler(createIngredient));
router.put('/:id', asyncHandler(updateIngredient));

export default router;
