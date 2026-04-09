import { Router } from 'express';
import prisma from '../utils/prisma';
import { UazapiService } from '../services/uazapiService';

const router = Router();

// Endpoint para buscar todas as filas de conversas em andamento
router.get('/conversations', async (req, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      include: {
        contact: true,
        Messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar conversas' });
  }
});

// Endpoint para buscar as mensagens de um chat específico
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId: req.params.id },
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

// Enviar Mensagem do Atendente para o Cliente
router.post('/messages/send', async (req, res) => {
  const { conversationId, text, userId } = req.body;

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { contact: true, instance: true }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Dispara para a API Externa
    const apiResponse = await UazapiService.sendText(
      conversation.instance.name, 
      conversation.contact.phoneNumber, 
      text
    );

    // Salva a mensagem no Banco como enviada por nós
    const message = await prisma.message.create({
      data: {
        conversationId,
        fromMe: true,
        content: text,
        type: 'TEXT'
      }
    });

    // Atualiza status da conversa caso estivesse WAITING para ACTIVE
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'ACTIVE', userId, lastMessage: text, updatedAt: new Date() }
    });

    // Emite para o Frontend atualizar (caso haja outro login com msm conta)
    if (global._io) {
      global._io.emit('new_message', { conversationId, message, fromAgent: true });
    }

    res.json(message);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
