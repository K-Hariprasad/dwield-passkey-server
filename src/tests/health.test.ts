import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import * as dbModule from '../config/database';

describe('Health Endpoints Integration Tests', () => {
  const app = createApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /health/live', () => {
    it('should return 200 OK with liveness info', async () => {
      const response = await request(app).get('/health/live');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptimeSeconds');
    });
  });

  describe('GET /health/ready', () => {
    it('should return 503 Service Unavailable when database is not connected', async () => {
      vi.spyOn(dbModule, 'isDatabaseConnected').mockReturnValue(false);

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('status', 'not_ready');
      expect(response.body).toHaveProperty('database', 'disconnected');
    });

    it('should return 200 OK when database is connected', async () => {
      vi.spyOn(dbModule, 'isDatabaseConnected').mockReturnValue(true);

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ready');
      expect(response.body).toHaveProperty('database', 'connected');
    });
  });

  describe('404 Route Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app).get('/v1/unknown-endpoint');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not found: GET /v1/unknown-endpoint',
        },
      });
    });
  });
});
