import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { listHistory, upsertHistoryEntry, deleteHistoryEntry } from '../controllers/history.controller.js';

const router = Router();

router.get('/', asyncHandler(listHistory));
router.put('/:date', asyncHandler(upsertHistoryEntry));
router.delete('/:date', asyncHandler(deleteHistoryEntry));

export default router;
