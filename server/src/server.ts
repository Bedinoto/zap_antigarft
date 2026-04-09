import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { handleUazapiWebhook } from './controllers/webhookController';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// Tornando o IO globalmente acessível se não usarmos injeção de dependência via Request
declare global {
  var _io: Server;
}
global._io = io;

io.on('connection', (socket) => {
  console.log('Cliente WS Conectado:', socket.id);
  socket.on('disconnect', () => {
    console.log('Cliente WS Desconectado:', socket.id);
  });
});

import apiRoutes from './routes/api';

// Rotas Básicas
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Antigravity Zap server running' });
});

app.use('/api', apiRoutes);

// Rotas do Provedor de Mensagens e Webhooks
app.post('/api/webhook/uazapigo', handleUazapiWebhook);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
