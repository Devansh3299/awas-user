import { Test, TestingModule } from '@nestjs/testing';
import { ToolsModule } from '../src/tools/tools.module';
import { ToolsService } from '../src/tools/tools.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokensService } from '../src/tokens/tokens.service';

describe('ToolsModule & ToolsService (Unit & Integration)', () => {
  let service: ToolsService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ToolsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        toolConnection: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'test-id-1',
              userId: 'user-123',
              toolId: 'github',
              name: 'GitHub',
              type: 'Agent App',
              token: Buffer.from('ghp_test_token_12345678').toString('base64'),
              status: 'Configured',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
          findFirst: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockImplementation(({ create, update }) => ({
            id: 'test-id-1',
            toolId: create?.toolId || 'github',
            status: create?.status || update?.status || 'Configured',
            updatedAt: new Date(),
          })),
          delete: jest.fn().mockResolvedValue({ id: 'test-id-1' }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      })
      .overrideProvider(TokensService)
      .useValue({
        hasSufficientBalance: jest.fn().mockResolvedValue(true),
        deductTokens: jest.fn().mockResolvedValue(true),
      })
      .compile();

    service = module.get<ToolsService>(ToolsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('listTools() should return registered tools catalogue', async () => {
    const tools = await service.listTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThanOrEqual(10);

    const weather = tools.find((t) => t.id === 'get-weather');
    expect(weather).toBeDefined();
    expect(weather?.category).toBe('Weather');
    expect(weather?.parameters).toBeDefined();
    expect(weather?.parameters.length).toBeGreaterThan(0);
  });

  it('listTools() should filter by category', async () => {
    const dbTools = await service.listTools('Database');
    expect(Array.isArray(dbTools)).toBe(true);
    expect(dbTools.length).toBeGreaterThan(0);
    dbTools.forEach((t) => expect(t.category).toBe('Database'));
  });

  it('getToolById() should return detailed tool metadata', async () => {
    const calc = await service.getToolById('calculator_with_ui');
    expect(calc).toBeDefined();
    expect(calc.id).toBe('calculator_with_ui');
    expect(calc.sampleInput).toBeDefined();
    expect(calc.parameters.some((p) => p.name === 'num1')).toBe(true);
  });

  it('listConnections() should return user connections with masked tokens', async () => {
    const connections = await service.listConnections('user-123');
    expect(Array.isArray(connections)).toBe(true);
    expect(connections.length).toBe(1);
    expect(connections[0].id).toBe('github');
    expect(connections[0].hasToken).toBe(true);
    expect(connections[0].tokenMasked).toContain('••••');
  });

  it('saveConnection() should persist credentials', async () => {
    const result = await service.saveConnection('user-123', 'slack', {
      name: 'Slack',
      token: 'xoxb-1234567890-test',
    });
    expect(result.success).toBe(true);
    expect(result.connection.id).toBe('slack');
  });

  it('testConnection() should test connectivity and return latency', async () => {
    const result = await service.testConnection('user-123', 'github', {
      token: 'ghp_valid_test_token',
    });
    expect(result.success).toBe(true);
    expect(result.status).toBe('Active');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
