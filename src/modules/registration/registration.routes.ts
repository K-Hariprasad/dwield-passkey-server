import { Router } from 'express';
import { RegistrationController } from './registration.controller';
import { authenticateApiKey } from '../../middleware/authenticate-api-key';
import { authenticateUser } from '../../middleware/authenticate-user';
import { ceremonyRateLimiter } from '../../middleware/rate-limit';

const router = Router();

// Apply API Key, User authentication, and rate limiting middleware to all registration endpoints
router.use(authenticateApiKey);
router.use(authenticateUser);
router.use(ceremonyRateLimiter);

router.post('/options', RegistrationController.generateOptions);
router.post('/verify', RegistrationController.verifyResponse);

export const registrationRouter = router;
