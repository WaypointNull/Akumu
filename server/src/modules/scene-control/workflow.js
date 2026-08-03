function buildControlNetWorkflow({ comfy, controlNet, controlImage, positive, negative, seed }) {
  const clipSource = comfy.enableClipSkip ? ['10', 0] : ['4', 1];
  const vaeSource = comfy.useSeparateVae && comfy.separateVae ? ['11', 0] : ['4', 2];
  const usesControl = Boolean(controlNet && controlNet.name && controlImage);

  let modelSource = ['4', 0];
  let positiveSource = ['6', 0];
  let negativeSource = ['7', 0];

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
        text: negative,
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
        sampler_name: comfy.sampler,
        scheduler: comfy.scheduler,
        denoise: 1,
        model: modelSource,
        positive: positiveSource,
        negative: negativeSource,
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
        filename_prefix: 'scene_control',
        images: ['8', 0]
      }
    }
  };

  if (usesControl) {
    workflow['13'] = {
      class_type: 'LoadImage',
      inputs: {
        image: controlImage
      }
    };
    workflow['14'] = {
      class_type: 'ControlNetLoader',
      inputs: {
        control_net_name: controlNet.name
      }
    };
    workflow['15'] = {
      class_type: 'ControlNetApplyAdvanced',
      inputs: {
        positive: ['6', 0],
        negative: ['7', 0],
        control_net: ['14', 0],
        image: ['13', 0],
        strength: controlNet.strength,
        start_percent: controlNet.startPercent,
        end_percent: controlNet.endPercent
      }
    };
    positiveSource = ['15', 0];
    negativeSource = ['15', 1];
    workflow['3'].inputs.positive = positiveSource;
    workflow['3'].inputs.negative = negativeSource;
  }

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

module.exports = { buildControlNetWorkflow };
