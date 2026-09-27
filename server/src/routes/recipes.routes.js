import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { extractRecipe } from '../controllers/recipes.controller.js';

const router = Router();

router.post('/extract', asyncHandler(extractRecipe));

export default router;
