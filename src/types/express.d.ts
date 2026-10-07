import { ITenant } from '../modules/tenants/tenant.types';
import { IApiKey } from '../modules/api-keys/api-key.types';

export interface IUserContext {
  userId: string;
  tenantId?: string;
  permissions?: string[];
  expiresAt?: Date;
  authenticatedAt?: Date;
  authMethod?: string;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: ITenant;
      apiKey?: IApiKey;
      userContext?: IUserContext;
    }
  }
}
