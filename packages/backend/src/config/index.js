const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  
  mongoose: {
    url: process.env.MONGODB_URI || 'mongodb://REDACTED',
    options: {
      // Mongoose 6+ doesn't need these options, but kept for compatibility
    },
  },
  
  jwt: {
    secret: process.env.JWT_SECRET,
    // Short default lifetime limits how long a leaked token is useful
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },
  
  weather: {
    apiKey: process.env.OPENWEATHER_API_KEY,
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  
  auth: {
    // Account lockout: after maxLoginAttempts consecutive wrong passwords the
    // account is locked for lockTimeMs, regardless of the caller's IP address.
    maxLoginAttempts: parseInt(process.env.AUTH_MAX_LOGIN_ATTEMPTS, 10) || 5,
    lockTimeMs: parseInt(process.env.AUTH_LOCK_TIME_MS, 10) || 15 * 60 * 1000, // 15 min
  },

  // Stricter per-IP limit for /auth/login and /auth/register (failed requests only)
  authRateLimit: {
    windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 min
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 10,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000, // 5 s
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 300,
  },
};

module.exports = config;
