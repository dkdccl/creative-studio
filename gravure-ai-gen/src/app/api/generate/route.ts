import axios, { AxiosError } from "axios";
import { NextResponse } from "next/server";

import {
  DEFAULT_JOB_TYPE,
  MAX_STEPS,
  MIN_STEPS,
  PRODIA_ENDPOINT,
  normalizeSize,
  type GenerateError,
  type GenerateRequest,
} from "@/lib/prodia";

// Prodia holds the connection open while the image renders, so this needs the
// Node runtime and a generous ceiling rather than the default edge timeout.
export const runtime = "nodejs";
export const maxDuration = 120;

function fail(status: number, error: string, detail?: string) {
  return NextResponse.json<GenerateError>({ error, detail }, { status });
}

/** Prodia returns errors as bytes too, so decode before surfacing them. */
function decodeUpstreamError(data: unknown): string | undefined {
  if (!data) return undefined;
  try {
    const text = Buffer.isBuffer(data)
      ? data.toString("utf8")
      : data instanceof ArrayBuffer
        ? Buffer.from(data).toString("utf8")
        : typeof data === "string"
          ? data
          : JSON.stringify(data);
    return text.slice(0, 500) || undefined;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const token = process.env.PRODIA_TOKEN;
  if (!token) {
    return fail(
      500,
      "PRODIA_TOKEN is not set. Add it to .env.local and restart the dev server.",
    );
  }

  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Request body must be JSON.");
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return fail(400, "A prompt is required.");
  }

  const config: Record<string, unknown> = {
    prompt,
    width: normalizeSize(body.width ?? 832),
    height: normalizeSize(body.height ?? 1216),
    steps: Math.min(MAX_STEPS, Math.max(MIN_STEPS, Math.round(body.steps ?? 20))),
  };

  const negativePrompt = body.negativePrompt?.trim();
  if (negativePrompt) {
    config.negative_prompt = negativePrompt;
  }
  // Omitting the seed entirely is what makes Prodia pick a random one.
  if (Number.isFinite(body.seed)) {
    config.seed = Math.trunc(body.seed as number);
  }

  try {
    const response = await axios.post(
      PRODIA_ENDPOINT,
      { type: body.jobType?.trim() || DEFAULT_JOB_TYPE, config },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "image/jpeg",
        },
        responseType: "arraybuffer",
        timeout: 110_000,
      },
    );

    const contentType = response.headers["content-type"];

    return new NextResponse(Buffer.from(response.data), {
      status: 200,
      headers: {
        "Content-Type": typeof contentType === "string" ? contentType : "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const axiosError = error as AxiosError;

    if (axiosError.code === "ECONNABORTED") {
      return fail(504, "Prodia took too long to respond. Try fewer steps.");
    }

    const status = axiosError.response?.status;
    const detail = decodeUpstreamError(axiosError.response?.data);

    switch (status) {
      case 401:
      case 403:
        return fail(502, "Prodia rejected the API token.", detail);
      case 402:
        return fail(
          502,
          "Prodia reports no active subscription for this token.",
          detail,
        );
      case 429:
        return fail(429, "Rate limited by Prodia. Wait a moment and retry.", detail);
      default:
        return fail(
          502,
          `Prodia request failed${status ? ` (HTTP ${status})` : ""}.`,
          detail ?? axiosError.message,
        );
    }
  }
}
