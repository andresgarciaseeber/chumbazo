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

  let streamUrl = process.env.STREAM_URL || '';
  let live = true;
  try {
    const col = (await getDb()).collection('settings');
    const [urlDoc, liveDoc] = await Promise.all([
      col.findOne({ key: 'stream_url' }),
      col.findOne({ key: 'live_mode' }),
    ]);
    if (urlDoc?.value) streamUrl = urlDoc.value;
    if (liveDoc) live = liveDoc.value !== false;
  } catch (_) {}

  res.json({ streamUrl, live });
};
