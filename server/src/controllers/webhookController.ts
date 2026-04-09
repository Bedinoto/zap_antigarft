import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export const handleUazapiWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.body;
    console.log('[WEBHOOK uazapiGO] Recebido:', JSON.stringify(payload, null, 2));

    // Baseado no JSON oficial da uazapi: ele envia a raiz com EventType e dentro a chave message
    if (payload.EventType === 'messages' || payload.message !== undefined) {
      const msg = payload.message || payload; // msg herda o conteudo real da mensagem
      const contactPhone = msg.sender || msg.chatid || msg.from || msg.remoteJid;
      
      let textContent = msg.text;
      
      // Ajuste para mídias (Imagens, Áudios, etc)
      if (!textContent && msg.mediaType === "image") textContent = "📷 [Imagem]";
      else if (!textContent && msg.mediaType === "audio") textContent = "🎵 [Áudio]";
      else if (!textContent && msg.mediaType === "document") textContent = "📄 [Documento]";
      else if (!textContent && msg.type === "media") textContent = "📎 [Mídia]";
      else if (!textContent) textContent = "Mensagem não decodificada";

      if (!contactPhone) {
        res.status(200).send('OK (Sem remetente)');
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
      const instanceToken = payload.token || msg.token || process.env.UAZAPI_INSTANCE_TOKEN;
      let instanceInfo = await prisma.instance.findFirst({ where: { token: instanceToken }});
      if (!instanceInfo) {
         instanceInfo = await prisma.instance.create({
           data: { name: payload.instanceName || msg.owner || 'default', token: instanceToken }
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

      // Import do Servico caso nao tenha no webhookController (Precisa estar importado)
      // O imports global desse modulo ja deve conter Prisma. Vamos garantir puxando UazapiService
      const { UazapiService } = require('../services/uazapiService');

      let finalMediaUrl = null;
      if (msg.mediaType === 'image') {
         // Tentar baixar da API da Uazapi!
         // Usar messageid como vimos lá no manual
         const downloadData = await UazapiService.downloadMedia(msg.messageid || msg.id);
         
         if (downloadData && downloadData.base64Data) {
            finalMediaUrl = `data:${downloadData.mimetype || 'image/jpeg'};base64,${downloadData.base64Data}`;
         } else if (msg.content?.JPEGThumbnail) {
            finalMediaUrl = `data:image/jpeg;base64,${msg.content.JPEGThumbnail}`; // Fallback pra miniatura
         }
      }

      const savedMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          content: textContent,
          fromMe: msg.fromMe || false,
          type: msg.mediaType === 'image' ? 'IMAGE' : 'TEXT',
          mediaUrl: finalMediaUrl
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
