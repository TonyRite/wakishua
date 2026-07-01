import { query } from './db.js';
import WebSocket from 'ws';

async function testWebSocketMatching() {
  console.log('--- STARTING WAKISHUA REAL-TIME MATCH INTEGRATION TEST ---');
  
  // 1. Boot up backend server instance dynamically on port 3005 for testing
  // to avoid port conflict with any running servers
  process.env.PORT = '3005';
  process.env.JWT_SECRET = 'test-secret';
  
  const { default: server } = await import('./server.js');
  
  // Wait for database connections to open and server to listen
  await new Promise(resolve => setTimeout(resolve, 2000));

  let providerSocket = null;
  let customerSocket = null;
  let receivedAlert = false;
  let receivedInterest = false;

  try {
    // 2. Log in Mock Customer Tony Wakishua via REST
    const custLoginRes = await fetch('http://localhost:3005/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+255700000001', password: 'password' })
    });
    
    const custLogin = await custLoginRes.json();
    console.log('- Customer login status:', custLogin.success ? 'SUCCESS' : 'FAILED');
    
    // Parse cookie token
    const custCookies = custLoginRes.headers.get('set-cookie');
    const custToken = custCookies ? custCookies.split('token=')[1].split(';')[0] : '';
    
    // 3. Log in Mock Provider Jane Cleaner via REST
    const provLoginRes = await fetch('http://localhost:3005/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+255700000002', password: 'password' })
    });
    const provLogin = await provLoginRes.json();
    console.log('- Provider login status:', provLogin.success ? 'SUCCESS' : 'FAILED');
    
    const provCookies = provLoginRes.headers.get('set-cookie');
    const provToken = provCookies ? provCookies.split('token=')[1].split(';')[0] : '';

    // 4. Open Provider WebSocket connection
    providerSocket = new WebSocket('ws://localhost:3005/ws', {
      headers: { cookie: `token=${provToken}` }
    });

    providerSocket.on('open', () => {
      console.log('- Provider WebSocket connection opened.');
      // Send location update to go online
      providerSocket.send(JSON.stringify({
        type: 'location_update',
        lat: -6.7924,
        lon: 39.2083,
        is_available: 1
      }));
    });

    providerSocket.on('message', (message) => {
      const data = JSON.parse(message);
      if (data.type === 'new_task_alert') {
        console.log('✅ Provider received real-time Task Match dispatch alert:', data.task.category);
        receivedAlert = true;
        
        // Provider expresses interest back immediately
        providerSocket.send(JSON.stringify({ type: 'auth', token: provToken })); // Re-auth check
        // We will call the interest API route
        fetch(`http://localhost:3005/api/tasks/${data.task.id}/interest`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Cookie': `token=${provToken}`
          }
        }).then(res => res.json()).then(resData => {
          console.log('- Provider logged interest status:', resData.success ? 'SUCCESS' : 'FAILED');
        });
      }
    });

    // 5. Open Customer WebSocket connection
    customerSocket = new WebSocket('ws://localhost:3005/ws', {
      headers: { cookie: `token=${custToken}` }
    });

    customerSocket.on('open', () => {
      console.log('- Customer WebSocket connection opened.');
    });

    customerSocket.on('message', (message) => {
      const data = JSON.parse(message);
      if (data.type === 'interest_alert') {
        console.log('✅ Customer received real-time Helper Interest alert. Helpers count:', data.interested_count);
        receivedInterest = true;
      }
    });

    // Wait a brief moment for sockets to sync and provider to go online
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 6. Customer publishes an urgent Cleaning chore
    console.log('- Customer publishing new cleaning chore task...');
    const taskRes = await fetch('http://localhost:3005/api/tasks/create', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': `token=${custToken}`
      },
      body: JSON.stringify({
        category: 'cleaning',
        lat: -6.7924,
        lon: 39.2083,
        details: 'Cleaning chore, urgent matching requested.',
        budget_type: 'fixed',
        budget_amount: 35000,
        expiry_mins: 30
      })
    });
    
    const taskData = await taskRes.json();
    console.log('- Task publish success:', taskData.success);

    // Wait for WebSocket dispatch messages to propagate
    await new Promise(resolve => setTimeout(resolve, 2500));

    // 7. Verify assertions
    if (receivedAlert && receivedInterest) {
      console.log('🎉 INTEGRATION TEST COMPLETED SUCCESSFULLY: Real-time alert flow works!');
      process.exit(0);
    } else {
      console.error(`❌ INTEGRATION TEST FAILED. Alert received: ${receivedAlert}, Interest received: ${receivedInterest}`);
      process.exit(1);
    }

  } catch (err) {
    console.error('❌ Integration test failed with runtime error:', err);
    process.exit(1);
  } finally {
    if (providerSocket) providerSocket.close();
    if (customerSocket) customerSocket.close();
  }
}

testWebSocketMatching();
