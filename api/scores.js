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

// Datos de muestra para previsualizar la barra antes de que arranque el torneo (11/06).
// Activable con /api/scores?mock=live  o  /api/scores?mock=fixtures
const MOCK = {
  live: {
    type: 'live',
    matches: [
      {
        id: 9001, status: 'LIVE', minute: 67, home_score: 2, away_score: 1,
        home: { name: 'Argentina', logo: 'https://cdn.worldcupapi.com/teams/1444.png' },
        away: { name: 'Brazil',    logo: 'https://cdn.worldcupapi.com/teams/1448.png' },
      },
      {
        id: 9002, status: 'HT', minute: 45, home_score: 0, away_score: 0,
        home: { name: 'France',  logo: 'https://cdn.worldcupapi.com/teams/1441.png' },
        away: { name: 'Germany', logo: 'https://cdn.worldcupapi.com/teams/1449.png' },
      },
      {
        id: 9003, status: 'FT', minute: 90, home_score: 3, away_score: 2,
        home: { name: 'Spain',   logo: 'https://cdn.worldcupapi.com/teams/1456.png' },
        away: { name: 'Croatia', logo: 'https://cdn.worldcupapi.com/teams/1647.png' },
      },
    ],
  },
  fixtures: {
    type: 'fixtures',
    matches: [
      {
        id: 9101, time: '16:00:00', location: 'Estadio Azteca, Mexico City',
        home: { name: 'Mexico', logo: 'https://cdn.worldcupapi.com/teams/1450.png' },
        away: { name: 'Argentina', logo: 'https://cdn.worldcupapi.com/teams/1444.png' },
      },
      {
        id: 9102, time: '19:30:00', location: 'MetLife Stadium, East Rutherford',
        home: { name: 'Brazil', logo: 'https://cdn.worldcupapi.com/teams/1448.png' },
        away: { name: 'Portugal', logo: 'https://cdn.worldcupapi.com/teams/1454.png' },
      },
      {
        id: 9103, time: '22:00:00', location: 'SoFi Stadium, Inglewood',
        home: { name: 'USA', logo: 'https://cdn.worldcupapi.com/teams/1849.png' },
        away: { name: 'England', logo: 'https://cdn.worldcupapi.com/teams/1429.png' },
      },
    ],
  },
};

async function apiFetch(path) {
  const key = process.env.WORLDCUP_API_KEY;
  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${path}${sep}key=${key}&lang=es`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  return res.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Modo simulación — bypassa cache y API real
  const mock = req.query?.mock;
  if (mock && MOCK[mock]) {
    return res.json(MOCK[mock]);
  }

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
