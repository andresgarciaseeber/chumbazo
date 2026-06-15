const { MongoClient } = require('mongodb');

let cachedClient = null;
async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(process.env.MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db('chumbazo_live');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Email inválido' });
  }

  try {
    const col = (await getDb()).collection('subscribers');
    const existing = await col.findOne({ email });
    if (existing) return res.json({ ok: true, already: true });

    await col.insertOne({ email, subscribedAt: new Date() });
    return res.json({ ok: true, already: false });

  } catch (err) {
    console.error('[chumbazo/subscribe]', err);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
};
