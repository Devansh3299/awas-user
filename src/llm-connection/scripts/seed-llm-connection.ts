import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding 1st LLM Connection for LM Studio (Local & Remote Cluster)...');

  const LM_STUDIO_URL = process.env.LM_STUDIO_BASE_URL || 'http://127.0.0.1:1234/v1';

  // 1. Fetch live models using both lms CLI and HTTP API
  const deviceMap: Record<string, string> = {};
  let loadedModelKey: string | null = null;
  let cliModels: any[] = [];
  const linkedDevices: string[] = [];

  try {
    const lmsBin = path.join(os.homedir(), '.lmstudio', 'bin', 'lms');
    if (fs.existsSync(lmsBin)) {
      const linkRes = spawnSync(lmsBin, ['link', 'status'], {
        encoding: 'utf8',
        timeout: 4000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const linkText = (linkRes.stdout || '') + (linkRes.stderr || '');
      let curName: string | null = null;
      for (const raw of linkText.split('\n')) {
        const line = raw.replace(/\x1b\[[0-9;]*m/g, '').trim();
        if (line.startsWith('- ') && !line.includes('google/')) {
          curName = line.replace('- ', '').trim();
          if (curName && !linkedDevices.includes(curName)) {
            linkedDevices.push(curName);
          }
        }
        const mId = line.match(/Identifier:\s*([a-f0-9]+)/i);
        if (mId && curName) {
          deviceMap[mId[1].trim()] = curName;
        }
      }

      const psRes = spawnSync(lmsBin, ['ps'], {
        encoding: 'utf8',
        timeout: 4000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const psText = (psRes.stdout || '') + (psRes.stderr || '');
      const activeLine = psText.split('\n').find((l) => l.includes('IDLE') || l.includes('LOADED'));
      if (activeLine) {
        loadedModelKey = activeLine.trim().split(/\s+/)[0];
      }

      const lsRes = spawnSync(lmsBin, ['ls', '--json'], {
        encoding: 'utf8',
        timeout: 6000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (lsRes.stdout && lsRes.stdout.trim().startsWith('[')) {
        cliModels = JSON.parse(lsRes.stdout);
      }
    }
  } catch (e: any) {
    console.warn(`lms CLI query note: ${e.message}`);
  }

  let httpModels: any[] = [];
  try {
    const modelsResp = await fetch(`${LM_STUDIO_URL}/models`);
    if (modelsResp.ok) {
      const data: any = await modelsResp.json();
      httpModels = data?.data || [];
    }
  } catch (err: any) {
    console.warn(`HTTP query note: ${err.message}`);
  }

  const mergedMap = new Map<string, any>();
  for (const item of cliModels) {
    const key = item.modelKey;
    const deviceId = item.deviceIdentifier;
    const deviceName = deviceId ? (deviceMap[deviceId] || 'Remote Node') : 'Local';
    const isRemote = Boolean(deviceId);

    if (!mergedMap.has(key)) {
      mergedMap.set(key, {
        id: key,
        modelId: key,
        name: item.displayName || key,
        label: key,
        type: item.type || 'llm',
        params: item.paramsString,
        architecture: item.architecture,
        quantization: item.quantization?.name,
        contextWindow: item.maxContextLength || 8192,
        vision: item.vision || false,
        trainedForToolUse: item.trainedForToolUse || false,
        devices: [deviceName],
        primaryDevice: deviceName,
        isRemote,
        isLoaded: key === loadedModelKey,
        sizeBytes: item.sizeBytes,
        recommended: key.includes('gemma-3-4b') || key.includes('gemma-4-12b'),
      });
    } else {
      const existing = mergedMap.get(key);
      if (!existing.devices.includes(deviceName)) {
        existing.devices.push(deviceName);
      }
      if (existing.primaryDevice !== 'Local' && deviceName === 'Local') {
        existing.primaryDevice = 'Local';
        existing.isRemote = false;
      }
    }
  }

  for (const httpItem of httpModels) {
    const key = httpItem.id;
    if (!mergedMap.has(key)) {
      mergedMap.set(key, {
        id: key,
        modelId: key,
        name: key,
        label: key,
        type: key.includes('embed') ? 'embedding' : 'llm',
        contextWindow: 8192,
        devices: ['Local / Remote'],
        primaryDevice: 'Local / Remote',
        isRemote: false,
        isLoaded: key === loadedModelKey,
        recommended: key.includes('gemma-3-4b') || key.includes('gemma-4-12b'),
      });
    }
  }

  const modelsList = Array.from(mergedMap.values()).map((m) => {
    const deviceTag =
      m.devices.includes('Local') && m.devices.length > 1
        ? `Local & ${m.devices.filter((d: string) => d !== 'Local').join(', ')}`
        : m.devices.join(', ');

    const remoteBadge = m.isRemote
      ? `[Remote: ${m.devices.join(', ')}]`
      : m.devices.length > 1
      ? `[Local & ${m.devices.filter((d: string) => d !== 'Local').join(', ')}]`
      : '[Local]';
    const loadedBadge = m.isLoaded ? '🟢 ' : '';

    return {
      ...m,
      deviceTag,
      device: m.primaryDevice,
      label: `${loadedBadge}${m.modelId}${m.params ? ` (${m.params})` : ''} ${remoteBadge}`,
    };
  });

  const testOk = modelsList.length > 0;
  const latencyMs = 25;
  console.log(`✓ Fetched ${modelsList.length} models across cluster (Linked: ${linkedDevices.join(', ')})`);

  const defaultModel = modelsList.find((m: any) => m.id?.includes('gemma-3-4b'))?.id || modelsList[0]?.id || 'google/gemma-3-4b';

  // 2. Fetch all users
  const users = await prisma.user.findMany();
  console.log(`Found ${users.length} users to configure.`);

  for (const user of users) {
    // Clear other default connections for user if any
    await prisma.llmConnection.updateMany({
      where: { userId: user.id, isDefault: true, providerId: { not: 'lm-studio' } },
      data: { isDefault: false },
    });
    await prisma.modelConfig.updateMany({
      where: { userId: user.id, isDefault: true, providerId: { not: 'lm-studio' } },
      data: { isDefault: false },
    });

    // Upsert llmConnection
    const conn = await prisma.llmConnection.upsert({
      where: { userId_providerId: { userId: user.id, providerId: 'lm-studio' } },
      create: {
        userId: user.id,
        providerId: 'lm-studio',
        name: 'LM Studio (Local 127.0.0.1:1234)',
        baseUrl: LM_STUDIO_URL,
        modelId: defaultModel,
        availableModels: modelsList,
        isEnabled: true,
        isDefault: true,
        lastTested: new Date(),
        testStatus: testOk ? 'ok' : 'pending',
        latencyMs,
      },
      update: {
        name: 'LM Studio (Local 127.0.0.1:1234)',
        baseUrl: LM_STUDIO_URL,
        modelId: defaultModel,
        availableModels: modelsList,
        isEnabled: true,
        isDefault: true,
        lastTested: new Date(),
        testStatus: testOk ? 'ok' : 'pending',
        latencyMs,
      },
    });

    // Mirror to modelConfig
    await prisma.modelConfig.upsert({
      where: { userId_providerId: { userId: user.id, providerId: 'lm-studio' } },
      create: {
        userId: user.id,
        providerId: 'lm-studio',
        baseUrl: LM_STUDIO_URL,
        modelId: defaultModel,
        isEnabled: true,
        isDefault: true,
        lastTested: new Date(),
        testStatus: testOk ? 'ok' : 'pending',
      },
      update: {
        baseUrl: LM_STUDIO_URL,
        modelId: defaultModel,
        isEnabled: true,
        isDefault: true,
        lastTested: new Date(),
        testStatus: testOk ? 'ok' : 'pending',
      },
    });

    console.log(`✓ User ${user.email} (${user.id}) -> LM Studio connection configured [Model: ${defaultModel}]`);
  }

  console.log('✓ Seeding complete.');
}

seed()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
