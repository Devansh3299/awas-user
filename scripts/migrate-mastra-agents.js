#!/usr/bin/env node
/**
 * Idempotent migration script:
 * Syncs all existing platform-owned Mastra agents into AWAS MongoDB (`awas.Agent`),
 * assigning ownership to:
 *   - User _id:         ObjectId("6a631d60ee62e39cbc608503") (santosh2221994@gmail.com)
 *   - Organization _id: ObjectId("6aae71357e9b524d13eab09c")
 * Preserves existing published status (from legacy marketplaceItem) and installations (from marketplaceInstall).
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const TARGET_OWNER_ID = '6a631d60ee62e39cbc608503';
const TARGET_ORG_ID = '6aae71357e9b524d13eab09c';
const MASTRA_BASE_URL = (
  process.env.MASTRA_BASE_URL ||
  process.env.MASTRA_API_URL ||
  'http://127.0.0.1:4111'
).replace(/\/+$/, '');

const HIDDEN_SYSTEM_IDS = new Set([
  'agent-builder-agent',
  'studio-chat-agent',
  'agent-builder',
  'studio-chat',
]);

function isEphemeralOrWorkflow(agent) {
  const idStr = String(agent?.id || '').trim().toLowerCase();
  if (!idStr || HIDDEN_SYSTEM_IDS.has(idStr)) return true;
  return (
    agent.isWorkflowAgent === true ||
    agent.metadata?.isWorkflowAgent === true ||
    idStr.startsWith('wf-') ||
    idStr.startsWith('custom-wf-') ||
    /^custom-(?:agent-)?\d{10,}(?:-\d+)?$/i.test(idStr)
  );
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { id: TARGET_OWNER_ID },
    select: { id: true, name: true, email: true, organizationId: true },
  });
  if (!user) {
    throw new Error(`Target user ${TARGET_OWNER_ID} not found in AWAS DB`);
  }

  const org = await prisma.organization.findUnique({
    where: { id: TARGET_ORG_ID },
    select: { id: true, name: true },
  });
  if (!org) {
    throw new Error(`Target organization ${TARGET_ORG_ID} not found in AWAS DB`);
  }

  const ownerInfo = {
    name: user.name || user.email.split('@')[0],
    email: user.email,
  };

  console.log(`Target owner: ${ownerInfo.name} <${ownerInfo.email}> (${user.id})`);
  console.log(`Target org:   ${org.name} (${org.id})`);

  // Fetch live Mastra agents + stored agents
  const [agentsRes, storedRes] = await Promise.all([
    fetch(`${MASTRA_BASE_URL}/api/agents`, { headers: { 'Content-Type': 'application/json' } }),
    fetch(`${MASTRA_BASE_URL}/api/stored/agents?perPage=200`, {
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => null),
  ]);

  if (!agentsRes.ok) {
    throw new Error(`Failed to fetch Mastra /api/agents: HTTP ${agentsRes.status}`);
  }

  const rawAgents = await agentsRes.json();
  const runtimeList = Array.isArray(rawAgents)
    ? rawAgents
    : Object.entries(rawAgents ?? {}).map(([key, val]) => ({
        id: val?.id || key,
        ...(val ?? {}),
      }));

  const storedMap = new Map();
  if (storedRes && storedRes.ok) {
    const storedJson = await storedRes.json().catch(() => ({}));
    for (const sa of Array.isArray(storedJson?.agents) ? storedJson.agents : []) {
      if (sa?.id) storedMap.set(sa.id, sa);
    }
  }

  // Load any legacy published agent listings from marketplaceItem to preserve published state
  const legacyPublished = await prisma.marketplaceItem.findMany({
    where: { type: 'agent', isPublished: true },
  });
  const legacyPublishedMap = new Map();
  for (const item of legacyPublished) {
    legacyPublishedMap.set(item.itemId, item);
  }

  // Load any legacy installs from marketplaceInstall raw collection to preserve installer history
  let legacyInstallsByItem = new Map();
  try {
    const rawInstalls = await prisma.$runCommandRaw({
      find: 'marketplaceInstall',
      filter: { itemType: 'agent' },
    });
    const docs = rawInstalls?.cursor?.firstBatch || [];
    for (const doc of docs) {
      const uid = doc.userId?.$oid || String(doc.userId || '');
      if (!uid || !doc.itemId) continue;
      const installer = await prisma.user
        .findUnique({ where: { id: uid }, select: { id: true, name: true, email: true } })
        .catch(() => null);
      if (!installer) continue;
      const list = legacyInstallsByItem.get(doc.itemId) || [];
      if (!list.some((e) => e.userId === installer.id)) {
        list.push({
          userId: installer.id,
          userName: installer.name || installer.email.split('@')[0],
          userEmail: installer.email,
          installedAt: doc.installedAt?.$date ? new Date(doc.installedAt.$date) : new Date(),
        });
        legacyInstallsByItem.set(doc.itemId, list);
      }
    }
  } catch (err) {
    console.warn('Note reading legacy marketplaceInstall:', err.message);
  }

  const eligibleAgents = runtimeList.filter((a) => !isEphemeralOrWorkflow(a));
  console.log(`Found ${eligibleAgents.length} Mastra platform agents to migrate.`);

  let createdCount = 0;
  let updatedCount = 0;

  for (const rt of eligibleAgents) {
    const mastraAgentId = String(rt.id).trim();
    const stored = storedMap.get(mastraAgentId);
    const legacyPub = legacyPublishedMap.get(mastraAgentId);
    const legacyInstalls = legacyInstallsByItem.get(mastraAgentId) || [];

    const toolsArr = rt.tools && typeof rt.tools === 'object'
      ? Object.values(rt.tools).map((t) => ({
          id: t?.id || t?.name || String(t),
          name: t?.name || t?.id || String(t),
          description: t?.description || '',
        }))
      : [];

    const modelId =
      rt.modelId ||
      (stored?.model && !Array.isArray(stored.model) ? stored.model.name || stored.model.modelId : null) ||
      'google/gemma-4-12b-qat';
    const provider =
      rt.provider ||
      (stored?.model && !Array.isArray(stored.model) ? stored.model.provider : null) ||
      'lm-studio';

    const schemaPayload = {
      instructions: rt.instructions || rt.initialInstructions || '',
      systemPrompt: rt.instructions || rt.initialInstructions || '',
      modelId,
      provider,
      tools: toolsArr,
      workflowsCount: rt.workflows ? Object.keys(rt.workflows).length : 0,
      subagentsCount: rt.agents ? Object.keys(rt.agents).length : 0,
      source: 'mastra',
    };

    const existing = await prisma.agent.findUnique({ where: { mastraAgentId } });
    const isPublished = Boolean(existing?.isPublished || legacyPub?.isPublished);
    const publishedAt =
      existing?.publishedAt || (legacyPub ? legacyPub.createdAt : isPublished ? new Date() : null);
    const lastPublishedAt =
      existing?.lastPublishedAt || (legacyPub ? legacyPub.updatedAt : isPublished ? new Date() : null);

    // Merge installedBy without duplicates
    const existingInstalls = Array.isArray(existing?.installedBy) ? existing.installedBy : [];
    const mergedInstalls = [...existingInstalls];
    for (const inst of legacyInstalls) {
      if (!mergedInstalls.some((e) => String(e.userId) === String(inst.userId))) {
        mergedInstalls.push(inst);
      }
    }

    if (existing) {
      await prisma.agent.update({
        where: { id: existing.id },
        data: {
          name: rt.name || existing.name,
          description: rt.description || existing.description || '',
          category: legacyPub?.category || existing.category || provider || 'Assistant',
          price: legacyPub?.price || existing.price || 'Free',
          tags: legacyPub?.tags?.length ? legacyPub.tags : existing.tags,
          schema: schemaPayload,
          ownerId: TARGET_OWNER_ID,
          organizationId: TARGET_ORG_ID,
          owner: ownerInfo,
          isPublished,
          publishedAt,
          lastPublishedAt,
          installedBy: { set: mergedInstalls },
          source: 'mastra',
        },
      });
      updatedCount++;
    } else {
      await prisma.agent.create({
        data: {
          mastraAgentId,
          name: rt.name || mastraAgentId,
          description: rt.description || '',
          category: legacyPub?.category || provider || 'Assistant',
          price: legacyPub?.price || 'Free',
          rating: legacyPub?.rating || '5.0',
          tags: legacyPub?.tags || [],
          version: '1.0.0',
          schema: schemaPayload,
          ownerId: TARGET_OWNER_ID,
          organizationId: TARGET_ORG_ID,
          owner: ownerInfo,
          isPublished,
          publishedAt,
          lastPublishedAt,
          installedBy: mergedInstalls,
          source: 'mastra',
        },
      });
      createdCount++;
    }
  }

  // Remove migrated agent duplicates from legacy marketplaceItem (keep workflows untouched)
  const migratedIds = eligibleAgents.map((a) => String(a.id).trim());
  const cleanedLegacy = await prisma.marketplaceItem.deleteMany({
    where: { type: 'agent', itemId: { in: migratedIds } },
  });

  console.log(
    `Migration complete: created=${createdCount}, updated=${updatedCount}, legacyMarketplaceAgentDuplicatesRemoved=${cleanedLegacy.count}`,
  );
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
