const { COMFY_DEFAULT_URL } = require('../../config/constants');
const { buildMaskWorkflow } = require('./workflow');

async function submitComfyMaskPrompt(comfy, naturalLanguage, maskPosePrompt) {
  if (!comfy.checkpoint) {
    throw new Error('Comfy checkpoint is required for mask generation.');
  }

  const workflow = buildMaskWorkflow({
    comfy,
    naturalLanguage,
    maskPosePrompt,
    seed: Math.floor(Math.random() * 2147483647)
  });

  return submitComfyWorkflow(workflow, comfy.baseUrl);
}

async function submitComfyWorkflow(workflow, baseUrl) {
  const response = await fetch(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: workflow })
  });

  if (!response.ok) {
    const text = await response.text();
    if (/clip input is invalid|valid clip|text encoder/i.test(text)) {
      throw new Error(
        `Comfy rejected the checkpoint CLIP/text encoder (${response.status}): ${text}. ` +
          'Use a checkpoint that includes CLIP/text encoder (for Illustrious, enable CLIPSkip with -2), or switch to a compatible workflow/model.'
      );
    }
    throw new Error(`Comfy prompt submission failed (${response.status}): ${text}`);
  }

  const json = await response.json();
  return {
    promptId: json.prompt_id || null
  };
}

async function uploadComfyImage(buffer, baseUrl, { filename = 'scene_control.png', mimeType = 'image/png' } = {}) {
  const form = new FormData();
  form.append('image', new Blob([buffer], { type: mimeType }), filename);
  const response = await fetch(`${baseUrl}/upload/image`, { method: 'POST', body: form });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Comfy image upload failed (${response.status}): ${text}`);
  }

  const json = await response.json();
  return json.name || null;
}

async function comfyStatus(baseUrl = COMFY_DEFAULT_URL) {
  let response;
  try {
    response = await fetch(`${baseUrl}/system_stats`, { signal: AbortSignal.timeout(3000) });
  } catch {
    return { reachable: false, error: 'ComfyUI unreachable' };
  }

  if (!response.ok) {
    return { reachable: true, error: `ComfyUI responded ${response.status}` };
  }

  return { reachable: true, error: null };
}

async function pollComfyHistory(baseUrl, promptId) {
  const response = await fetch(`${baseUrl}/history/${promptId}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Comfy history polling failed (${response.status}): ${text}`);
  }

  const history = await response.json();
  const run = history[promptId];
  if (!run || !run.outputs) {
    return { done: false, image: null };
  }

  let image = null;
  for (const nodeId of Object.keys(run.outputs)) {
    const out = run.outputs[nodeId];
    if (out.images && out.images.length > 0) {
      const first = out.images[0];
      const query = new URLSearchParams({
        filename: first.filename,
        subfolder: first.subfolder || '',
        type: first.type || 'output'
      }).toString();
      image = {
        filename: first.filename,
        subfolder: first.subfolder || '',
        type: first.type || 'output',
        url: `${baseUrl}/view?${query}`
      };
      break;
    }
  }

  return {
    done: Boolean(image),
    image
  };
}

module.exports = {
  submitComfyMaskPrompt,
  submitComfyWorkflow,
  uploadComfyImage,
  comfyStatus,
  pollComfyHistory
};
