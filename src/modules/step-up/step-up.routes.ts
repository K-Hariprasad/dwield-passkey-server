import { Router } from 'express';
import { StepUpController } from './step-up.controller';
import { authenticateApiKey } from '../../middleware/authenticate-api-key';
import { authenticateUser } from '../../middleware/authenticate-user';

const router = Router();

// Endpoint used by Customer Application to initiate a Step-Up authentication session
router.post('/initiate', authenticateApiKey, authenticateUser, StepUpController.initiateSession);

// Endpoint used by Customer Backend to verify signed Step-Up Verification Tokens
router.post('/verify-token', authenticateApiKey, StepUpController.verifyToken);

export const stepUpRouter = router;

