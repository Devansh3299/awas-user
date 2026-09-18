import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaveModelConfigDto } from './dto/save-model-config.dto';
import { LlmConnectionService } from '../llm-connection/llm-connection.service';

const MASTRA_BASE_URL = process.env.MASTRA_BASE_URL || 'http://localhost:4111';

// ─────────────────────────────────────────────────────────────────────────────
// Static provider catalogue — the source-of-truth list for the UI
// ─────────────────────────────────────────────────────────────────────────────

export const PROVIDER_CATALOGUE = [
  {
    providerId: 'groq',
    displayName: 'Groq',
    description: 'Ultra-fast cloud inference (LPU). Best for speed-sensitive tasks.',
    requiresApiKey: true,
    supportsBaseUrl: false,
    docsUrl: 'https://console.groq.com/keys',
    models: [
      { modelId: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', contextWindow: 128000, recommended: true },
      { modelId: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', contextWindow: 128000, recommended: false },
      { modelId: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', contextWindow: 32768, recommended: false },
      { modelId: 'gemma2-9b-it', label: 'Gemma2 9B IT', contextWindow: 8192, recommended: false },
      { modelId: 'llama3-70b-8192', label: 'Llama3 70B', contextWindow: 8192, recommended: false },
    ],
    envVars: ['GROQ_API_KEY'],
  },
  {
    providerId: 'gemini',
    displayName: 'Google Gemini',
    description: 'Google\'s multimodal LLM. Best for complex reasoning and long context.',
    requiresApiKey: true,
    supportsBaseUrl: false,
    docsUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      { modelId: 'google/gemini-2.0-flash', label: 'Gemini 2.0 Flash', contextWindow: 1000000, recommended: true },
      { modelId: 'google/gemini-1.5-pro', label: 'Gemini 1.5 Pro', contextWindow: 2000000, recommended: false },
      { modelId: 'google/gemini-1.5-flash', label: 'Gemini 1.5 Flash', contextWindow: 1000000, recommended: false },
    ],
    envVars: ['GOOGLE_GENERATIVE_AI_API_KEY'],
  },
  {
    providerId: 'ollama',
    displayName: 'Ollama (Local)',
    description: 'Privacy-first local inference. 100% on-premise, zero data leakage.',
    requiresApiKey: false,
    supportsBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434/v1',
    docsUrl: 'https://ollama.com/library',
    models: [
      { modelId: 'llama3.2', label: 'Llama 3.2 (3B)', contextWindow: 128000, recommended: true },
      { modelId: 'llama3.1', label: 'Llama 3.1 (8B)', contextWindow: 128000, recommended: false },
      { modelId: 'mistral', label: 'Mistral 7B', contextWindow: 32000, recommended: false },
      { modelId: 'gemma2', label: 'Gemma2 9B', contextWindow: 8192, recommended: false },
      { modelId: 'phi3', label: 'Phi3 (3.8B)', contextWindow: 128000, recommended: false },
      { modelId: 'codellama', label: 'Code Llama 7B', contextWindow: 16000, recommended: false },
      { modelId: 'deepseek-coder', label: 'DeepSeek Coder 6.7B', contextWindow: 16000, recommended: false },
    ],
    envVars: ['OLLAMA_BASE_URL', 'OLLAMA_MODEL'],
  },
  {
    providerId: 'openai',
    displayName: 'OpenAI',
    description: 'Industry-standard GPT models. Widely supported and feature-rich.',
    requiresApiKey: true,
    supportsBaseUrl: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/api-keys',
    models: [
      { modelId: 'gpt-4o', label: 'GPT-4o', contextWindow: 128000, recommended: true },
      { modelId: 'gpt-4o-mini', label: 'GPT-4o Mini', contextWindow: 128000, recommended: false },
      { modelId: 'gpt-4-turbo', label: 'GPT-4 Turbo', contextWindow: 128000, recommended: false },
      { modelId: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', contextWindow: 16385, recommended: false },
    ],
    envVars: ['OPENAI_API_KEY'],
  },
  {
    providerId: 'lm-studio',
    displayName: 'LM Studio (Local)',
    description: 'OpenAI-compatible local server. Run any GGUF model privately.',
    requiresApiKey: false,
    supportsBaseUrl: true,
    defaultBaseUrl: 'http://127.0.0.1:1234/v1',
    docsUrl: 'https://lmstudio.ai',
    models: [
      { modelId: 'google/gemma-3-4b', label: 'Gemma 3 4B', contextWindow: 8192, recommended: true },
      { modelId: 'google/gemma-4-12b-qat', label: 'Gemma 4 12B QAT', contextWindow: 8192, recommended: true },
      { modelId: 'nvidia/nemotron-3-nano-4b', label: 'Nemotron 3 Nano 4B', contextWindow: 4096, recommended: false },
      { modelId: 'qwen2.5-coder-7b-instruct', label: 'Qwen 2.5 Coder 7B Instruct', contextWindow: 32768, recommended: false },
      { modelId: 'zai-org/glm-4.6v-flash', label: 'GLM 4.6V Flash', contextWindow: 16384, recommended: false },
      { modelId: 'google/gemma-4-e4b', label: 'Gemma 4 E4B', contextWindow: 8192, recommended: false },
      { modelId: 'text-embedding-nomic-embed-text-v1.5', label: 'Nomic Embed Text v1.5', contextWindow: 8192, recommended: false },
    ],
    envVars: ['LM_STUDIO_BASE_URL', 'LM_STUDIO_MODEL'],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class LlmModelsService {
  private readonly logger = new Logger(LlmModelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmConnectionService: LlmConnectionService,
  ) {}

  // ── 1. List all providers with status derived from Mastra env context ────────

  /**
   * Returns the static provider catalogue enriched with:
   * - `isActiveInMastra`: whether the provider key is currently active in Mastra.
   * - User's saved config (apiKey masked, baseUrl, modelId, isEnabled, etc.)
   * We attempt to fetch active provider info from Mastra's /api/models endpoint
   * (if it exists). On failure we fall back to the static catalogue.
   */
  async getProviders(userId: string) {
    // Attempt to fetch active model info from Mastra
    let mastraModels: any = {};
    try {
      const resp = await fetch(`${MASTRA_BASE_URL}/custom/models`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        mastraModels = await resp.json();
      }
    } catch (err) {
      this.logger.warn(`Mastra /api/models unreachable: ${err.message}. Using static catalogue.`);
    }

    // Fetch user's saved configs from both modelConfig and llmConnection
    const [savedConfigs, llmConnections] = await Promise.all([
      this.prisma.modelConfig.findMany({ where: { userId } }),
      this.prisma.llmConnection.findMany({ where: { userId } }),
    ]);
    const configMap = new Map(savedConfigs.map((c) => [c.providerId, c]));
    const connectionMap = new Map(llmConnections.map((c) => [c.providerId, c]));

    // Auto-discover live local and remote LM Studio models dynamically
    let liveLmStudioModels: any[] = [];
    try {
      const lmsResult = await this.llmConnectionService.fetchLiveModels('lm-studio');
      if (lmsResult?.success && Array.isArray(lmsResult.models) && lmsResult.models.length > 0) {
        liveLmStudioModels = lmsResult.models;
      }
    } catch {
      // ignore
    }

    return PROVIDER_CATALOGUE.map((provider) => {
      const saved = configMap.get(provider.providerId);
      const conn = connectionMap.get(provider.providerId);
      const mastraInfo = mastraModels[provider.providerId] ?? {};

      let models: any[] = [...provider.models];

      if (provider.providerId === 'lm-studio' && liveLmStudioModels.length > 0) {
        models = liveLmStudioModels.map((m: any) => ({
          modelId: m.modelId || m.id,
          label: m.label || m.name || m.modelId || m.id,
          name: m.name || m.displayName,
          device: m.device || m.primaryDevice,
          deviceTag: m.deviceTag,
          devices: m.devices,
          isRemote: m.isRemote ?? false,
          isLoaded: m.isLoaded ?? false,
          params: m.params,
          architecture: m.architecture,
          quantization: m.quantization,
          contextWindow: m.contextWindow || 8192,
          recommended: Boolean(
            m.recommended ||
            (typeof (m.id || m.modelId) === 'string' &&
              ((m.id || m.modelId).includes('gemma-3-4b') || (m.id || m.modelId).includes('gemma-4-12b')))
          ),
        }));
      } else if (conn?.availableModels && Array.isArray(conn.availableModels) && conn.availableModels.length > 0) {
        models = (conn.availableModels as any[]).map((m: any) => ({
          modelId: typeof m === 'string' ? m : m.modelId || m.id,
          label: typeof m === 'string' ? m : m.label || m.name || m.modelId || m.id,
          name: m.name || m.displayName,
          device: m.device || m.primaryDevice,
          deviceTag: m.deviceTag,
          devices: m.devices,
          isRemote: m.isRemote ?? false,
          isLoaded: m.isLoaded ?? false,
          params: m.params,
          contextWindow: m.contextWindow || 8192,
          recommended: Boolean(
            m.recommended ||
            (typeof (m.id || m.modelId) === 'string' &&
              ((m.id || m.modelId).includes('gemma-3-4b') || (m.id || m.modelId).includes('gemma-4-12b')))
          ),
        }));
      }

      const rawKey = conn?.apiKey || saved?.apiKey;
      const baseUrl = conn?.baseUrl || saved?.baseUrl || (provider.providerId === 'lm-studio' ? 'http://127.0.0.1:1234/v1' : undefined);
      const modelId = conn?.modelId || saved?.modelId || models[0]?.modelId;

      return {
        ...provider,
        models,
        // Mastra-reported active status
        isActiveInMastra: mastraInfo.isActive ?? (provider.providerId === 'lm-studio' ? true : false),
        activeModelId: mastraInfo.activeModelId ?? (provider.providerId === 'lm-studio' ? modelId : null),
        // User's saved config
        userConfig: (saved || conn)
          ? {
              hasApiKey: !!rawKey,
              apiKeyMasked: rawKey ? this.maskKey(rawKey) : null,
              baseUrl,
              modelId,
              isEnabled: conn?.isEnabled ?? saved?.isEnabled ?? true,
              isDefault: conn?.isDefault ?? saved?.isDefault ?? false,
              lastTested: conn?.lastTested || saved?.lastTested,
              testStatus: conn?.testStatus || saved?.testStatus,
              latencyMs: conn?.latencyMs,
            }
          : null,
      };
    });
  }

  // ── 2. Get user's saved model configs (raw) ──────────────────────────────────

  async getUserConfigs(userId: string) {
    const [configs, connections] = await Promise.all([
      this.prisma.modelConfig.findMany({ where: { userId } }),
      this.prisma.llmConnection.findMany({ where: { userId } }),
    ]);

    const connMap = new Map(connections.map((c) => [c.providerId, c]));

    // Mask API keys before returning, preferring rich llmConnection data
    return configs.map((c) => {
      const conn = connMap.get(c.providerId);
      const rawKey = conn?.apiKey || c.apiKey;
      return {
        ...c,
        name: conn?.name,
        baseUrl: conn?.baseUrl || c.baseUrl,
        modelId: conn?.modelId || c.modelId,
        availableModels: conn?.availableModels,
        latencyMs: conn?.latencyMs,
        apiKey: rawKey ? this.maskKey(rawKey) : null,
      };
    });
  }

  // ── 3. Save / update a model config ─────────────────────────────────────────

  async saveConfig(userId: string, dto: SaveModelConfigDto) {
    const { providerId, apiKey, baseUrl, modelId, isEnabled, isDefault } = dto;

    // If setting this provider as default, clear default from all others first
    if (isDefault) {
      await this.prisma.modelConfig.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
      await this.prisma.llmConnection.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    // Encode API key (basic base64 obfuscation — upgrade to Vault/KMS in prod)
    const encodedKey = apiKey ? Buffer.from(apiKey).toString('base64') : undefined;
    const defaultUrl = providerId === 'lm-studio' ? (baseUrl || 'http://127.0.0.1:1234/v1') : baseUrl;

    const config = await this.prisma.modelConfig.upsert({
      where: { userId_providerId: { userId, providerId } },
      create: {
        userId,
        providerId,
        apiKey: encodedKey,
        baseUrl: defaultUrl,
        modelId,
        isEnabled,
        isDefault: isDefault ?? false,
      },
      update: {
        ...(encodedKey !== undefined ? { apiKey: encodedKey } : {}),
        ...(defaultUrl !== undefined ? { baseUrl: defaultUrl } : {}),
        ...(modelId !== undefined ? { modelId } : {}),
        isEnabled,
        ...(isDefault !== undefined ? { isDefault } : {}),
      },
    });

    // Also persist to new llmConnection collection
    try {
      await this.prisma.llmConnection.upsert({
        where: { userId_providerId: { userId, providerId } },
        create: {
          userId,
          providerId,
          name: providerId === 'lm-studio' ? 'LM Studio (127.0.0.1:1234)' : undefined,
          apiKey: encodedKey,
          baseUrl: defaultUrl,
          modelId,
          isEnabled,
          isDefault: isDefault ?? false,
        },
        update: {
          ...(encodedKey !== undefined ? { apiKey: encodedKey } : {}),
          ...(defaultUrl !== undefined ? { baseUrl: defaultUrl } : {}),
          ...(modelId !== undefined ? { modelId } : {}),
          isEnabled,
          ...(isDefault !== undefined ? { isDefault } : {}),
        },
      });
    } catch (e) {
      this.logger.warn(`llmConnection sync warning: ${e.message}`);
    }

    return {
      ...config,
      apiKey: config.apiKey ? this.maskKey(Buffer.from(config.apiKey, 'base64').toString()) : null,
    };
  }

  // ── 4. Delete a config ───────────────────────────────────────────────────────

  async deleteConfig(userId: string, providerId: string) {
    const existing = await this.prisma.modelConfig.findUnique({
      where: { userId_providerId: { userId, providerId } },
    });
    if (!existing) {
      throw new NotFoundException(`No config found for provider "${providerId}"`);
    }
    await this.prisma.modelConfig.delete({
      where: { userId_providerId: { userId, providerId } },
    });
    try {
      await this.prisma.llmConnection.delete({
        where: { userId_providerId: { userId, providerId } },
      });
    } catch {
      // ignore
    }
    return { deleted: true, providerId };
  }

  // ── 5. Test connection ───────────────────────────────────────────────────────

  /**
   * Tests a provider connection by forwarding to Mastra's /api/models/test endpoint.
   * If Mastra doesn't have the endpoint, falls back to a lightweight direct ping.
   */
  async testConnection(userId: string, providerId: string, apiKey?: string, baseUrl?: string, modelId?: string) {
    // Try Mastra's test endpoint first
    try {
      const resp = await fetch(`${MASTRA_BASE_URL}/custom/models/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, apiKey, baseUrl, modelId }),
        signal: AbortSignal.timeout(15000),
      });
      if (resp.ok) {
        const result = await resp.json();
        // Update test status in DB
        await this.updateTestStatus(userId, providerId, result.success ? 'ok' : 'error', result.latencyMs);
        return result;
      }
    } catch (err) {
      this.logger.warn(`Mastra /api/models/test failed: ${err.message}. Using fallback ping.`);
    }

    // Fallback: direct provider ping
    const result = await this.directProviderPing(providerId, apiKey, baseUrl, modelId);
    await this.updateTestStatus(userId, providerId, result.success ? 'ok' : 'error', result.latencyMs);
    return result;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async updateTestStatus(userId: string, providerId: string, status: 'ok' | 'error', latencyMs?: number) {
    try {
      await this.prisma.modelConfig.upsert({
        where: { userId_providerId: { userId, providerId } },
        create: {
          userId,
          providerId,
          isEnabled: true,
          isDefault: false,
          testStatus: status,
          lastTested: new Date(),
        },
        update: {
          testStatus: status,
          lastTested: new Date(),
        },
      });

      await this.prisma.llmConnection.upsert({
        where: { userId_providerId: { userId, providerId } },
        create: {
          userId,
          providerId,
          isEnabled: true,
          isDefault: false,
          testStatus: status,
          lastTested: new Date(),
          latencyMs,
        },
        update: {
          testStatus: status,
          lastTested: new Date(),
          latencyMs,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to update test status: ${err.message}`);
    }
  }

  /**
   * Fallback direct provider connectivity check.
   * For API providers: sends a minimal API request.
   * For local providers: checks if the server responds.
   */
  private async directProviderPing(
    providerId: string,
    apiKey?: string,
    baseUrl?: string,
    modelId?: string,
  ): Promise<{ success: boolean; latencyMs: number; message: string; modelId?: string }> {
    const start = Date.now();

    try {
      switch (providerId) {
        case 'groq': {
          const key = apiKey ?? process.env.GROQ_API_KEY;
          if (!key) return { success: false, latencyMs: 0, message: 'No Groq API key configured' };
          const resp = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(10000),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            return { success: false, latencyMs: Date.now() - start, message: err?.error?.message ?? `HTTP ${resp.status}` };
          }
          const data = await resp.json();
          const models = data?.data?.map((m: any) => m.id) ?? [];
          return { success: true, latencyMs: Date.now() - start, message: `Connected. ${models.length} models available.`, modelId: modelId ?? 'llama-3.3-70b-versatile' };
        }

        case 'gemini': {
          const key = apiKey ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
          if (!key || key === 'your-google-api-key') {
            return { success: false, latencyMs: 0, message: 'No Google Gemini API key configured' };
          }
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
            { signal: AbortSignal.timeout(10000) },
          );
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            return { success: false, latencyMs: Date.now() - start, message: err?.error?.message ?? `HTTP ${resp.status}` };
          }
          return { success: true, latencyMs: Date.now() - start, message: 'Connected to Google Gemini API.', modelId: modelId ?? 'google/gemini-2.0-flash' };
        }

        case 'ollama': {
          const ollamaUrl = (baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1').replace('/v1', '');
          const resp = await fetch(`${ollamaUrl}/api/tags`, {
            signal: AbortSignal.timeout(5000),
          });
          if (!resp.ok) {
            return { success: false, latencyMs: Date.now() - start, message: `Ollama server not reachable at ${ollamaUrl}` };
          }
          const data = await resp.json();
          const models = data?.models ?? [];
          return {
            success: true,
            latencyMs: Date.now() - start,
            message: `Ollama running. ${models.length} model(s) pulled.`,
            modelId: modelId ?? models[0]?.name ?? 'llama3.2',
          };
        }

        case 'openai': {
          const key = apiKey ?? process.env.OPENAI_API_KEY;
          if (!key) return { success: false, latencyMs: 0, message: 'No OpenAI API key configured' };
          const base = baseUrl ?? 'https://api.openai.com/v1';
          const resp = await fetch(`${base}/models`, {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(10000),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            return { success: false, latencyMs: Date.now() - start, message: err?.error?.message ?? `HTTP ${resp.status}` };
          }
          return { success: true, latencyMs: Date.now() - start, message: 'Connected to OpenAI API.', modelId: modelId ?? 'gpt-4o' };
        }

        case 'lm-studio': {
          const rawUrl = baseUrl ?? process.env.LM_STUDIO_BASE_URL ?? 'http://127.0.0.1:1234/v1';
          const lmsUrl = rawUrl.replace(/\/+$/, '');
          const modelsUrl = lmsUrl.endsWith('/v1') ? `${lmsUrl}/models` : `${lmsUrl}/v1/models`;
          const chatUrl = lmsUrl.endsWith('/v1') ? `${lmsUrl}/chat/completions` : `${lmsUrl}/v1/chat/completions`;

          const resp = await fetch(modelsUrl, { signal: AbortSignal.timeout(6000) });
          if (!resp.ok) {
            return { success: false, latencyMs: Date.now() - start, message: `LM Studio not reachable at ${modelsUrl}` };
          }
          const data = await resp.json();
          const models = data?.data ?? [];
          const activeModel = modelId ?? models[0]?.id ?? 'google/gemma-3-4b';

          try {
            await fetch(chatUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: activeModel,
                messages: [{ role: 'user', content: 'hi' }],
                max_tokens: 5,
              }),
              signal: AbortSignal.timeout(10000),
            });
          } catch {
            // Models responded, chat completion verification is optional
          }

          return {
            success: true,
            latencyMs: Date.now() - start,
            message: `LM Studio running at ${lmsUrl}. ${models.length} model(s) loaded.`,
            modelId: activeModel,
          };
        }

        default:
          return { success: false, latencyMs: 0, message: `Unknown provider: ${providerId}` };
      }
    } catch (err) {
      return { success: false, latencyMs: Date.now() - start, message: err.message ?? 'Connection failed' };
    }
  }

  private maskKey(key: string): string {
    if (key.length <= 8) return '••••••••';
    return key.slice(0, 4) + '••••••••' + key.slice(-4);
  }
}
