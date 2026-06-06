const { MongoClient } = require('mongodb');

const MAX_HISTORY  = 50;
const MAX_NICK_LEN = 24;
const MAX_MSG_LEN  = 300;

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const col = (await getDb()).collection('messages');

    // ── GET: historial completo o mensajes nuevos desde ?since=<ts> ──────
    if (req.method === 'GET') {
      const since = parseInt(req.query?.since, 10);
      const query = since > 0 ? { ts: { $gt: since } } : {};
      const limit = since > 0 ? 100 : MAX_HISTORY;

      const messages = await col
        .find(query, { projection: { _id: 0 } })
        .sort({ ts: since > 0 ? 1 : -1 })
        .limit(limit)
        .toArray();

      return res.json(since > 0 ? messages : messages.reverse());
    }

    // ── POST: guarda mensaje ──────────────────────────────────────────────
    if (req.method === 'POST') {
      const { nickname, text, type } = req.body || {};

      const msg = {
        nickname: String(nickname || '').trim().slice(0, MAX_NICK_LEN),
        text:     String(text     || '').trim().slice(0, MAX_MSG_LEN),
        type:     type === 'system' ? 'system' : 'message',
        ts:       Date.now(),
      };

      if (!msg.text || !msg.nickname) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
      }

      await col.insertOne({ ...msg });

      // Mantiene solo los últimos MAX_HISTORY documentos
      const count = await col.countDocuments();
      if (count > MAX_HISTORY) {
        const oldest = await col
          .find({}, { projection: { _id: 1 } })
          .sort({ ts: 1 })
          .limit(count - MAX_HISTORY)
          .toArray();
        await col.deleteMany({ _id: { $in: oldest.map(d => d._id) } });
      }

      return res.json({ ok: true, ts: msg.ts });
    }

    return res.status(405).json({ error: 'Método no permitido' });

  } catch (err) {
    console.error('[chumbazo/messages]', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
