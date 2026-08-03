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

  const response = await fetch(`${comfy.baseUrl}/prompt`, {
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
  pollComfyHistory
};
