const express = require('express');
const { DEFAULTS, COMFY_DEFAULTS, COMFY_DEFAULT_URL } = require('../config/constants');
const { runSinglePipeline, formatFinalOutput } = require('../modules/prompt-engine');
const { discoverComfyInstallations, comfyStatus } = require('../modules/comfy');
const { buildControlImage } = require('../modules/scene-control');
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
        modelTranslate: DEFAULTS.modelTranslate,
        modelGlobal: DEFAULTS.modelGlobal,
        modelRegional: DEFAULTS.modelRegional,
        comfyUrl: COMFY_DEFAULT_URL,
        comfy: COMFY_DEFAULTS
      }
    });
  });

  router.get('/comfy/discover', (_req, res) => {
    res.json({ ok: true, discovery: discoverComfyInstallations() });
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

  router.get(
    '/scene/status',
    asyncHandler(async (req, res) => {
      const baseUrl = (req.query.baseUrl || COMFY_DEFAULT_URL).trim();
      const status = await comfyStatus(baseUrl);
      res.json({ ok: true, comfy: status, discovery: discoverComfyInstallations() });
    })
  );

  router.post('/scene/generate', (req, res) => {
    const naturalLanguage = (req.body.naturalLanguage || '').trim();
    if (!naturalLanguage) {
      res.status(400).json({ error: 'naturalLanguage is required.' });
      return;
    }

    const source = (req.body.source || 'sketch').trim();
    const mode = (req.body.mode || 'scribble').trim();

    let control;
    try {
      control = buildControlImage({ source, mode, sketchImage: req.body.sketchImage });
    } catch (error) {
      res.status(error.statusCode || 400).json({ error: error.message });
      return;
    }

    const config = deps.sceneControl.buildSceneConfig(req.body);

    if (!config.checkpoint) {
      res.status(400).json({ error: 'Comfy checkpoint is required.' });
      return;
    }

    if (control && !config.controlNet.name) {
      res.status(400).json({ error: 'ControlNet model is required for a control source.' });
      return;
    }

    const jobId = deps.sceneControl.createSceneJob({
      naturalLanguage,
      negative: (req.body.negative || '').trim(),
      source,
      mode,
      control,
      comfy: config,
      controlNet: config.controlNet
    });

    res.json({ ok: true, jobId });
  });

  router.get(
    '/scene/status/:jobId',
    asyncHandler(async (req, res) => {
      const job = await deps.sceneControl.getSceneJobStatus(req.params.jobId);
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
