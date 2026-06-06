module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ streamUrl: process.env.STREAM_URL || '' });
};
