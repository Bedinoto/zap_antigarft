import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export const handleUazapiWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.body;
    console.log('[WEBHOOK uazapiGO] Recebido:', JSON.stringify(payload, null, 2));

    // Baseado no JSON oficial da uazapi: ele envia a raiz com EventType e dentro a chave message
    if (payload.EventType === 'messages' || payload.message !== undefined) {
      const msg = payload.message || payload; // msg herda o conteudo real da mensagem
      
      // Priorizar o chatid (ou wa_chatid). Se msg.fromMe for true, msg.sender sera o proprio numero (Instância),
      // o que criaria um loop de falar consigo mesmo. Ao focar no chat, a instacia grava o cliente certo.
      let contactPhone = msg.chatid || payload.chat?.wa_chatid || msg.sender || msg.from || msg.remoteJid;
      
      // Tratamento adicional: Se por precaucao for group message mas sem chatid, ele vai processar o sender
      // Mas para WAPI uazapi, chatid sempre vem.
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
      let finalType = 'TEXT';
      
      const mediaTypesMap: Record<string, string> = {
         'image': 'IMAGE',
         'audio': 'AUDIO',
         'ptt': 'AUDIO',     // whatsapp voice notes
         'video': 'VIDEO',
         'document': 'DOCUMENT'
      };

      if (msg.mediaType && mediaTypesMap[msg.mediaType]) {
         finalType = mediaTypesMap[msg.mediaType];
         
         if (['image', 'audio', 'ptt', 'video', 'document'].includes(msg.mediaType)) {
             // Tentar baixar da API da Uazapi!
             // Uazapi converte audio para mp3 por padrao (generate_mp3=true internamente ou na API)
             // msg.messageid || msg.id protege caso o schema do uazapi variar
             const downloadData = await UazapiService.downloadMedia(msg.messageid || msg.id);
             
             if (downloadData && downloadData.base64Data) {
                finalMediaUrl = `data:${downloadData.mimetype || 'application/octet-stream'};base64,${downloadData.base64Data}`;
             } else if (msg.mediaType === 'image' && msg.content?.JPEGThumbnail) {
                finalMediaUrl = `data:image/jpeg;base64,${msg.content.JPEGThumbnail}`; // Fallback pra miniatura
             }
      const theMediaName = msg.fileName || msg.content?.documentFileName || msg.content?.fileName || msg.content?.title || msg.content?.name || null;
      const computedContent = textContent || (finalType === 'AUDIO' ? '🎵 [Áudio]' : finalType === 'VIDEO' ? '🎥 [Vídeo]' : finalType === 'DOCUMENT' ? (theMediaName || '📄 [Documento]') : undefined);

      // --- DEDUPLICADOR ANTI-ECHO ---
      // Se a mensagem for enviada por nós (fromMe: true), pode ser apenas um ECO da nossa própria API
      let shouldSave = true;
      if (msg.fromMe) {
          const recentMessage = await prisma.message.findFirst({
              where: {
                  conversationId: conversation.id,
                  fromMe: true,
                  createdAt: { gte: new Date(Date.now() - 15000) } // ultimos 15 segundos
              },
              orderBy: { createdAt: 'desc' }
          });

          if (recentMessage) {
              // Se foi texto repetido, ou se foi mídia genérica repetida num intervalo curto, ignorar.
              if (
                 recentMessage.content === computedContent || 
                 (finalType !== 'TEXT' && recentMessage.type === finalType) ||
                 (finalType === 'TEXT' && computedContent === '📎 [Mídia]' && recentMessage.type === 'DOCUMENT')
              ) {
                  shouldSave = false;
                  console.log('[WEBHOOK uazapiGO] Ignorando ECO gerado pela nossa própria API.');
              }
          }
      }

      if (shouldSave) {
          const savedMessage = await prisma.message.create({
            data: {
              conversationId: conversation.id,
              content: computedContent,
              fromMe: msg.fromMe || false,
              type: finalType,
              mediaUrl: finalMediaUrl,
              mediaName: theMediaName
            }
          });
      }

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
