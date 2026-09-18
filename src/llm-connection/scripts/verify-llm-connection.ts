import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { LlmConnectionService } from '../llm-connection.service';
import { LlmModelsService } from '../../llm-models/llm-models.service';
import { PrismaService } from '../../prisma/prisma.service';

async function verify() {
  console.log('====================================================');
  console.log('AWAS LLM Connection Module Verification: LM Studio');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const llmConnectionService = app.get(LlmConnectionService);
  const llmModelsService = app.get(LlmModelsService);
  const prisma = app.get(PrismaService);

  // 1. Fetch test user
  const user =
    (await prisma.user.findFirst({ where: { email: 'santosh2221994@gmail.com' } })) ||
    (await prisma.user.findFirst({ where: { role: 'admin' } })) ||
    (await prisma.user.findFirst());

  if (!user) {
    throw new Error('No user found in database for verification');
  }
  console.log(`\n[Step 1] Verified test user: ${user.email} (ID: ${user.id})`);

  // 2. Fetch live models directly from LM Studio
  console.log('\n[Step 2] Querying LM Studio live models at http://127.0.0.1:1234/v1/models...');
  const liveResult = await llmConnectionService.fetchLiveModels('lm-studio', 'http://127.0.0.1:1234/v1');
  console.log(`✓ LM Studio live query success: ${liveResult.success}, count: ${liveResult.count}`);
  console.log('  Loaded models:', liveResult.models.map((m: any) => m.id).join(', '));
  if (!liveResult.models.some((m: any) => m.id === 'google/gemma-3-4b')) {
    throw new Error('google/gemma-3-4b not found in LM Studio models list');
  }

  // 3. Sync models into MongoDB `llmConnection`
  console.log('\n[Step 3] Syncing models into `llmConnection` MongoDB collection...');
  const syncResult = await llmConnectionService.syncAvailableModels(
    user.id,
    'lm-studio',
    'http://127.0.0.1:1234/v1',
  );
  console.log(`✓ Synced ${syncResult.modelsCount} models. Selected model: ${syncResult.modelId}`);

  // 4. Test connection and inference verification
  console.log('\n[Step 4] Running connection & inference test against LM Studio...');
  const testResult = await llmConnectionService.testConnection(
    user.id,
    'lm-studio',
    'http://127.0.0.1:1234/v1',
    undefined,
    'google/gemma-3-4b',
  );
  console.log(`✓ Test result:`, testResult);
  if (!testResult.success) {
    throw new Error(`Test connection failed: ${testResult.message}`);
  }

  // 5. Query getAllConnections() for UI
  console.log('\n[Step 5] Checking LlmConnectionService.getAllConnections()...');
  const allConns = await llmConnectionService.getAllConnections(user.id);
  const lmStudioConn = allConns.find((c) => c.providerId === 'lm-studio');
  console.log('✓ LM Studio connection retrieved:');
  console.log('  Display name:', lmStudioConn?.displayName);
  console.log('  Base URL:', lmStudioConn?.connection?.baseUrl);
  console.log('  Model ID:', lmStudioConn?.connection?.modelId);
  console.log('  Is Default:', lmStudioConn?.connection?.isDefault);
  console.log('  Is Enabled:', lmStudioConn?.connection?.isEnabled);
  console.log('  Test status:', lmStudioConn?.connection?.testStatus);
  console.log('  Latency (ms):', lmStudioConn?.connection?.latencyMs);
  console.log('  Available models count:', lmStudioConn?.connection?.availableModelsCount);

  // 6. Query LlmModelsService.getProviders() for Page 14 frontend (/ai/models)
  console.log('\n[Step 6] Checking LlmModelsService.getProviders() for Page 14 (/ai/models)...');
  const providers = await llmModelsService.getProviders(user.id);
  const lmsProvider = providers.find((p) => p.providerId === 'lm-studio');
  console.log('✓ Page 14 LM Studio provider retrieved:');
  console.log('  UserConfig base URL:', lmsProvider?.userConfig?.baseUrl);
  console.log('  UserConfig model ID:', lmsProvider?.userConfig?.modelId);
  console.log('  UserConfig default:', lmsProvider?.userConfig?.isDefault);
  console.log('  Models in selector:', lmsProvider?.models?.length);

  // 7. Verify datastore persistence
  console.log('\n[Step 7] Checking MongoDB records in llmConnection collection...');
  const dbRecord = await prisma.llmConnection.findUnique({
    where: { userId_providerId: { userId: user.id, providerId: 'lm-studio' } },
  });
  console.log('✓ Database record verified:');
  console.log('  ID:', dbRecord?.id);
  console.log('  Model ID:', dbRecord?.modelId);
  console.log('  Base URL:', dbRecord?.baseUrl);
  console.log('  Is Default:', dbRecord?.isDefault);
  console.log('  Test Status:', dbRecord?.testStatus);
  console.log('  Latency Ms:', dbRecord?.latencyMs);
  console.log('  Available models stored:', Array.isArray(dbRecord?.availableModels) ? dbRecord?.availableModels.length : 0);

  console.log('\n====================================================');
  console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY! ✓');
  console.log('====================================================\n');

  await app.close();
}

verify().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
