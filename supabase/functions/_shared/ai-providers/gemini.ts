import type { AIProviderCallError, AIProviderCallInput, AIProviderCallSuccess } from "../ai-types.ts";

const GEMINI_BASE_URL = (Deno.env.get("GEMINI_API_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, "");

function getApiKey() {
  return (Deno.env.get("GEMINI_API_KEY") || "").trim();
}

function makeError(params: {
  message: string;
  model: string;
  statusCode?: number;
  errorCode?: string;
  retryable?: boolean;
  responseBody?: unknown;
}): AIProviderCallError {
  const error = new Error(params.message) as AIProviderCallError;
  error.provider = "gemini";
  error.model = params.model;
  error.statusCode = params.statusCode;
  error.errorCode = params.errorCode;
  error.retryable = params.retryable;
  error.responseBody = params.responseBody;
  return error;
}

function isRetryableStatus(status?: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || (status !== undefined && status >= 500);
}

function extractText(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices as Array<Record<string, unknown>> : [];
  const firstChoice = choices[0] || {};
  const message = (firstChoice.message || {}) as Record<string, unknown>;
  const content = message.content;

  if (typeof content === "string") return content.trim();

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}

// Gemini OpenAI-compatible adapter.
export async function callProvider(input: AIProviderCallInput): Promise<AIProviderCallSuccess> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw makeError({
      message: "GEMINI_API_KEY_NOT_CONFIGURED",
      model: input.model,
      errorCode: "GEMINI_API_KEY_NOT_CONFIGURED",
      retryable: false,
    });
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? 16000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
      }),
    });

    const rawText = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      payload = { raw: rawText };
    }

    if (!response.ok) {
      const errorPayload = ((payload.error || {}) as Record<string, unknown>);
      throw makeError({
        message: `GEMINI_HTTP_${response.status}`,
        model: input.model,
        statusCode: response.status,
        errorCode: String(errorPayload.code || errorPayload.status || `HTTP_${response.status}`),
        retryable: isRetryableStatus(response.status),
        responseBody: payload,
      });
    }

    const text = extractText(payload);
    if (!text) {
      throw makeError({
        message: "GEMINI_EMPTY_RESPONSE",
        model: input.model,
        statusCode: response.status,
        errorCode: "GEMINI_EMPTY_RESPONSE",
        retryable: false,
        responseBody: payload,
      });
    }

    const usage = (payload.usage || payload.usage_metadata || {}) as Record<string, unknown>;

    return {
      provider: "gemini",
      model: input.model,
      text,
      latencyMs: Date.now() - startedAt,
      inputTokens: Number(usage.prompt_tokens || usage.input_tokens || usage.prompt_token_count || 0) || undefined,
      outputTokens: Number(usage.completion_tokens || usage.output_tokens || usage.candidates_token_count || 0) || undefined,
      raw: payload,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw makeError({
        message: "GEMINI_TIMEOUT",
        model: input.model,
        errorCode: "GEMINI_TIMEOUT",
        retryable: true,
      });
    }

    if ((error as AIProviderCallError)?.provider === "gemini") throw error;

    throw makeError({
      message: error instanceof Error ? error.message : String(error),
      model: input.model,
      errorCode: "GEMINI_UNKNOWN_ERROR",
      retryable: true,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
