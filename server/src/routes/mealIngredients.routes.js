import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  listMealIngredients,
  linkIngredient,
  updateLink,
  unlinkIngredient,
} from '../controllers/mealIngredients.controller.js';

const router = Router({ mergeParams: true });

router.get('/', asyncHandler(listMealIngredients));
router.post('/', asyncHandler(linkIngredient));
router.put('/:ingredientId', asyncHandler(updateLink));
router.delete('/:ingredientId', asyncHandler(unlinkIngredient));

export default router;
