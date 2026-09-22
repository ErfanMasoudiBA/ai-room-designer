import gc

import numpy as np
import torch
from diffusers import (
    AutoencoderKL,
    ControlNetModel,
    EulerAncestralDiscreteScheduler,
    StableDiffusionControlNetPipeline,
    StableDiffusionInstructPix2PixPipeline,
    StableDiffusionXLControlNetPipeline,
    UniPCMultistepScheduler,
)
from PIL import Image
from transformers import pipeline


class AIModelManager:
    def __init__(self):
        self.depth_estimator = None
        self.sd15_pipe = None
        self.pix2pix_pipe = None
        self.sdxl_pipe = None

    def _get_depth_map(self, image: Image.Image) -> Image.Image:
        if self.depth_estimator is None:
            self.depth_estimator = pipeline("depth-estimation")

        depth = self.depth_estimator(image)["depth"]
        depth = np.array(depth)
        depth = depth[:, :, None]
        depth = np.concatenate([depth, depth, depth], axis=2)
        return Image.fromarray(depth)

    def generate(
        self, init_image: Image.Image, prompt: str, negative_prompt: str, engine: str
    ) -> Image.Image:
        # پاکسازی رم قبل از تغییر مدل
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        if engine == "sd15":
            if self.sd15_pipe is None:
                print("Loading SD 1.5 + ControlNet...")
                controlnet = ControlNetModel.from_pretrained(
                    "lllyasviel/sd-controlnet-depth", torch_dtype=torch.float16
                )
                self.sd15_pipe = StableDiffusionControlNetPipeline.from_pretrained(
                    "runwayml/stable-diffusion-v1-5",
                    controlnet=controlnet,
                    torch_dtype=torch.float16,
                )
                self.sd15_pipe.scheduler = UniPCMultistepScheduler.from_config(
                    self.sd15_pipe.scheduler.config
                )
                self.sd15_pipe.enable_model_cpu_offload()
                self.sd15_pipe.enable_attention_slicing()

            img_512 = init_image.resize((512, 512))
            depth_map = self._get_depth_map(img_512)
            return self.sd15_pipe(
                prompt,
                image=depth_map,
                negative_prompt=negative_prompt,
                num_inference_steps=25,
                controlnet_conditioning_scale=0.85,
            ).images[0]

        elif engine == "pix2pix":
            if self.pix2pix_pipe is None:
                print("Loading InstructPix2Pix...")
                self.pix2pix_pipe = (
                    StableDiffusionInstructPix2PixPipeline.from_pretrained(
                        "timbrooks/instruct-pix2pix",
                        torch_dtype=torch.float16,
                        safety_checker=None,
                    )
                )
                self.pix2pix_pipe.scheduler = (
                    EulerAncestralDiscreteScheduler.from_config(
                        self.pix2pix_pipe.scheduler.config
                    )
                )
                self.pix2pix_pipe.enable_model_cpu_offload()

            img_512 = init_image.resize((512, 512))
            return self.pix2pix_pipe(
                prompt, image=img_512, num_inference_steps=20, image_guidance_scale=1.5
            ).images[0]

        elif engine == "sdxl":
            if self.sdxl_pipe is None:
                print("Loading SDXL + ControlNet...")
                controlnet_xl = ControlNetModel.from_pretrained(
                    "diffusers/controlnet-depth-sdxl-1.0", torch_dtype=torch.float16
                )
                vae = AutoencoderKL.from_pretrained(
                    "madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16
                )
                self.sdxl_pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
                    "stabilityai/stable-diffusion-xl-base-1.0",
                    controlnet=controlnet_xl,
                    vae=vae,
                    torch_dtype=torch.float16,
                    variant="fp16",
                    use_safetensors=True,
                )
                self.sdxl_pipe.enable_model_cpu_offload()
                self.sdxl_pipe.enable_attention_slicing()

            img_1024 = init_image.resize((1024, 1024))
            depth_map_xl = self._get_depth_map(img_1024)
            return self.sdxl_pipe(
                prompt,
                negative_prompt=negative_prompt,
                image=depth_map_xl,
                num_inference_steps=25,
                controlnet_conditioning_scale=0.5,
            ).images[0]

        else:
            raise ValueError("Engine not supported")
