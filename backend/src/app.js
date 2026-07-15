const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const { apiLimiter } = require('./middleware/rateLimiter');
const logger = require('./config/logger');

// Route modules
const authRoutes = require('./routes/auth');
const telemetryRoutes = require('./routes/telemetry');
const sensorRoutes = require('./routes/sensor');
const deviceRoutes = require('./routes/device');
const maintenanceRoutes = require('./routes/maintenance');
const configRoutes = require('./routes/config');

const app = express();

// Trust Render's reverse proxy so express-rate-limit reads the real client IP
app.set('trust proxy', 1);

// -------------------------------------------------------------------
// SECURITY MIDDLEWARE
// -------------------------------------------------------------------

// HTTP security headers
app.use(helmet());

// CORS — allow all origins (mobile app + Expo web + ESP32)
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Device-Signature',
      'X-Device-Id',
    ],
  })
);

// -------------------------------------------------------------------
// PERFORMANCE MIDDLEWARE
// -------------------------------------------------------------------

// Gzip compression — reduces payload size for mobile clients
app.use(compression());

// Parse JSON bodies — 50kb limit (IoT payloads are small)
// rawBody is saved for HMAC signature verification on telemetry routes
app.use(express.json({
  limit: '50kb',
  verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); },
}));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// HTTP request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.http(msg.trim()) },
    })
  );
}

// Global rate limiter for all API routes
app.use('/api', apiLimiter);

// -------------------------------------------------------------------
// ROUTES
// -------------------------------------------------------------------

// Health check — used by uptime monitors and load balancers
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'AquaFilter API',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);

// ESP32 telemetry ingest — no JWT, uses HMAC device signature
app.use('/api/telemetry', telemetryRoutes);

// Mobile app routes — device-scoped (deviceId in path)
app.use('/api/device/:deviceId', deviceRoutes);
app.use('/api/sensors/:deviceId', sensorRoutes);
app.use('/api/maintenance/:deviceId', maintenanceRoutes);
app.use('/api/config', configRoutes);

// -------------------------------------------------------------------
// ERROR HANDLING
// -------------------------------------------------------------------

// 404 catch-all
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.stack}`);

  const statusCode = err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production'
      ? 'An internal server error occurred'
      : err.message;

  res.status(statusCode).json({ success: false, message });
});

module.exports = app;
