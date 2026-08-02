function buildComfyMaskPrompt(maskPosePrompt, naturalLanguage) {
  return [
    'rgb mask, black background, stickman silhouette, bathroom sign figure, geometric body, no features, no face',
    maskPosePrompt,
    naturalLanguage,
    'three channel subjects only, red subject rgb(255,0,0), green subject rgb(0,255,0), blue subject rgb(0,0,255)',
    'full body silhouettes, clean hard edges, separated subjects, center composition, no internal detail, no clothing detail'
  ].join(', ');
}

function generateSimpleRgbMaskDataUri({ width = 1024, height = 1024, channels = [] }) {
  const safeWidth = Math.max(256, Math.min(2048, Number(width) || 1024));
  const safeHeight = Math.max(256, Math.min(2048, Number(height) || 1024));

  const active = channels.filter((channel) => channel && channel.enabled);
  const slots = getSlotPositions(active.length, safeWidth, safeHeight);

  const silhouettes = active
    .map((channel, index) => createSilhouetteSvg(slots[index], channel.color, safeWidth, safeHeight))
    .join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">
  <rect x="0" y="0" width="${safeWidth}" height="${safeHeight}" fill="#000000"/>
  ${silhouettes}
</svg>`;

  const base64 = Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

function getSlotPositions(count, width, height) {
  if (count <= 1) {
    return [{ x: width * 0.5, y: height * 0.58, scale: 1 }];
  }
  if (count === 2) {
    return [
      { x: width * 0.33, y: height * 0.58, scale: 0.95 },
      { x: width * 0.67, y: height * 0.58, scale: 0.95 }
    ];
  }
  return [
    { x: width * 0.25, y: height * 0.62, scale: 0.9 },
    { x: width * 0.75, y: height * 0.62, scale: 0.9 },
    { x: width * 0.5, y: height * 0.44, scale: 0.85 }
  ];
}

function createSilhouetteSvg(slot, color, width, height) {
  const unit = Math.min(width, height);
  const scale = slot.scale || 1;
  const headRadius = unit * 0.07 * scale;
  const bodyWidth = unit * 0.18 * scale;
  const bodyHeight = unit * 0.34 * scale;

  const cx = slot.x;
  const bodyTop = slot.y - bodyHeight * 0.3;
  const bodyLeft = cx - bodyWidth / 2;
  const headCy = bodyTop - headRadius * 0.75;
  const rx = bodyWidth * 0.28;

  return `<g fill="${color}">
    <circle cx="${cx}" cy="${headCy}" r="${headRadius}"/>
    <rect x="${bodyLeft}" y="${bodyTop}" width="${bodyWidth}" height="${bodyHeight}" rx="${rx}" ry="${rx}"/>
  </g>`;
}

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
