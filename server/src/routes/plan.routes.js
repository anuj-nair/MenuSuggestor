import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getPlan, generatePlan, refreshDayHandler } from '../controllers/plan.controller.js';

const router = Router();

router.get('/', asyncHandler(getPlan));
router.post('/generate', asyncHandler(generatePlan));
router.post('/:date/refresh', asyncHandler(refreshDayHandler));

export default router;
