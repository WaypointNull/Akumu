const express = require('express');
const path = require('path');
const { createApiRoutes } = require('./routes/apiRoutes');

function createApp(deps) {
  const app = express();

  app.use(express.json({ limit: '2mb' }));
  app.use((req, _res, next) => {
    req.body = req.body || {};
    next();
  });
  app.use('/api', createApiRoutes(deps));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((error, _req, res, _next) => {
    const isParseError = error.type === 'entity.parse.failed';
    const isTooLarge = error.type === 'entity.too.large';
    const status = isParseError ? 400 : isTooLarge ? 413 : error.statusCode || error.status || 500;
    const message = isParseError
      ? 'Invalid JSON body.'
      : isTooLarge
        ? 'Request body too large.'
        : error.message || 'Unexpected server error.';
    if (status >= 500) {
      console.error(error);
    }
    res.status(status).json({ error: message });
  });

  return app;
}

module.exports = { createApp };
