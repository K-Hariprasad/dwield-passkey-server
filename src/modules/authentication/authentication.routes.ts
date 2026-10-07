import { Router } from 'express';
import { AuthenticationController } from './authentication.controller';
import { authenticateApiKey } from '../../middleware/authenticate-api-key';
import { authenticateUser } from '../../middleware/authenticate-user';
import { ceremonyRateLimiter } from '../../middleware/rate-limit';

const router = Router();

router.use(authenticateApiKey);
router.use(authenticateUser);
router.use(ceremonyRateLimiter);

router.post('/options', AuthenticationController.generateOptions);
router.post('/verify', AuthenticationController.verifyResponse);

export const authenticationRouter = router;
