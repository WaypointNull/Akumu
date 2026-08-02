const express = require('express');
const path = require('path');
const apiRoutes = require('./routes/apiRoutes');

function createApp() {
  const app = express();

  app.use(express.json({ limit: '2mb' }));
  app.use('/api', apiRoutes);
  app.use(express.static(path.join(__dirname, '..', 'public')));

  return app;
}

module.exports = { createApp };
