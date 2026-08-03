const { pickFinite, normalizeComfyConfig } = require('../comfy');

function pickClamped(value, fallback, min, max) {
  const n = pickFinite(value, fallback);
  return Math.min(max, Math.max(min, n));
}

function normalizeSceneConfig(body = {}, discovery = []) {
  const comfy = normalizeComfyConfig(body, discovery);
  const controlNet = {
    name: (body.controlNetModel || '').trim(),
    strength: pickClamped(body.controlStrength, 0.75, 0.0, 2.0),
    startPercent: pickClamped(body.controlStart, 0.0, 0.0, 1.0),
    endPercent: pickClamped(body.controlEnd, 1.0, 0.0, 1.0)
  };

  if (controlNet.startPercent > controlNet.endPercent) {
    controlNet.endPercent = controlNet.startPercent;
  }

  return {
    ...comfy,
    controlNet,
    seed: Math.floor(pickFinite(body.seed, Math.random() * 2147483647))
  };
}

module.exports = { normalizeSceneConfig, pickClamped };
