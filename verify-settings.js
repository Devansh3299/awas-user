const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log('--- Starting Settings Module Verification ---');

  const email = `settings_user_${Date.now()}@awas.ai`;
  const password = 'password123';

  // 1. Signup test user
  const signupRes = await fetch(`${BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role: 'user' }),
  });

  // Login to get JWT
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (loginRes.status !== 201) {
    throw new Error(`Login failed with status ${loginRes.status}: ${await loginRes.text()}`);
  }
  const { access_token: token, user } = await loginRes.json();
  console.log(`✅ Authenticated user: ${user.email}`);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 2. Test GET /settings (initial state + default generation)
  const getRes = await fetch(`${BASE_URL}/settings`, {
    method: 'GET',
    headers: authHeaders,
  });
  if (getRes.status !== 200) {
    throw new Error(`GET /settings failed: ${getRes.status} ${await getRes.text()}`);
  }
  const initialSettings = await getRes.json();
  console.log('✅ GET /settings successful. Profile:', initialSettings.profile.name);
  console.log('  Notifications:', initialSettings.notifications);
  console.log('  Appearance:', initialSettings.appearance);
  console.log('  Region:', initialSettings.region);

  // 3. Test PATCH /settings/profile
  const updateProfileRes = await fetch(`${BASE_URL}/settings/profile`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Alex Johnson (Verified)',
      jobTitle: 'Lead AI Engineer',
      bio: 'Building autonomous agent workflows with AWAS & Mastra.',
    }),
  });
  if (updateProfileRes.status !== 200) {
    throw new Error(`PATCH /settings/profile failed: ${await updateProfileRes.text()}`);
  }
  const updatedProfile = await updateProfileRes.json();
  console.log('✅ PATCH /settings/profile succeeded:', updatedProfile.name, '|', updatedProfile.jobTitle);

  // 4. Test PATCH /settings/organization
  const updateOrgRes = await fetch(`${BASE_URL}/settings/organization`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Acme Robotics Corp',
      slug: 'acme-robotics',
      website: 'https://acme-robotics.ai',
      industry: 'Artificial Intelligence & Robotics',
    }),
  });
  if (updateOrgRes.status !== 200) {
    throw new Error(`PATCH /settings/organization failed: ${await updateOrgRes.text()}`);
  }
  const updatedOrg = await updateOrgRes.json();
  console.log('✅ PATCH /settings/organization succeeded:', updatedOrg.name, '|', updatedOrg.slug);

  // 5. Test PATCH /settings/notifications
  const updateNotifRes = await fetch(`${BASE_URL}/settings/notifications`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({
      automationFailures: true,
      weeklyDigest: false,
      agentErrorAlerts: true,
      billingReminders: true,
      newFeatures: true,
      teamActivity: false,
    }),
  });
  if (updateNotifRes.status !== 200) {
    throw new Error(`PATCH /settings/notifications failed: ${await updateNotifRes.text()}`);
  }
  const updatedNotifs = await updateNotifRes.json();
  console.log('✅ PATCH /settings/notifications succeeded:', updatedNotifs);

  // 6. Test PATCH /settings/appearance
  const updateAppearanceRes = await fetch(`${BASE_URL}/settings/appearance`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({
      theme: 'Dark',
      sidebarDefault: 'Collapsed',
    }),
  });
  if (updateAppearanceRes.status !== 200) {
    throw new Error(`PATCH /settings/appearance failed: ${await updateAppearanceRes.text()}`);
  }
  const updatedAppearance = await updateAppearanceRes.json();
  console.log('✅ PATCH /settings/appearance succeeded:', updatedAppearance);

  // 7. Test PATCH /settings/region
  const updateRegionRes = await fetch(`${BASE_URL}/settings/region`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({
      timezone: 'UTC-05:00 – Eastern Time (US & Canada)',
      language: 'English (US)',
      dateFormat: 'YYYY-MM-DD',
    }),
  });
  if (updateRegionRes.status !== 200) {
    throw new Error(`PATCH /settings/region failed: ${await updateRegionRes.text()}`);
  }
  const updatedRegion = await updateRegionRes.json();
  console.log('✅ PATCH /settings/region succeeded:', updatedRegion);

  // 8. Test 2FA Toggle
  const toggle2faRes = await fetch(`${BASE_URL}/settings/security/2fa/toggle`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ enabled: true }),
  });
  if (toggle2faRes.status !== 201) {
    throw new Error(`POST /settings/security/2fa/toggle failed: ${await toggle2faRes.text()}`);
  }
  const twoFaState = await toggle2faRes.json();
  console.log('✅ POST /settings/security/2fa/toggle succeeded:', twoFaState);

  // 9. Test Create API Token
  const createTokenRes = await fetch(`${BASE_URL}/settings/security/tokens`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'CI/CD Automation Key',
      expiresInDays: 30,
    }),
  });
  if (createTokenRes.status !== 201) {
    throw new Error(`POST /settings/security/tokens failed: ${await createTokenRes.text()}`);
  }
  const createdToken = await createTokenRes.json();
  console.log('✅ POST /settings/security/tokens created:', createdToken.name, 'Token:', createdToken.token);

  // 10. Test List API Tokens
  const listTokensRes = await fetch(`${BASE_URL}/settings/security/tokens`, {
    method: 'GET',
    headers: authHeaders,
  });
  if (listTokensRes.status !== 200) {
    throw new Error(`GET /settings/security/tokens failed: ${await listTokensRes.text()}`);
  }
  const tokens = await listTokensRes.json();
  console.log(`✅ GET /settings/security/tokens returned ${tokens.length} token(s). First: ${tokens[0]?.tokenPrefix}`);

  // 11. Test Password Change
  const wrongPasswordRes = await fetch(`${BASE_URL}/settings/security/password`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      currentPassword: 'wrong_password_123',
      newPassword: 'new_password_456',
    }),
  });
  if (wrongPasswordRes.status !== 400) {
    throw new Error(`Expected status 400 on wrong current password, got ${wrongPasswordRes.status}`);
  }
  console.log('✅ Rejected incorrect current password properly');

  const validPasswordRes = await fetch(`${BASE_URL}/settings/security/password`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      currentPassword: password,
      newPassword: 'new_password_456',
    }),
  });
  if (validPasswordRes.status !== 201) {
    throw new Error(`Valid password change failed: ${await validPasswordRes.text()}`);
  }
  console.log('✅ POST /settings/security/password updated password successfully');

  // Test Revoke API Token
  const deleteTokenRes = await fetch(`${BASE_URL}/settings/security/tokens/${createdToken.id}`, {
    method: 'DELETE',
    headers: authHeaders,
  });
  if (deleteTokenRes.status !== 200) {
    throw new Error(`DELETE /settings/security/tokens failed: ${await deleteTokenRes.text()}`);
  }
  console.log('✅ DELETE /settings/security/tokens/:id succeeded');

  // 12. Test Verify Final Settings Aggregation
  const finalGetRes = await fetch(`${BASE_URL}/settings`, {
    method: 'GET',
    headers: authHeaders,
  });
  const finalSettings = await finalGetRes.json();
  console.log('✅ Final aggregated settings retrieved successfully from MongoDB Atlas:');
  console.log(JSON.stringify(finalSettings, null, 2));

  console.log('--- ALL SETTINGS TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch(err => {
  console.error('❌ Settings verification test failed:', err);
  process.exit(1);
});
