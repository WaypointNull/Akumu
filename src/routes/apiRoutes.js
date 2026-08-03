const express = require('express');
const { DEFAULTS } = require('../config/constants');
const { runSinglePipeline, formatFinalOutput } = require('../modules/prompt-engine');
const { discoverComfyInstallations } = require('../modules/comfy');

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function createApiRoutes(deps) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, tagCount: deps.repository.getTagSet().size });
  });

  router.get('/comfy/discover', (_req, res) => {
    res.json({ ok: true, discovery: discoverComfyInstallations() });
  });

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
          modelTranslate: (req.body.modelTranslate || DEFAULTS.modelTranslate).trim()
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

  router.post('/regional/start', (req, res) => {
    const naturalLanguage = (req.body.naturalLanguage || '').trim();
    if (!naturalLanguage) {
      res.status(400).json({ error: 'naturalLanguage is required.' });
      return;
    }

    const comfy = deps.regionalPainter.buildComfyConfig(req.body);
    const jobId = deps.regionalPainter.createRegionalJob({
      naturalLanguage,
      modelGlobal: (req.body.modelGlobal || DEFAULTS.modelGlobal).trim(),
      modelRegional: (req.body.modelRegional || DEFAULTS.modelRegional).trim(),
      comfy,
      channelLoras: {
        red: (req.body.redLoraInput || '').trim(),
        green: (req.body.greenLoraInput || '').trim(),
        blue: (req.body.blueLoraInput || '').trim()
      }
    });

    res.json({ ok: true, jobId });
  });

  router.get(
    '/regional/status/:jobId',
    asyncHandler(async (req, res) => {
      const job = await deps.regionalPainter.getRegionalJobStatus(req.params.jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found.' });
        return;
      }

      res.json({ ok: true, job });
    })
  );

  return router;
}

module.exports = { createApiRoutes };
