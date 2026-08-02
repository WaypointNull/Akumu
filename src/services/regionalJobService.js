const { COMFY_DEFAULT_URL, DEFAULTS } = require('../config/constants');
const { discoverComfyInstallations } = require('./comfyDiscoveryService');
const { generateGlobalPrompt, generateRegionalPrompts, generateMaskPosePrompt } = require('./promptService');
const { submitComfyMaskPrompt, pollComfyHistory } = require('./comfyService');

const regionalJobs = new Map();

function createRegionalJob({ naturalLanguage, modelGlobal, modelRegional, comfy, channelLoras }) {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  regionalJobs.set(jobId, {
    id: jobId,
    status: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    input: { naturalLanguage },
    models: {
      modelGlobal: (modelGlobal || DEFAULTS.modelGlobal).trim(),
      modelRegional: (modelRegional || DEFAULTS.modelRegional).trim()
    },
    globalPrompt: null,
    maskPosePrompt: null,
    redPrompt: null,
    greenPrompt: null,
    bluePrompt: null,
    globalNegative: null,
    comfy: {
      enabled: comfy.enabled,
      status: comfy.enabled ? 'queued' : 'disabled',
      baseUrl: comfy.baseUrl,
      promptId: null,
      image: null,
      error: null
    },
    error: null
  });

  processRegionalJob(jobId, {
    naturalLanguage,
    modelGlobal: (modelGlobal || DEFAULTS.modelGlobal).trim(),
    modelRegional: (modelRegional || DEFAULTS.modelRegional).trim(),
    comfy,
    channelLoras: channelLoras || { red: '', green: '', blue: '' }
  }).catch((error) => {
    const job = regionalJobs.get(jobId);
    if (!job) {
      return;
    }
    job.status = 'failed';
    job.error = error.message || 'Regional job failed.';
    job.updatedAt = new Date().toISOString();
  });

  return jobId;
}

async function processRegionalJob(jobId, payload) {
  const job = regionalJobs.get(jobId);
  if (!job) {
    return;
  }

  job.status = 'running';
  job.updatedAt = new Date().toISOString();

  const globalPrompt = await generateGlobalPrompt(payload.naturalLanguage, payload.modelGlobal);
  job.globalPrompt = globalPrompt;
  job.updatedAt = new Date().toISOString();

  const maskPosePromise = generateMaskPosePrompt(
    payload.naturalLanguage,
    globalPrompt,
    payload.modelRegional
  ).then((maskPosePrompt) => {
    job.maskPosePrompt = maskPosePrompt;
    job.updatedAt = new Date().toISOString();
    return maskPosePrompt;
  });

  const regionalPromise = generateRegionalPrompts(
    payload.naturalLanguage,
    globalPrompt,
    payload.modelRegional,
    payload.channelLoras
  ).then((regional) => {
    job.redPrompt = regional.red;
    job.greenPrompt = regional.green;
    job.bluePrompt = regional.blue;
    job.globalNegative = regional.globalNegative;
    job.updatedAt = new Date().toISOString();
    return regional;
  });

  const comfyPromise = payload.comfy.enabled
    ? payload.comfy.simpleMask
      ? regionalPromise
          .then((regional) => buildSimpleMaskForRegional(job, payload.comfy, regional))
          .catch((error) => {
            job.comfy.status = 'error';
            job.comfy.error = error.message || 'Simple mask generation failed.';
            job.updatedAt = new Date().toISOString();
            return null;
          })
      : Promise.all([regionalPromise, maskPosePromise]).then(([, maskPosePrompt]) =>
          submitComfyMaskPrompt(payload.comfy, payload.naturalLanguage, maskPosePrompt)
        )
        .then((result) => {
          job.comfy.status = 'submitted';
          job.comfy.promptId = result.promptId;
          job.updatedAt = new Date().toISOString();
          return result;
        })
        .catch((error) => {
          job.comfy.status = 'error';
          job.comfy.error = error.message || 'Comfy submission failed.';
          job.updatedAt = new Date().toISOString();
          return null;
        })
    : Promise.resolve(null);

  await Promise.all([regionalPromise, maskPosePromise, comfyPromise]);

  if (!job.comfy.enabled || job.comfy.status === 'error' || job.comfy.status === 'done') {
    job.status = 'done';
  }

  job.updatedAt = new Date().toISOString();
}

async function getRegionalJobStatus(jobId) {
  const job = regionalJobs.get(jobId);
  if (!job) {
    return null;
  }

  if (job.comfy.enabled && job.comfy.status === 'submitted' && job.comfy.promptId) {
    try {
      const comfyStatus = await pollComfyHistory(job.comfy.baseUrl, job.comfy.promptId);
      if (comfyStatus.done) {
        job.comfy.status = 'done';
        job.comfy.image = comfyStatus.image;
        if (job.status === 'running') {
          job.status = 'done';
        }
      }
      job.updatedAt = new Date().toISOString();
    } catch (error) {
      job.comfy.status = 'error';
      job.comfy.error = error.message || 'Comfy polling failed.';
      job.updatedAt = new Date().toISOString();
    }
  }

  return job;
}

function buildComfyConfig(body = {}) {
  const discovery = discoverComfyInstallations();

  const config = {
    enabled: body.comfyEnabled !== false,
    baseUrl: (body.comfyBaseUrl || COMFY_DEFAULT_URL).trim(),
    checkpoint: (body.comfyCheckpoint || '').trim(),
    width: Number(body.width || 512),
    height: Number(body.height || 512),
    steps: Number(body.steps || 12),
    cfg: Number(body.cfg || 2.5),
    sampler: (body.sampler || 'euler').trim(),
    scheduler: (body.scheduler || 'normal').trim(),
    simpleMask: body.simpleMask === true,
    enableClipSkip: body.enableClipSkip === true,
    clipSkip: Number(body.clipSkip ?? -2),
    useSeparateVae: body.useSeparateVae === true,
    separateVae: (body.separateVae || '').trim()
  };

  if (!config.checkpoint && discovery.length > 0 && discovery[0].checkpoints.length > 0) {
    config.checkpoint = discovery[0].checkpoints[0];
  }

  if (config.useSeparateVae && !config.separateVae && discovery.length > 0 && discovery[0].vaes && discovery[0].vaes.length > 0) {
    config.separateVae = discovery[0].vaes[0];
  }

  return config;
}

async function buildSimpleMaskForRegional(job, comfy, regional) {
  job.comfy.status = 'rendering';
  job.updatedAt = new Date().toISOString();

  const dataUrl = generateSimpleRgbMaskDataUri({
    width: comfy.width,
    height: comfy.height,
    channels: [
      { enabled: Boolean((regional.red || '').trim()), color: 'rgb(255,0,0)' },
      { enabled: Boolean((regional.green || '').trim()), color: 'rgb(0,255,0)' },
      { enabled: Boolean((regional.blue || '').trim()), color: 'rgb(0,0,255)' }
    ]
  });

  await delay(650);

  job.comfy.status = 'done';
  job.comfy.image = {
    filename: 'simple_rgb_mask.svg',
    subfolder: '',
    type: 'inline',
    url: dataUrl
  };
  job.updatedAt = new Date().toISOString();
  return job.comfy.image;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  createRegionalJob,
  getRegionalJobStatus,
  buildComfyConfig
};
