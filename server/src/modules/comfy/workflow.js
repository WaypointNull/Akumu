const { buildComfyMaskPrompt } = require('./svg');

const MASK_NEGATIVE = [
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

function buildMaskWorkflow({ comfy, naturalLanguage, maskPosePrompt, seed }) {
  const positive = buildComfyMaskPrompt(maskPosePrompt, naturalLanguage);

  const clipSource = comfy.enableClipSkip ? ['10', 0] : ['4', 1];
  const vaeSource = comfy.useSeparateVae && comfy.separateVae ? ['11', 0] : ['4', 2];

  const workflow = {
    4: {
      class_type: 'CheckpointLoaderSimple',
      inputs: {
        ckpt_name: comfy.checkpoint
      }
    },
    6: {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: positive,
        clip: clipSource
      }
    },
    7: {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: MASK_NEGATIVE,
        clip: clipSource
      }
    },
    5: {
      class_type: 'EmptyLatentImage',
      inputs: {
        width: comfy.width,
        height: comfy.height,
        batch_size: 1
      }
    },
    3: {
      class_type: 'KSampler',
      inputs: {
        seed,
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
    8: {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['3', 0],
        vae: vaeSource
      }
    },
    9: {
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

  return workflow;
}

module.exports = { buildMaskWorkflow, MASK_NEGATIVE };
