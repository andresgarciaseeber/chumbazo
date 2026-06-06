const { MongoClient } = require('mongodb');

const BASE_URL  = 'https://api.worldcupapi.com';
const CACHE_TTL = 30 * 1000;

let cachedClient = null;
async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(process.env.MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db('chumbazo_live');
}

async function apiFetch(path) {
  const key = process.env.WORLDCUP_API_KEY;
  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${path}${sep}key=${key}&lang=es`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  return res.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!process.env.WORLDCUP_API_KEY) {
    return res.status(503).json({ type: 'none', matches: [] });
  }

  try {
    const cacheCol = (await getDb()).collection('api_cache');

    const cached = await cacheCol.findOne({ key: 'scores' });
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      return res.json(cached.payload);
    }

    // 1. Live scores (el torneo aún no empezó — devuelve [] hasta junio)
    let payload = null;
    try {
      const live = await apiFetch('/livescores');
      // La API devuelve un array directo o { success, data: [...] }
      const matches = Array.isArray(live) ? live
        : Array.isArray(live?.data) ? live.data : [];
      if (matches.length) payload = { type: 'live', matches };
    } catch (_) {}

    // 2. Fixtures de hoy si no hay live
    if (!payload) {
      const today = new Date().toISOString().split('T')[0];
      try {
        const fix = await apiFetch(`/fixtures?date=${today}`);
        const matches = Array.isArray(fix) ? fix
          : Array.isArray(fix?.data) ? fix.data : [];
        payload = { type: 'fixtures', matches: matches.slice(0, 8) };
      } catch (_) {}
    }

    payload = payload || { type: 'none', matches: [] };

    await cacheCol.updateOne(
      { key: 'scores' },
      { $set: { key: 'scores', payload, at: Date.now() } },
      { upsert: true }
    );

    return res.json(payload);

  } catch (err) {
    console.error('[chumbazo/scores]', err);
    return res.status(500).json({ type: 'none', matches: [] });
  }
};
