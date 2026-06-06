const MAX_HISTORY = 50;
const MAX_MSG_LENGTH = 300;
const messageHistory = [];

function registerChatHandlers(io, socket) {
  socket.emit('history', messageHistory);

  socket.on('join', (nickname) => {
    const clean = String(nickname).trim().slice(0, 24);
    if (!clean) return;
    socket.nickname = clean;
    socket.broadcast.emit('system', `${clean} se unió al chat`);
    io.emit('viewer count', io.engine.clientsCount);
  });

  socket.on('chat message', (text) => {
    if (!socket.nickname) return;

    const message = {
      nickname: socket.nickname,
      text: String(text).trim().slice(0, MAX_MSG_LENGTH),
      ts: Date.now(),
    };

    if (!message.text) return;

    messageHistory.push(message);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();

    io.emit('chat message', message);
  });

  socket.on('disconnect', () => {
    if (socket.nickname) {
      socket.broadcast.emit('system', `${socket.nickname} salió del chat`);
    }
    io.emit('viewer count', io.engine.clientsCount);
  });
}

module.exports = registerChatHandlers;
