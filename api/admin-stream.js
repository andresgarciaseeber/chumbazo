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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const col = (await getDb()).collection('settings');

    if (req.method === 'GET') {
      const [urlDoc, liveDoc] = await Promise.all([
        col.findOne({ key: 'stream_url' }),
        col.findOne({ key: 'live_mode' }),
      ]);
      return res.json({
        streamUrl: urlDoc?.value || process.env.STREAM_URL || '',
        live: liveDoc ? liveDoc.value !== false : true,
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      // Toggle modo live / standby
      if ('live' in body) {
        const live = body.live !== false;
        await col.updateOne(
          { key: 'live_mode' },
          { $set: { key: 'live_mode', value: live, updatedAt: new Date() } },
          { upsert: true }
        );
        return res.json({ ok: true, live });
      }

      // Actualizar URL del stream
      const url = String(body.streamUrl || '').trim();
      if (!url) return res.status(400).json({ error: 'URL requerida' });
      await col.updateOne(
        { key: 'stream_url' },
        { $set: { key: 'stream_url', value: url, updatedAt: new Date() } },
        { upsert: true }
      );
      return res.json({ ok: true, streamUrl: url });
    }

    return res.status(405).json({ error: 'Método no permitido' });

  } catch (err) {
    console.error('[chumbazo/admin-stream]', err);
    return res.status(500).json({ error: 'Error interno' });
  }
};
