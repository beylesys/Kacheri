// KACHERI BACKEND/src/ai/imageGenerator.ts
// Design Studio: AI Image Generation Engine
//
// Provider-pluggable image generation with DALL-E 3 as the default provider.
// Uses the existing OpenAI SDK (v6.7.0) — no new dependencies.
// Includes a dev stub provider for testing without an API key.
//
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Slice B5

import { config } from "../config";

/* ---------- Interfaces ---------- */

export interface ImageGenerationParams {
  prompt: string;
  size?: "1024x1024" | "1024x1792" | "1792x1024";
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
}

export interface ImageGenerationResult {
  imageData: Buffer;
  revisedPrompt: string;
  provider: string;
  model: string;
  mimeType: string;
  width: number;
  height: number;
}

/** Provider abstraction for future extensibility (e.g., Stability AI). */
export interface ImageGenerationProvider {
  name: string;
  generate(params: ImageGenerationParams): Promise<ImageGenerationResult>;
}

/* ---------- DALL-E 3 Provider ---------- */

const VALID_SIZES = new Set(["1024x1024", "1024x1792", "1792x1024"]);
const VALID_QUALITIES = new Set(["standard", "hd"]);
const VALID_STYLES = new Set(["vivid", "natural"]);

class DallE3Provider implements ImageGenerationProvider {
  name = "dall-e-3";

  async generate(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: config.ai.openaiKey });

    const size = params.size && VALID_SIZES.has(params.size) ? params.size : "1024x1024";
    const quality = params.quality && VALID_QUALITIES.has(params.quality) ? params.quality : "standard";
    const style = params.style && VALID_STYLES.has(params.style) ? params.style : "vivid";

    const response = await client.images.generate({
      model: "dall-e-3",
      prompt: params.prompt,
      n: 1,
      size: size as "1024x1024" | "1024x1792" | "1792x1024",
      quality: quality as "standard" | "hd",
      style: style as "vivid" | "natural",
      response_format: "b64_json",
    });

    const firstImage = response.data?.[0];
    const b64 = firstImage?.b64_json;
    if (!b64) {
      throw new Error("No image data returned from DALL-E 3");
    }

    const imageData = Buffer.from(b64, "base64");
    const revisedPrompt = firstImage?.revised_prompt ?? params.prompt;

    // Parse dimensions from size param
    const [w, h] = size.split("x").map(Number);

    return {
      imageData,
      revisedPrompt,
      provider: "openai",
      model: "dall-e-3",
      mimeType: "image/png",
      width: w,
      height: h,
    };
  }
}

/* ---------- Dev Stub Provider ---------- */

// Minimal 1x1 transparent PNG (67 bytes)
const STUB_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

class DevImageProvider implements ImageGenerationProvider {
  name = "dev-stub-image";

  async generate(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    return {
      imageData: Buffer.from(STUB_PNG_B64, "base64"),
      revisedPrompt: `[dev-stub] ${params.prompt}`,
      provider: "dev",
      model: "dev-stub-image",
      mimeType: "image/png",
      width: 1,
      height: 1,
    };
  }
}

/* ---------- Factory ---------- */

/**
 * Get the configured image generation provider.
 * Falls back to dev stub when AI_PROVIDER is not 'openai'.
 */
export function getImageProvider(): ImageGenerationProvider {
  const provider = config.ai.provider;

  if (provider === "openai") {
    if (!config.ai.openaiKey) {
      throw new Error("OPENAI_API_KEY is required for image generation");
    }
    return new DallE3Provider();
  }

  // dev, anthropic, ollama — all use the dev stub for image generation
  // (only OpenAI DALL-E 3 is supported for real image gen in v1)
  return new DevImageProvider();
}

/* ---------- Public API ---------- */

/**
 * Generate an image from a text prompt using the configured provider.
 * This is the main entry point for image generation.
 */
export async function generateImage(
  prompt: string,
  opts?: Partial<Omit<ImageGenerationParams, "prompt">>
): Promise<ImageGenerationResult> {
  const provider = getImageProvider();
  return provider.generate({
    prompt,
    size: opts?.size,
    quality: opts?.quality,
    style: opts?.style,
  });
}
