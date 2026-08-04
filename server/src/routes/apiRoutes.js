const express = require('express');
const { DEFAULTS } = require('../config/constants');
const { runSinglePipeline, formatFinalOutput } = require('../modules/prompt-engine');
const { ollamaStatus } = require('../modules/llm');

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function createApiRoutes(deps) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      tagCount: deps.repository.getTagSet().size,
      defaults: {
        modelTranslate: DEFAULTS.modelTranslate
      }
    });
  });

  router.get(
    '/llm/status',
    asyncHandler(async (_req, res) => {
      res.json({ ok: true, ...(await ollamaStatus()) });
    })
  );

  router.post(
    '/run',
    asyncHandler(async (req, res) => {
      const naturalLanguage = (req.body.naturalLanguage || '').trim();
      if (!naturalLanguage) {
        res.status(400).json({ error: 'naturalLanguage is required.' });
        return;
      }

      const result = await runSinglePipeline(
        {
          naturalLanguage,
          loraInput: (req.body.loraInput || '').trim(),
          modelTranslate: (req.body.modelTranslate || DEFAULTS.modelTranslate).trim(),
          mode: req.body.mode || 'strict'
        },
        deps
      );

      res.json({ ok: true, ...result });
    })
  );

  router.post('/format', (req, res) => {
    const tags = Array.isArray(req.body.tags) ? req.body.tags.map((t) => String(t).trim()).filter(Boolean) : [];
    const loraInput = (req.body.loraInput || '').trim();
    if (tags.length === 0) {
      res.status(400).json({ error: 'tags is required.' });
      return;
    }

    res.json({ ok: true, ...formatFinalOutput({ promptTags: tags, loraInput }) });
  });

  return router;
}

module.exports = { createApiRoutes };
