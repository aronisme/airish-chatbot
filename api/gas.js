import redis from '../src/redis.mjs';

const GAS_LOGS_KEY = 'gas:testing:logs';
let memoryLogs = [];

export default async function handler(req, res) {
  // Setup CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const saveLog = async (logEntry) => {
    try {
      if (redis) {
        await redis.lpush(GAS_LOGS_KEY, JSON.stringify(logEntry));
        await redis.ltrim(GAS_LOGS_KEY, 0, 49); // Keep only last 50 logs
      } else {
        memoryLogs.unshift(logEntry);
        if (memoryLogs.length > 50) memoryLogs.length = 50;
      }
    } catch (err) {
      console.error("Redis save error:", err);
    }
  };

  if (req.method === 'GET') {
    let logs = [];
    try {
      if (redis) {
        const raw = await redis.lrange(GAS_LOGS_KEY, 0, 49) || [];
        logs = raw.map(l => typeof l === 'string' ? JSON.parse(l) : l);
      } else {
        logs = memoryLogs;
      }
    } catch (err) {
      console.error("Redis fetch error:", err);
      logs = memoryLogs;
    }
    return res.status(200).json(logs);
  }

  if (req.method === 'DELETE') {
    try {
      if (redis) {
        await redis.del(GAS_LOGS_KEY);
      }
      memoryLogs = [];
    } catch (err) {}
    return res.status(200).json({ success: true });
  }

  if (req.method === 'POST') {
    // Check if the UI is asking to send something
    const isSend = req.query.action === 'send' || req.body?.action === 'send';

    if (isSend) {
      const targetUrl = req.body?.targetUrl || req.query.targetUrl;
      const payload = req.body?.payload || {};

      if (!targetUrl) {
        return res.status(400).json({ error: 'targetUrl is required' });
      }

      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: typeof payload === 'string' ? payload : JSON.stringify(payload)
        });
        const text = await response.text();
        
        await saveLog({
            type: 'outgoing',
            timestamp: new Date().toISOString(),
            target: targetUrl,
            payload: typeof payload === 'string' ? JSON.parse(payload || '{}') : payload,
            responseStatus: response.status,
            responseBody: text
        });
        
        return res.status(200).json({ success: true, response: text, status: response.status });
      } catch (e) {
        await saveLog({
            type: 'outgoing_error',
            timestamp: new Date().toISOString(),
            target: targetUrl,
            payload: payload,
            error: e.message
        });
        return res.status(500).json({ success: false, error: e.message });
      }
    } else {
      // Data received FROM GAS (or any other webhook)
      await saveLog({
          type: 'incoming',
          timestamp: new Date().toISOString(),
          headers: req.headers,
          body: req.body,
          query: req.query
      });
      
      return res.status(200).json({ success: true, message: 'Data received by Airish Server' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
