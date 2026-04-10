import { prisma } from './src/utils/prisma';

async function main() {
  console.log("Inserindo manual para teste...");
  try {
    const contact = await prisma.contact.create({
      data: {
        name: "Teste Direto",
        phoneNumber: "551199999999"
      }
    });

    const instance = await prisma.instance.create({
      data: {
        name: "Default",
        token: "teste-token-123"
      }
    });

    const conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        instanceId: instance.id,
        status: "WAITING",
        lastMessage: "Olá teste manual!"
      }
    });

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        content: "Olá teste manual!",
        fromMe: false,
        type: "TEXT"
      }
    });

    console.log("Sucesso completo! MENSAGEM ID:", message.id);
  } catch (e) {
    console.error("ERRO NO BANCO:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
