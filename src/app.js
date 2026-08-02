const express = require('express');
const path = require('path');
const { createApiRoutes } = require('./routes/apiRoutes');

function createApp(deps) {
  const app = express();

  app.use(express.json({ limit: '2mb' }));
  app.use('/api', createApiRoutes(deps));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  return app;
}

module.exports = { createApp };
