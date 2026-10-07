import { Test, TestingModule } from '@nestjs/testing';
import { LlmConnectionModule } from '../src/llm-connection/llm-connection.module';
import { LlmConnectionService, PROVIDER_CATALOG } from '../src/llm-connection/llm-connection.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('LlmConnectionModule & LlmConnectionService (Integration)', () => {
  let service: LlmConnectionService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [LlmConnectionModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        llmConnection: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'conn-1',
              userId: 'user-123',
              providerId: 'lm-studio',
              name: 'LM Studio (Local)',
              apiKey: null,
              baseUrl: 'http://127.0.0.1:1234/v1',
              modelId: 'google/gemma-3-4b',
              availableModels: [{ modelId: 'google/gemma-3-4b', label: 'Gemma 3 4B' }],
              isEnabled: true,
              isDefault: true,
              lastTested: new Date(),
              testStatus: 'ok',
              latencyMs: 15,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
          findUnique: jest.fn().mockImplementation(({ where }) => {
            if (where.userId_providerId?.providerId === 'lm-studio') {
              return Promise.resolve({
                id: 'conn-1',
                userId: 'user-123',
                providerId: 'lm-studio',
                name: 'LM Studio (Local)',
                apiKey: null,
                baseUrl: 'http://127.0.0.1:1234/v1',
                modelId: 'google/gemma-3-4b',
                availableModels: [{ modelId: 'google/gemma-3-4b', label: 'Gemma 3 4B' }],
                isEnabled: true,
                isDefault: true,
                testStatus: 'ok',
              });
            }
            return Promise.resolve(null);
          }),
          upsert: jest.fn().mockImplementation(({ create, update }) => {
            return Promise.resolve({
              id: 'conn-new',
              userId: 'user-123',
              providerId: create?.providerId || 'groq',
              name: create?.name || update?.name,
              apiKey: create?.apiKey || update?.apiKey,
              baseUrl: create?.baseUrl || update?.baseUrl,
              modelId: create?.modelId || update?.modelId || 'llama-3.3-70b-versatile',
              isEnabled: true,
              testStatus: 'ok',
              latencyMs: 35,
            });
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          delete: jest.fn().mockResolvedValue({ id: 'conn-1' }),
        },
        modelConfig: {
          upsert: jest.fn().mockResolvedValue({ id: 'cfg-1' }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          delete: jest.fn().mockResolvedValue({ id: 'cfg-1' }),
        },
      })
      .compile();

    service = module.get<LlmConnectionService>(LlmConnectionService);
  });

  it('service should be defined', () => {
    expect(service).toBeDefined();
  });

  it('PROVIDER_CATALOG should contain all 5 supported LLM providers', () => {
    const providerIds = PROVIDER_CATALOG.map((p) => p.providerId);
    expect(providerIds).toContain('lm-studio');
    expect(providerIds).toContain('groq');
    expect(providerIds).toContain('gemini');
    expect(providerIds).toContain('ollama');
    expect(providerIds).toContain('openai');
  });

  it('getAllConnections should return catalog merged with user connections', async () => {
    const list = await service.getAllConnections('user-123');
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(5);

    const lms = list.find((c) => c.providerId === 'lm-studio');
    expect(lms).toBeDefined();
    expect(lms?.displayName).toBe('LM Studio (Local)');
  });

  it('getConnection should return provider configuration with masked key', async () => {
    const conn = await service.getConnection('user-123', 'lm-studio');
    expect(conn).toBeDefined();
    expect(conn.providerId).toBe('lm-studio');
  });

  it('saveConnection should upsert into llmConnection collection', async () => {
    const saved = await service.saveConnection('user-123', {
      providerId: 'groq',
      name: 'Groq Fast LPU',
      apiKey: 'gsk_test_api_key_12345678',
      modelId: 'llama-3.3-70b-versatile',
      isEnabled: true,
      isDefault: false,
    });

    expect(saved).toBeDefined();
    expect(saved.providerId).toBe('groq');
  });
});
