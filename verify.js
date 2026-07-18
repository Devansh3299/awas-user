const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log('--- Starting verification tests ---');

  // Test Signup
  const signupResponse = await fetch(`${BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'password123',
      role: 'admin'
    })
  });
  
  if (signupResponse.status === 201 || signupResponse.status === 409) {
    console.log('✅ Signup endpoint working (or user already registered)');
  } else {
    throw new Error(`Signup failed with status ${signupResponse.status}: ${await signupResponse.text()}`);
  }

  // Test Login
  const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'password123'
    })
  });

  if (loginResponse.status !== 201) {
    throw new Error(`Login failed with status ${loginResponse.status}: ${await loginResponse.text()}`);
  }
  
  const loginData = await loginResponse.json();
  const token = loginData.access_token;
  console.log('✅ Login succeeded, JWT token retrieved.');

  // Test Get Profile
  const profileResponse = await fetch(`${BASE_URL}/auth/profile`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (profileResponse.status !== 200) {
    throw new Error(`Profile fetching failed: ${profileResponse.status}`);
  }
  const profile = await profileResponse.json();
  console.log(`✅ Profile fetched for user: ${profile.email}`);

  // Test Create Agent
  const createAgentResponse = await fetch(`${BASE_URL}/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      name: 'Weather Agent',
      description: 'Fetches local weather metrics.',
      version: '1.0.0',
      schema: {
        location: 'string',
        units: 'metric | imperial'
      }
    })
  });

  if (createAgentResponse.status !== 201) {
    throw new Error(`Create Agent failed: ${await createAgentResponse.text()}`);
  }
  const createdAgent = await createAgentResponse.json();
  console.log(`✅ Agent created successfully. ID: ${createdAgent.id}`);
  console.log('Created Agent Schema:', createdAgent.schema);

  // Test List Agents
  const listAgentsResponse = await fetch(`${BASE_URL}/agents`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (listAgentsResponse.status !== 200) {
    throw new Error(`List Agents failed: ${listAgentsResponse.status}`);
  }
  const agents = await listAgentsResponse.json();
  console.log(`✅ List agents count: ${agents.length}`);

  // Test Find One Agent
  const findOneResponse = await fetch(`${BASE_URL}/agents/${createdAgent.id}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (findOneResponse.status !== 200) {
    throw new Error(`Find Agent by ID failed: ${findOneResponse.status}`);
  }
  const fetchedAgent = await findOneResponse.json();
  console.log(`✅ Fetched single agent name: ${fetchedAgent.name}`);

  // Test Update Agent
  const updateAgentResponse = await fetch(`${BASE_URL}/agents/${createdAgent.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      description: 'Updated weather metrics description.',
      schema: {
        location: 'string',
        units: 'metric | imperial',
        forecastDays: 'number'
      }
    })
  });
  if (updateAgentResponse.status !== 200) {
    throw new Error(`Update Agent failed: ${await updateAgentResponse.text()}`);
  }
  const updatedAgent = await updateAgentResponse.json();
  console.log(`✅ Updated agent description: ${updatedAgent.description}`);
  console.log('Updated Agent Schema:', updatedAgent.schema);

  // Test Delete Agent
  const deleteAgentResponse = await fetch(`${BASE_URL}/agents/${createdAgent.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (deleteAgentResponse.status !== 200) {
    throw new Error(`Delete Agent failed: ${deleteAgentResponse.status}`);
  }
  console.log('✅ Agent deleted successfully.');

  console.log('--- Verification complete, all tests passed! ---');
}

runTests().catch(err => {
  console.error('❌ Verification test failed:', err);
  process.exit(1);
});
