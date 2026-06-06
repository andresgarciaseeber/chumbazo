const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { PORT, STREAM_URL } = require('./config/env');
const registerChatHandlers = require('./chat/socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../public')));

app.get('/config', (req, res) => {
  res.json({ streamUrl: STREAM_URL });
});

io.on('connection', (socket) => {
  registerChatHandlers(io, socket);
});

server.listen(PORT, () => {
  console.log(`Chumbazo Live corriendo en http://localhost:${PORT}`);
});
