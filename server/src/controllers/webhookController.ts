import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export const handleUazapiWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.body;
    console.log('[WEBHOOK uazapiGO] Recebido:', JSON.stringify(payload, null, 2));

    // Exemplo de como uazapi pode enviar dados (assumindo formato tipo evolution API / baileys)
    // Precisamos ajustar as chaves do objeto conforme a documentação oficial ou os testes na prática
    // Verifica se é uma mensagem de texto válida pela estrutura da uazapiGO
    if (payload.type === 'text' || payload.text !== undefined || payload.messageType !== undefined) {
      const msg = payload; // A uazapiGO envia o objeto flat, sem wrapper 'data'
      const contactPhone = msg.sender || msg.from || msg.remoteJid;
      
      if (!contactPhone || !msg.text) {
        res.status(200).send('OK (Sem texto ou remetente)');
        return;
      }

      // 1. Acha ou Cria o Contato
      let contact = await prisma.contact.findFirst({
        where: { phoneNumber: contactPhone }
      });
      if (!contact) {
        contact = await prisma.contact.create({
          data: { phoneNumber: contactPhone, name: msg.senderName || 'Desconhecido' }
        });
      }

      // 2. Acha a Instância baseada no token retornado
      const instanceToken = msg.token || process.env.UAZAPI_INSTANCE_TOKEN;
      let instanceInfo = await prisma.instance.findFirst({ where: { token: instanceToken }});
      if (!instanceInfo) {
         instanceInfo = await prisma.instance.create({
           data: { name: msg.owner || 'default', token: instanceToken }
         });
      }

      // 3. Acha ou Cria a Conversa na Fila "WAITING"
      let conversation = await prisma.conversation.findFirst({
        where: {
          contactId: contact.id,
        },
        orderBy: { updatedAt: 'desc' }
      });

      if (!conversation || conversation.status === 'CLOSED') {
        conversation = await prisma.conversation.create({
          data: {
            contactId: contact.id,
            instanceId: instanceInfo.id,
            status: 'WAITING' // Fila
          }
        });
      }

      // 4. Salva a Mensagem
      const textContent = msg.text || 'Mensagem sem texto';
      
      const savedMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          content: textContent,
          fromMe: msg.fromMe || false,
          type: 'TEXT', // Expandir para MEDIA depois
        }
      });

      // Atualiza lastMessage da conversa
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessage: textContent, updatedAt: new Date() }
      });

      // 5. Manda para os clientes via Socket.io no Frontend
      // Importante injetar a instância global do Socket ou passar nas variaveis app
      if (global._io) {
        global._io.emit('new_message', {
          conversationId: conversation.id,
          message: savedMessage,
          contact: contact
        });

        // Se era a primeira mensagem, avisa que tem chat na fila
        if (!msg.fromMe && conversation.status === 'WAITING') {
          global._io.emit('queue_updated');
        }
      }
    }

    res.status(200).send('Webhook processado c/ sucesso');

  } catch (error) {
    console.error('Erro no processamento do Webhook:', error);
    res.status(500).send('Erro interno do servidor');
  }
};
