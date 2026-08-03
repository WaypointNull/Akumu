const { discoverComfyInstallations, submitComfyWorkflow, uploadComfyImage, pollComfyHistory } = require('../comfy');
const { buildControlNetWorkflow } = require('./workflow');
const { normalizeSceneConfig } = require('./config');

function createSceneControlPainter() {
  const jobs = new Map();

  function createSceneJob({ naturalLanguage, negative = '', source, mode, control, comfy, controlNet }) {
    const jobId = `scene_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    jobs.set(jobId, {
      id: jobId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source,
      mode,
      controlImage: null,
      comfy: {
        status: 'queued',
        baseUrl: comfy.baseUrl,
        promptId: null,
        image: null,
        error: null
      },
      error: null
    });

    processSceneJob(jobId, { naturalLanguage, negative, source, mode, control, comfy, controlNet }).catch((error) => {
      const job = jobs.get(jobId);
      if (!job) {
        return;
      }
      job.status = 'failed';
      job.error = error.message || 'Scene control job failed.';
      job.comfy.status = 'error';
      job.comfy.error = error.message || 'Scene control job failed.';
      job.updatedAt = new Date().toISOString();
    });

    return jobId;
  }

  async function processSceneJob(jobId, payload) {
    const job = jobs.get(jobId);
    if (!job) {
      return;
    }

    job.status = 'running';
    job.updatedAt = new Date().toISOString();

    let controlFilename = null;
    if (payload.control) {
      job.comfy.status = 'uploading';
      job.updatedAt = new Date().toISOString();

      controlFilename = await uploadComfyImage(payload.control.buffer, payload.comfy.baseUrl, {
        filename: 'scene_control.png',
        mimeType: payload.control.mimeType
      });

      job.controlImage = {
        filename: controlFilename,
        url: `${payload.comfy.baseUrl}/view?filename=${encodeURIComponent(controlFilename)}&subfolder=&type=input`
      };
      job.comfy.status = 'queued';
      job.updatedAt = new Date().toISOString();
    }

    const workflow = buildControlNetWorkflow({
      comfy: payload.comfy,
      controlNet: controlFilename ? payload.controlNet : null,
      controlImage: controlFilename,
      positive: payload.naturalLanguage,
      negative: payload.negative,
      seed: payload.comfy.seed
    });

    const result = await submitComfyWorkflow(workflow, payload.comfy.baseUrl);
    job.comfy.status = 'submitted';
    job.comfy.promptId = result.promptId;
    job.updatedAt = new Date().toISOString();
  }

  async function getSceneJobStatus(jobId) {
    const job = jobs.get(jobId);
    if (!job) {
      return null;
    }

    if (job.comfy.status === 'submitted' && job.comfy.promptId) {
      try {
        const comfyRun = await pollComfyHistory(job.comfy.baseUrl, job.comfy.promptId);
        if (comfyRun.done) {
          job.comfy.status = 'done';
          job.comfy.image = comfyRun.image;
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

  function buildSceneConfig(body = {}) {
    return normalizeSceneConfig(body, discoverComfyInstallations());
  }

  return {
    createSceneJob,
    getSceneJobStatus,
    buildSceneConfig
  };
}

module.exports = { createSceneControlPainter };
