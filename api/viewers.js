const { MongoClient } = require('mongodb');

let cachedClient = null;
let indexEnsured = false;

async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(process.env.MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db('chumbazo_live');
}

async function ensureIndex(col) {
  if (indexEnsured) return;
  // TTL: MongoDB borra documentos cuyo lastSeen supere los 30 segundos
  await col.createIndex({ lastSeen: 1 }, { expireAfterSeconds: 30 });
  indexEnsured = true;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const col = (await getDb()).collection('sessions');
    await ensureIndex(col);

    // POST: heartbeat — actualiza lastSeen y devuelve el conteo actual
    if (req.method === 'POST') {
      const { sessionId } = req.body || {};
      if (!sessionId) return res.status(400).json({ error: 'sessionId requerido' });

      await col.updateOne(
        { sessionId },
        { $set: { lastSeen: new Date() } },
        { upsert: true }
      );
      const count = await col.countDocuments();
      return res.json({ count });
    }

    // GET: solo conteo
    if (req.method === 'GET') {
      const count = await col.countDocuments();
      return res.json({ count });
    }

    return res.status(405).json({ error: 'Método no permitido' });

  } catch (err) {
    console.error('[chumbazo/viewers]', err);
    return res.status(500).json({ error: 'Error interno' });
  }
};
