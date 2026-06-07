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
  try {
    const doc = await (await getDb()).collection('settings').findOne({ key: 'stream_url' });
    if (doc?.value) streamUrl = doc.value;
  } catch (_) {
    // Si MongoDB falla, seguimos con el valor del .env
  }

  res.json({ streamUrl });
};
