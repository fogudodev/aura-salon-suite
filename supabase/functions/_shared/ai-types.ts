export type AIProviderName = "openai" | "groq" | "gemini";

export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AIProviderCallInput = {
  model: string;
  messages: AIMessage[];
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
};

export type AIProviderCallSuccess = {
  text: string;
  model: string;
  provider: AIProviderName;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  raw?: unknown;
};

export type AIProviderCallError = Error & {
  provider?: AIProviderName;
  model?: string;
  statusCode?: number;
  errorCode?: string;
  retryable?: boolean;
  responseBody?: unknown;
};
