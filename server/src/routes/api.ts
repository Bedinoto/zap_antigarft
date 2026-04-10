import { Router } from 'express';
import prisma from '../utils/prisma';
import { UazapiService } from '../services/uazapiService';

const router = Router();

// Endpoint para buscar todas as filas de conversas em andamento (exceto CLOSED)
router.get('/conversations', async (req, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { 
        status: { not: 'CLOSED' }
      },
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

// Aceitar atendimento (WAITING -> ACTIVE)
router.patch('/conversations/:id/accept', async (req, res) => {
  try {
    const updated = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE', updatedAt: new Date() },
      include: { contact: true, instance: true }
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao aceitar atendimento' });
  }
});

// Finalizar atendimento (qualquer -> CLOSED)
router.patch('/conversations/:id/close', async (req, res) => {
  try {
    const updated = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { status: 'CLOSED', updatedAt: new Date() }
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao finalizar atendimento' });
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

    // Salva a mensagem no Banco proativo (Optimistic Save) ANTES de disparar para evitar race-conditions com o Webhook
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

    // Dispara para a API Externa
    if (mediaBase64) {
      await UazapiService.sendMedia(
        conversation.instance.name,
        conversation.contact.phoneNumber,
        mediaBase64,
        text, // caption
        mediaType || "image",
        mediaName // <--- Agora repassa o nome oficial do arquivo pro Zap!
      );
    } else {
      await UazapiService.sendText(
        conversation.instance.name, 
        conversation.contact.phoneNumber, 
        text
      );
    }

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

// ---------------------------
// ROTAS DE GERENCIAMENTO DE CONTATOS
// ---------------------------

// Listar Contatos
router.get('/contacts', async (req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      orderBy: { updatedAt: 'desc' }
    });
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar contatos' });
  }
});

// Criar Contato
router.post('/contacts', async (req, res) => {
  let { name, phoneNumber } = req.body;
  try {
    // Basic formatting for phone
    phoneNumber = phoneNumber?.replace(/\D/g, ''); 
    if (!phoneNumber) return res.status(400).json({ error: 'Telefone inválido' });

    const existing = await prisma.contact.findUnique({ where: { phoneNumber } });
    if (existing) {
      return res.status(400).json({ error: 'Contato já cadastrado com este número.' });
    }

    const contact = await prisma.contact.create({
      data: { name: name || 'Desconhecido', phoneNumber }
    });
    res.status(201).json(contact);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar contato' });
  }
});


// Iniciar Conversa ativamente (Start-Chat)
router.post('/contacts/:id/start-chat', async (req, res) => {
  const { id } = req.params;
  
  try {
    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });

    // Pega a primeira instância conectada
    const defaultInstance = await prisma.instance.findFirst();
    if (!defaultInstance) return res.status(400).json({ error: 'Nenhuma instância configurada/conectada para abrir chat' });

    // Verifica se já existe conversa
    let conversation = await prisma.conversation.findFirst({
      where: { contactId: id, instanceId: defaultInstance.id }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          contactId: id,
          instanceId: defaultInstance.id,
          status: 'ACTIVE',
          lastMessage: '📝 Chat iniciado ativamente'
        },
        include: { contact: true, instance: true }
      });
    } else {
      // Se estava CLOSED ou WAITING, vira ACTIVE
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'ACTIVE', updatedAt: new Date() },
        include: { contact: true, instance: true }
      });
    }

    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: 'Falha ao iniciar conversa via backend' });
  }
});

// Editar Contato
router.put('/contacts/:id', async (req, res) => {
  const { id } = req.params;
  const { name, phoneNumber } = req.body;
  try {
    const limpo = phoneNumber?.replace(/\D/g, '');
    const up = await prisma.contact.update({
      where: { id },
      data: { name, phoneNumber: limpo }
    });
    res.json(up);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar contato' });
  }
});

// Excluir Contato
router.delete('/contacts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.contact.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir contato (já pode estar atrelado a conversas)' });
  }
});

export default router;
