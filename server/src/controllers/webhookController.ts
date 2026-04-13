import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { UazapiService } from '../services/uazapiService';

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
      
      // Limpeza do número: remove sufixos @c.us / @s.whatsapp.net e caracteres não-numéricos
      if (contactPhone && typeof contactPhone === 'string') {
          contactPhone = contactPhone.split('@')[0].replace(/\D/g, '');
      }
      
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

      // 3. Acha a Conversa (por contato - pegamos a última em aberto ou a última de todas)
      // Removemos a restrição de instanceId para ser mais resiliente se a instância foi recriada
      let conversation = await prisma.conversation.findFirst({
        where: {
          contactId: contact.id
        },
        orderBy: { updatedAt: 'desc' }
      });

      if (!conversation) {
        // Cria nova se nunca existiu
        conversation = await prisma.conversation.create({
          data: {
            contactId: contact.id,
            instanceId: instanceInfo.id,
            status: 'WAITING'
          }
        });
        console.log(`[WEBHOOK] Nova conversa criada para ${contactPhone}: ${conversation.id}`);
      } else if (conversation.status === 'CLOSED' && !msg.fromMe) {
        // REGRA: Se estava fechada e o CLIENTE mandou mensagem, REABRE em WAITING
        // Limpa o userId para que qualquer agente possa ver na fila novamente
        conversation = await prisma.conversation.update({
          where: { id: conversation.id },
          data: { 
            status: 'WAITING',
            userId: null,
            updatedAt: new Date()
          }
        });
        console.log(`[WEBHOOK] Reabrindo conversa ${conversation.id} de ${contactPhone} (Status: CLOSED -> WAITING)`);
      } else if (conversation.status === 'CLOSED' && msg.fromMe) {
          // Se sou eu enviando para um chat que estava fechado, ele deve ficar ACTIVE comigo?
          // Para evitar confusao, vamos apenas garantir que ela mude de status se houve interacao
          // Mas se o sistema enviar algo automatico e nao quisermos reabrir, cuidado.
          // Como o objetivo é "fazer funcionar", vamos reabrir como ACTIVE se for do agente.
          conversation = await prisma.conversation.update({
            where: { id: conversation.id },
            data: { 
              status: 'ACTIVE',
              updatedAt: new Date()
            }
          });
          console.log(`[WEBHOOK] Agente mandou mensagem em chat CLOSED. Status -> ACTIVE`);
      }


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
         }
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

      let savedMessage = null;
      if (shouldSave) {
          savedMessage = await prisma.message.create({
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

      // Atualiza lastMessage da conversa se houver msg
      if (savedMessage) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastMessage: computedContent, updatedAt: new Date() }
          });

          // 5. Manda para os clientes via Socket.io no Frontend
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
    }

    res.status(200).send('Webhook processado c/ sucesso');

  } catch (error) {
    console.error('Erro no processamento do Webhook:', error);
    res.status(500).send('Erro interno do servidor');
  }
};
