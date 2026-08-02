const { buildComfyMaskPrompt, generateSimpleRgbMaskDataUri } = require('../utils/maskSvg');

async function submitComfyMaskPrompt(comfy, naturalLanguage, maskPosePrompt) {
  if (!comfy.checkpoint) {
    throw new Error('Comfy checkpoint is required for mask generation.');
  }

  const positive = buildComfyMaskPrompt(maskPosePrompt, naturalLanguage);
  const negative = [
    'photorealistic',
    'complex background',
    'textures',
    'details',
    'gradients',
    'multicolor noise',
    'text',
    'watermark',
    'eyes',
    'mouth',
    'nose',
    'facial_features',
    'clothing_details',
    'lineart',
    'highlight',
    'shadow',
    'muscle_definition',
    'anatomy_detail',
    'eye_detail',
    'mouth_detail',
    'hair_detail',
    'skin_detail'
  ].join(', ');

  const clipSource = comfy.enableClipSkip ? ['10', 0] : ['4', 1];
  const vaeSource = comfy.useSeparateVae && comfy.separateVae ? ['11', 0] : ['4', 2];

  const workflow = {
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: {
        ckpt_name: comfy.checkpoint
      }
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: positive,
        clip: clipSource
      }
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: negative,
        clip: clipSource
      }
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: {
        width: comfy.width,
        height: comfy.height,
        batch_size: 1
      }
    },
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed: Math.floor(Math.random() * 2147483647),
        steps: comfy.steps,
        cfg: comfy.cfg,
        sampler_name: comfy.sampler || 'euler',
        scheduler: comfy.scheduler,
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0]
      }
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['3', 0],
        vae: vaeSource
      }
    },
    '9': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'regional_rgb_mask',
        images: ['8', 0]
      }
    }
  };

  if (comfy.enableClipSkip) {
    workflow['10'] = {
      class_type: 'CLIPSetLastLayer',
      inputs: {
        clip: ['4', 1],
        stop_at_clip_layer: Number(comfy.clipSkip || -2)
      }
    };
  }

  if (comfy.useSeparateVae && comfy.separateVae) {
    workflow['11'] = {
      class_type: 'VAELoader',
      inputs: {
        vae_name: comfy.separateVae
      }
    };
  }

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
  pollComfyHistory,
  generateSimpleRgbMaskDataUri
};
