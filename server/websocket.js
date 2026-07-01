import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import { query } from './db.js';

// Map of userId -> WebSocket connection
const activeConnections = new Map();

// Map of providerId -> { lat, lon, services, serviceRadius }
const onlineProviders = new Map();

export function initializeWebSocketServer(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  // Heartbeat: every 30s ping all sockets; terminate any that didn't pong.
  // Keeps the connection maps clean under thousands of mobile clients.
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', (ws, req) => {
    let authUser = null;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    console.log('New WebSocket connection established.');

    // Attempt to authenticate from Cookie header
    const cookiesStr = req.headers.cookie || '';
    const cookies = cookie.parse(cookiesStr);
    const token = cookies.token;

    if (token) {
      try {
        authUser = jwt.verify(token, process.env.JWT_SECRET || 'wakishua-default-secret');
        registerClient(authUser.id, ws);
      } catch (err) {
        console.warn('WS Cookie auth failed:', err.message);
      }
    }

    // Set connection timeout: close if not authenticated in 10 seconds
    const authTimeout = setTimeout(() => {
      if (!authUser) {
        console.log('Closing unauthenticated WS connection.');
        ws.close(4001, 'Authentication Timeout');
      }
    }, 10000);

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        
        // 1. Explicit message auth
        if (data.type === 'auth') {
          try {
            authUser = jwt.verify(data.token, process.env.JWT_SECRET || 'wakishua-default-secret');
            registerClient(authUser.id, ws);
            clearTimeout(authTimeout);
            ws.send(JSON.stringify({ type: 'auth_success', user: { id: authUser.id, role: authUser.role } }));
            
            // If they are a provider, check if they are already marked online
            if (authUser.role === 'provider') {
              const provider = await query.get('SELECT is_available, lat, lon, service_radius, services FROM providers WHERE user_id = ?', [authUser.id]);
              if (provider && provider.is_available === 1) {
                onlineProviders.set(authUser.id, {
                  lat: provider.lat,
                  lon: provider.lon,
                  serviceRadius: provider.service_radius,
                  services: JSON.parse(provider.services)
                });
              }
            }
          } catch (err) {
            ws.send(JSON.stringify({ type: 'error', message: 'Authentication failed' }));
          }
          return;
        }

        // Require auth for any other message
        if (!authUser) {
          ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
          return;
        }

        // 2. Location/Availability updates from Providers
        if (data.type === 'location_update') {
          if (authUser.role !== 'provider') return;
          const { lat, lon, is_available } = data;
          
          // Update DB
          await query.run(
            'UPDATE providers SET lat = ?, lon = ?, is_available = ? WHERE user_id = ?',
            [lat, lon, is_available, authUser.id]
          );

          if (is_available === 1) {
            // Get provider details to populate services cache
            const p = await query.get('SELECT services, service_radius FROM providers WHERE user_id = ?', [authUser.id]);
            const services = p ? JSON.parse(p.services) : [];
            const serviceRadius = p ? p.service_radius : 5;

            onlineProviders.set(authUser.id, { lat, lon, services, serviceRadius });
            console.log(`Provider ${authUser.id} is ONLINE at (${lat}, ${lon})`);
          } else {
            onlineProviders.delete(authUser.id);
            console.log(`Provider ${authUser.id} is OFFLINE`);
          }

          ws.send(JSON.stringify({ type: 'status_synced', is_available }));
          return;
        }

        // 3. Real-time chat messaging
        if (data.type === 'chat_message') {
          const { chat_id, text } = data;
          
          // Verify chat exists and user is part of it
          const chat = await query.get(
            'SELECT * FROM chats WHERE id = ? AND (customer_id = ? OR provider_id = ?)',
            [chat_id, authUser.id, authUser.id]
          );
          if (!chat) {
            ws.send(JSON.stringify({ type: 'error', message: 'Chat room not found or unauthorized' }));
            return;
          }

          const msgId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
          
          // Save message to SQLite
          await query.run(
            'INSERT INTO messages (id, chat_id, sender_id, text) VALUES (?, ?, ?, ?)',
            [msgId, chat_id, authUser.id, text]
          );

          // Forward to other participant
          const recipientId = authUser.id === chat.customer_id ? chat.provider_id : chat.customer_id;
          const payload = JSON.stringify({
            type: 'chat_message',
            chat_id,
            sender_id: authUser.id,
            text,
            created_at: new Date().toISOString()
          });

          sendToUser(recipientId, payload);
          // Echo back to sender for confirmation
          ws.send(payload);
          return;
        }

      } catch (err) {
        console.error('WS Message handle error:', err);
        ws.send(JSON.stringify({ type: 'error', message: 'Malformed message' }));
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (authUser) {
        activeConnections.delete(authUser.id);
        onlineProviders.delete(authUser.id); // Go offline when socket disconnects
        console.log(`User ${authUser.id} disconnected.`);
      }
    });
  });
}

function registerClient(userId, ws) {
  activeConnections.set(userId, ws);
  console.log(`User ${userId} authenticated on WebSockets.`);
}

function sendToUser(userId, payload) {
  const ws = activeConnections.get(userId);
  if (ws && ws.readyState === 1) {
    ws.send(payload);
    return true;
  }
  return false;
}

// Haversine formula
function getDistanceKM(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Dispatch alert to nearby online providers
export function sendTaskAlertToNearbyProviders(task) {
  const { id, category, lat, lon, budget_amount, details } = task;

  console.log(`Dispatching alerts for task ${id} (Category: ${category})`);

  for (const [providerId, stats] of onlineProviders.entries()) {
    // Check if provider supports this category
    if (!stats.services.includes(category)) continue;

    // Check distance range
    const dist = getDistanceKM(lat, lon, stats.lat, stats.lon);
    if (dist <= stats.serviceRadius) {
      console.log(`Notifying provider ${providerId} (distance: ${dist.toFixed(2)} km)`);
      
      const payload = JSON.stringify({
        type: 'new_task_alert',
        task: {
          id,
          category,
          distance_km: parseFloat(dist.toFixed(2)),
          budget_amount,
          details
        }
      });

      sendToUser(providerId, payload);
    }
  }
}

// Notify customer of new interest count
export function notifyCustomerOfInterest(customerId, taskId, interestedCount) {
  sendToUser(customerId, JSON.stringify({
    type: 'interest_alert',
    task_id: taskId,
    interested_count: interestedCount
  }));
}

// Notify provider of selection status
export function notifyProviderOfSelection(providerId, taskId, chatId) {
  sendToUser(providerId, JSON.stringify({
    type: 'task_selected_alert',
    task_id: taskId,
    chat_id: chatId
  }));
}
