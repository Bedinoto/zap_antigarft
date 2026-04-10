const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log("Inserindo manual puro JS...");
  try {
    const contact = await prisma.contact.create({
      data: {
        name: "Contato Manual via Node",
        phoneNumber: "551100000000"
      }
    });

    const instance = await prisma.instance.create({
      data: {
        name: "Instancia Manual",
        token: "token-manual-123"
      }
    });

    const conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        instanceId: instance.id,
        status: "WAITING",
        lastMessage: "Injeção via Banco de Dados com Sucesso!"
      }
    });

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        content: "Injeção via Banco de Dados com Sucesso!",
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
