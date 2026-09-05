"use client";

import axios from "axios";
import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_JOB_TYPE,
  MAX_STEPS,
  MAX_SIZE,
  MIN_STEPS,
  MIN_SIZE,
  SIZE_PRESETS,
  SIZE_STEP,
  type GenerateError,
  type GenerateRequest,
} from "@/lib/prodia";

/** The route returns image bytes on success and JSON on failure. */
async function readErrorMessage(blob: Blob): Promise<string> {
  try {
    const parsed = JSON.parse(await blob.text()) as GenerateError;
    return parsed.detail ? `${parsed.error} — ${parsed.detail}` : parsed.error;
  } catch {
    return "Generation failed for an unknown reason.";
  }
}

const fieldClass =
  "w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm " +
  "outline-none transition focus:border-black/40 " +
  "dark:border-white/15 dark:bg-white/5 dark:focus:border-white/40";

const labelClass = "mb-1.5 block text-xs font-medium uppercase tracking-wide opacity-60";

export default function ImageGenerator() {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("blurry, low quality, watermark");
  const [jobType, setJobType] = useState(DEFAULT_JOB_TYPE);
  const [width, setWidth] = useState(832);
  const [height, setHeight] = useState(1216);
  const [steps, setSteps] = useState(20);
  const [seed, setSeed] = useState("");

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Object URLs leak until revoked, so track the live one and clean it up.
  const objectUrlRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function showImage(blob: Blob) {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;
    setImageUrl(url);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isGenerating || !prompt.trim()) return;

    setIsGenerating(true);
    setError(null);

    const payload: GenerateRequest = {
      prompt,
      negativePrompt,
      jobType,
      width,
      height,
      steps,
      ...(seed.trim() ? { seed: Number(seed) } : {}),
    };

    try {
      const response = await axios.post<Blob>("/api/generate", payload, {
        responseType: "blob",
        timeout: 120_000,
      });
      showImage(response.data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
        setError(await readErrorMessage(err.response.data));
      } else if (axios.isAxiosError(err) && err.code === "ECONNABORTED") {
        setError("Timed out waiting for the image. Try fewer steps.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:items-start">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className={labelClass} htmlFor="prompt">
            Prompt
          </label>
          <textarea
            id="prompt"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image you want to generate"
            className={`${fieldClass} resize-y`}
            required
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="negative-prompt">
            Negative prompt
          </label>
          <input
            id="negative-prompt"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div>
          <span className={labelClass}>Size</span>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SIZE_PRESETS.map((preset) => {
              const active = preset.width === width && preset.height === height;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setWidth(preset.width);
                    setHeight(preset.height);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    active
                      ? "border-transparent bg-foreground text-background"
                      : "border-black/15 hover:border-black/40 dark:border-white/15 dark:hover:border-white/40"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              aria-label="Width"
              type="number"
              min={MIN_SIZE}
              max={MAX_SIZE}
              step={SIZE_STEP}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              className={fieldClass}
            />
            <input
              aria-label="Height"
              type="number"
              min={MIN_SIZE}
              max={MAX_SIZE}
              step={SIZE_STEP}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              className={fieldClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="steps">
              Steps
            </label>
            <input
              id="steps"
              type="number"
              min={MIN_STEPS}
              max={MAX_STEPS}
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="seed">
              Seed
            </label>
            <input
              id="seed"
              type="number"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="random"
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="job-type">
            Prodia job type
          </label>
          <input
            id="job-type"
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            className={`${fieldClass} font-mono text-xs`}
          />
          <p className="mt-1.5 text-xs opacity-50">
            Any type from{" "}
            <a
              href="https://docs.prodia.com/reference/inference/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              the Prodia docs
            </a>
            .
          </p>
        </div>

        <button
          type="submit"
          disabled={isGenerating || !prompt.trim()}
          className="rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isGenerating ? "Generating…" : "Generate"}
        </button>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}
      </form>

      <div className="flex min-h-80 items-center justify-center rounded-lg border border-dashed border-black/15 p-4 dark:border-white/15">
        {imageUrl ? (
          <figure className="flex flex-col items-center gap-3">
            {/* Blob URL of freshly generated bytes — next/image can't optimize it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={prompt}
              className="max-h-[70vh] w-auto rounded-md"
            />
            <a
              href={imageUrl}
              download="generated.jpg"
              className="text-xs underline underline-offset-2 opacity-60 hover:opacity-100"
            >
              Download
            </a>
          </figure>
        ) : (
          <p className="text-sm opacity-40">
            {isGenerating ? "Rendering…" : "The generated image appears here."}
          </p>
        )}
      </div>
    </div>
  );
}
