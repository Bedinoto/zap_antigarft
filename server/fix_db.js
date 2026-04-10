const prisma = require('./dist/utils/prisma').default;

async function fix() {
  console.log("Executando alter table com Prisma Client Local...");
  try {
    const result = await prisma.$executeRawUnsafe(`ALTER TABLE Message MODIFY COLUMN mediaUrl LONGTEXT;`);
    console.log("Sucesso:", result);
  } catch (e) {
    console.log("Erro:", e);
  } finally {
    await prisma.$disconnect();
  }
}
fix();
