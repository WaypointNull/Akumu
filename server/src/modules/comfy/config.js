const { COMFY_DEFAULT_URL, COMFY_DEFAULTS } = require('../../config/constants');

function pickFinite(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeComfyConfig(body = {}, discovery = []) {
  const config = {
    enabled: body.comfyEnabled !== false,
    baseUrl: (body.comfyBaseUrl || COMFY_DEFAULT_URL).trim(),
    checkpoint: (body.comfyCheckpoint || '').trim(),
    width: Math.floor(pickFinite(body.width, COMFY_DEFAULTS.width)),
    height: Math.floor(pickFinite(body.height, COMFY_DEFAULTS.height)),
    steps: Math.floor(pickFinite(body.steps, COMFY_DEFAULTS.steps)),
    cfg: pickFinite(body.cfg, COMFY_DEFAULTS.cfg),
    sampler: (body.sampler || COMFY_DEFAULTS.sampler).trim(),
    scheduler: (body.scheduler || COMFY_DEFAULTS.scheduler).trim(),
    simpleMask: body.simpleMask === true,
    enableClipSkip: body.enableClipSkip === true,
    clipSkip: Math.floor(pickFinite(body.clipSkip, COMFY_DEFAULTS.clipSkip)),
    useSeparateVae: body.useSeparateVae === true,
    separateVae: (body.separateVae || '').trim()
  };

  if (!config.checkpoint && discovery.length > 0 && discovery[0].checkpoints.length > 0) {
    config.checkpoint = discovery[0].checkpoints[0];
  }

  if (
    config.useSeparateVae &&
    !config.separateVae &&
    discovery.length > 0 &&
    discovery[0].vaes &&
    discovery[0].vaes.length > 0
  ) {
    config.separateVae = discovery[0].vaes[0];
  }

  return config;
}

module.exports = { normalizeComfyConfig, pickFinite };
