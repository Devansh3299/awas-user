import { normalizeAgentExecutionBody } from './ai-proxy.service';

describe('normalizeAgentExecutionBody', () => {
  it('maps legacy top-level threadId/resourceId into memory before forwarding to Mastra', () => {
    const payload = {
      messages: [{ role: 'user', content: 'hello' }],
      threadId: 'legacy-thread-1',
      resourceId: 'legacy-resource-1',
    };

    const normalized = normalizeAgentExecutionBody(payload);

    expect(normalized).toEqual({
      messages: [{ role: 'user', content: 'hello' }],
      memory: {
        thread: 'legacy-thread-1',
        resource: 'legacy-resource-1',
      },
    });
  });

  it('keeps existing memory shape and falls back to default-user when only thread is present', () => {
    const payload = {
      messages: [{ role: 'user', content: 'hello' }],
      memory: {
        thread: 'mem-thread-1',
      },
    };

    const normalized = normalizeAgentExecutionBody(payload);

    expect(normalized).toEqual({
      messages: [{ role: 'user', content: 'hello' }],
      memory: {
        thread: 'mem-thread-1',
        resource: 'default-user',
      },
    });
  });
});
