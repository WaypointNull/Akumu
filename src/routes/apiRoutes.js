const express = require('express');
const { DEFAULTS } = require('../config/constants');
const { runSinglePipeline } = require('../services/promptService');
const { discoverComfyInstallations } = require('../services/comfyDiscoveryService');
const { createRegionalJob, getRegionalJobStatus, buildComfyConfig } = require('../services/regionalJobService');
const { getTagSet } = require('../services/tagListService');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, tagCount: getTagSet().size });
});

router.get('/comfy/discover', (_req, res) => {
  try {
    const discovery = discoverComfyInstallations();
    res.json({ ok: true, discovery });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not discover ComfyUI installations.' });
  }
});

router.post('/run', async (req, res) => {
  try {
    const naturalLanguage = (req.body.naturalLanguage || '').trim();
    if (!naturalLanguage) {
      res.status(400).json({ error: 'naturalLanguage is required.' });
      return;
    }

    const result = await runSinglePipeline({
      naturalLanguage,
      loraInput: (req.body.loraInput || '').trim(),
      modelTranslate: (req.body.modelTranslate || DEFAULTS.modelTranslate).trim(),
      modelValidate: (req.body.modelValidate || DEFAULTS.modelValidate).trim(),
      modelFormat: (req.body.modelFormat || DEFAULTS.modelFormat).trim()
    });

    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unexpected server error.' });
  }
});

router.post('/regional/start', (req, res) => {
  try {
    const naturalLanguage = (req.body.naturalLanguage || '').trim();
    if (!naturalLanguage) {
      res.status(400).json({ error: 'naturalLanguage is required.' });
      return;
    }

    const comfy = buildComfyConfig(req.body);
    const jobId = createRegionalJob({
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
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not start regional job.' });
  }
});

router.get('/regional/status/:jobId', async (req, res) => {
  try {
    const job = await getRegionalJobStatus(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }

    res.json({ ok: true, job });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not read regional status.' });
  }
});

module.exports = router;
