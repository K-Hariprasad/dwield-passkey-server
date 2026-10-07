import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

export const connectDatabase = async (): Promise<void> => {
  try {
    if (env.MONGODB_URI.includes('localhost') && env.NODE_ENV === 'production') {
      console.warn('⚠️ WARNING: MONGODB_URI points to localhost in production mode. Make sure MONGODB_URI is configured in your Render environment variables.');
    }
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, // Fail after 10s instead of hanging 30s
    });
    logger.info({ uri: env.MONGODB_URI.replace(/\/\/.*@/, '//***:***@') }, 'Connected to MongoDB successfully');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    logger.error({ err: error }, 'Failed to connect to MongoDB');
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  } catch (error) {
    logger.error({ err: error }, 'Error disconnecting from MongoDB');
  }
};

export const isDatabaseConnected = (): boolean => {
  // mongoose readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  return mongoose.connection.readyState === 1;
};
