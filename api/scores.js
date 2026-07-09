const { MongoClient } = require('mongodb');

const ESPN_URL       = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const CACHE_TTL_LIVE = 30  * 1000;        // 30s con partidos en vivo
const CACHE_TTL_IDLE = 5   * 60 * 1000;   // 5min sin partidos en vivo

let cachedClient = null;
async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(process.env.MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db('chumbazo_live');
}

// status.type.name de ESPN → nuestro formato interno
const LIVE_STATUSES = new Set(['STATUS_FIRST_HALF', 'STATUS_SECOND_HALF', 'STATUS_EXTRA_TIME', 'STATUS_BREAK', 'STATUS_PENALTY']);
const HT_STATUSES   = new Set(['STATUS_HALFTIME']);
const FT_STATUSES   = new Set(['STATUS_FULL_TIME', 'STATUS_FINAL_EXTRA_TIME', 'STATUS_FINAL_PENALTY']);

function parseMatch(event) {
  const comp  = event.competitions[0];
  const home  = comp.competitors.find(t => t.homeAway === 'home');
  const away  = comp.competitors.find(t => t.homeAway === 'away');
  const st    = comp.status;
  const sName = st.type.name;

  const isLive = LIVE_STATUSES.has(sName);
  const isHT   = HT_STATUSES.has(sName);
  const isFT   = FT_STATUSES.has(sName);

  let status = 'SCH';
  if (isLive) status = 'LIVE';
  else if (isHT) status = 'HT';
  else if (isFT) status = 'FT';

  return {
    id:         event.id,
    status,
    minute:     (isLive || isHT) ? st.displayClock?.replace("'", '') : null,
    home_score: isLive || isHT || isFT ? Number(home.score) : undefined,
    away_score: isLive || isHT || isFT ? Number(away.score) : undefined,
    kickoff:    comp.date,
    home: { name: home.team.displayName, logo: home.team.logo },
    away: { name: away.team.displayName, logo: away.team.logo },
  };
}

async function fetchEspn() {
  // Usa la fecha en Buenos Aires (UTC-3, sin DST) para no cambiar de día a las 21hs
  const bsas  = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const today = bsas.toISOString().slice(0, 10).replace(/-/g, '');
  const url   = `${ESPN_URL}?dates=${today}`;
  const r     = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data  = await r.json();
  return (data.events || []).map(parseMatch);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const db      = await getDb();
    const col     = db.collection('settings');
    const liveDoc = await col.findOne({ key: 'live_mode' });
    if (liveDoc && liveDoc.value === false) {
      return res.json({ type: 'none', matches: [] });
    }

    const cacheCol = db.collection('api_cache');
    const cached   = await cacheCol.findOne({ key: 'scores' });
    if (cached && Date.now() - cached.at < cached.ttl) {
      return res.json(cached.payload);
    }

    const matches = await fetchEspn();

    const hasLive = matches.some(m => m.status === 'LIVE' || m.status === 'HT');
    const payload = matches.length
      ? { type: hasLive ? 'live' : 'fixtures', matches }
      : { type: 'none', matches: [] };
    const ttl = hasLive ? CACHE_TTL_LIVE : CACHE_TTL_IDLE;

    await cacheCol.updateOne(
      { key: 'scores' },
      { $set: { key: 'scores', payload, at: Date.now(), ttl } },
      { upsert: true }
    );

    return res.json(payload);

  } catch (err) {
    console.error('[chumbazo/scores]', err);
    return res.status(500).json({ type: 'none', matches: [] });
  }
};
