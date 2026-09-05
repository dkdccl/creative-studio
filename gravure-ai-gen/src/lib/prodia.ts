/**
 * Shared contract between the /api/generate route and the client UI.
 *
 * Prodia's v2 inference API takes every workload through a single
 * POST https://inference.prodia.com/v2/job endpoint, discriminated by `type`.
 * See https://docs.prodia.com/reference/inference/ for the current job types.
 */

export const PRODIA_ENDPOINT = "https://inference.prodia.com/v2/job";

/** Job type used when the request doesn't name one. */
export const DEFAULT_JOB_TYPE = "inference.flux-fast.schnell.txt2img.v2";

export const SIZE_STEP = 64;
export const MIN_SIZE = 256;
export const MAX_SIZE = 1536;
export const MIN_STEPS = 1;
export const MAX_STEPS = 50;

export type GenerateRequest = {
  prompt: string;
  negativePrompt?: string;
  /** Prodia job type, e.g. "inference.flux-fast.schnell.txt2img.v2". */
  jobType?: string;
  width?: number;
  height?: number;
  steps?: number;
  /** Omit for a random seed. */
  seed?: number;
};

export type GenerateError = {
  error: string;
  /** Upstream detail, when Prodia returned something readable. */
  detail?: string;
};

/** Clamp to the range Prodia accepts and round to a multiple of 64. */
export function normalizeSize(value: number): number {
  const clamped = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(value)));
  return Math.round(clamped / SIZE_STEP) * SIZE_STEP;
}

export const SIZE_PRESETS = [
  { label: "Portrait 832×1216", width: 832, height: 1216 },
  { label: "Portrait 768×1024", width: 768, height: 1024 },
  { label: "Square 1024×1024", width: 1024, height: 1024 },
  { label: "Landscape 1216×832", width: 1216, height: 832 },
] as const;
