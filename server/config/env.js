require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

module.exports = {
  PORT: process.env.PORT || 3000,
  STREAM_URL: process.env.STREAM_URL || '',
};
