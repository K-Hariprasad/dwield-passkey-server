import { Router } from 'express';
import { CredentialController } from './credential.controller';
import { authenticateApiKey } from '../../middleware/authenticate-api-key';
import { authenticateUser } from '../../middleware/authenticate-user';

const router = Router();

router.use(authenticateApiKey);
router.use(authenticateUser);

router.get('/', CredentialController.listCredentials);
router.delete('/:credentialId', CredentialController.revokeCredential);

export const credentialRouter = router;
