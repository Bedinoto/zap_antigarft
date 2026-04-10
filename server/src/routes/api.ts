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
  const { conversationId, text, userId, mediaBase64, mediaType, mediaName } = req.body;

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { contact: true, instance: true }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Dispara para a API Externa
    if (mediaBase64) {
      await UazapiService.sendMedia(
        conversation.instance.name,
        conversation.contact.phoneNumber,
        mediaBase64,
        text, // caption
        mediaType || "image"
        // NOTA: Em versões estendidas a Uazapi aceita o parameter 'fileName' na requisição sendMedia.
        // Opcional: ajustar sendMedia futuramente se necessário enviar com nome final.
      );
    } else {
      await UazapiService.sendText(
        conversation.instance.name, 
        conversation.contact.phoneNumber, 
        text
      );
    }

    let dbType = 'TEXT';
    let label = '';
    if (mediaBase64) {
       const mappedType = mediaType ? mediaType.toUpperCase() : 'IMAGE'; // IMAGE, AUDIO, VIDEO, DOCUMENT
       dbType = mappedType === 'IMAGE' || mappedType === 'AUDIO' || mappedType === 'VIDEO' || mappedType === 'DOCUMENT' ? mappedType : 'IMAGE';
       
       if (dbType === 'IMAGE') label = '📷 [Imagem enviada]';
       else if (dbType === 'AUDIO') label = '🎵 [Áudio enviado]';
       else if (dbType === 'VIDEO') label = '🎥 [Vídeo enviado]';
       else if (dbType === 'DOCUMENT') label = mediaName || '📄 [Documento enviado]';
       else label = '📎 [Mídia enviada]';
    }

    // Salva a mensagem no Banco como enviada por nós
    const message = await prisma.message.create({
      data: {
        conversationId,
        fromMe: true,
        content: text || label,
        type: dbType,
        mediaUrl: mediaBase64 || null,
        mediaName: mediaName || null
      }
    });

    // Atualiza status da conversa caso estivesse WAITING para ACTIVE
    const summaryText = text || label;
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'ACTIVE', userId, lastMessage: summaryText, updatedAt: new Date() }
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

// ---------------------------
// ROTAS DE GERENCIAMENTO DE USUÁRIOS (AGENTES)
// ---------------------------

// Listar todos os Agentes
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });
    // Removemos a senha da resposta por segurança
    const safeUsers = users.map(u => {
      const { password, ...userWithoutPassword } = u;
      return userWithoutPassword;
    });
    res.json(safeUsers);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar agentes' });
  }
});

// Criar novo Agente
router.post('/users', async (req, res) => {
  const { name, email, password, role, status } = req.body;
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'E-mail já está em uso.' });
    }
    
    // (MVP: Salvando senha plain-text pois não há bcrypt no projeto. Ideal usar hash futuro)
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password, // <-- Ideal criptografar
        role: role || 'AGENT',
        status: status || 'OFFLINE'
      }
    });

    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json(userWithoutPassword);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar agente' });
  }
});

// Editar Agente
router.put('/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, password, role, status } = req.body;
  try {
    const updateData: any = { name, email, role, status };
    if (password && password.trim() !== '') {
      updateData.password = password;
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData
    });
    const { password: _, ...userWithoutPassword } = updatedUser;
    res.json(userWithoutPassword);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar agente' });
  }
});

// Excluir Agente
router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Caso existam conversas atreladas, pode falhar devido à Foreign Key Constraint
    await prisma.user.delete({ where: { id } });
    res.json({ success: true, message: 'Agente deletado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir agente (talvez já tenha conversas no histórico)' });
  }
});

export default router;
