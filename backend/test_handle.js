const { handleClientVisit } = require('./src/services/clientService');
const { Roles } = require('./src/constants/enums');
const prisma = require('./src/config/prisma');

async function test() {
  const rep = { id: 2, role: Roles.REPRESENTATIVE, regions: [{id:1}] };
  
  const client = await prisma.client.create({
    data: {
      name: "Test Clone",
      phone: "01000000000",
      address: "Test Addr",
      regionId: 1, 
      visitType: "WEEKLY",
      status: "ACTIVE",
      nextVisitDate: new Date(),
      createdById: 1,
      isExceptional: true,
      exceptionalReason: "Testing",
      exceptionalNextVisitDate: new Date(),
      products: "Product X",
      price: "100"
    }
  });

  console.log("Created client:", client.id);

  try {
    const res = await handleClientVisit({
      clientId: client.id, 
      user: rep, 
      outcome: "REJECTED", 
      note: "Test"
    });
    console.log("Success! Returned status:", res.status);
    console.log("Returned Next Visit Date:", res.nextVisitDate);
    
    // Fetch directly from DB to verify
    const dbClient = await prisma.client.findUnique({where: {id: client.id}});
    console.log("DB status:", dbClient.status);
    console.log("DB next date:", dbClient.nextVisitDate);
  } catch (err) {
    console.error("Error handling action:", err);
  }
}
test().catch(console.error).finally(() => process.exit(0));
