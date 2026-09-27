import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  listMeals,
  getMeal,
  createMeal,
  updateMeal,
  deleteMeal,
} from '../controllers/meals.controller.js';

const router = Router();

router.get('/', asyncHandler(listMeals));
router.get('/:id', asyncHandler(getMeal));
router.post('/', asyncHandler(createMeal));
router.put('/:id', asyncHandler(updateMeal));
router.delete('/:id', asyncHandler(deleteMeal));

export default router;
