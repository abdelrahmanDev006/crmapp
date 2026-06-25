const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const prisma = new PrismaClient();

const arabicFirstNames = ["أحمد", "محمد", "محمود", "علي", "عمر", "خالد", "حسن", "حسين", "إبراهيم", "عبدالرحمن", "مصطفى", "يوسف", "كريم", "طارق", "فاطمة", "مريم", "سارة", "نور", "هدى", "ياسمين", "منى", "رنا"];
const arabicLastNames = ["الحديد", "المصري", "النجار", "الحداد", "الشناوي", "عبدالله", "عثمان", "سعيد", "فهمي", "رمضان", "السيد", "علام", "العربي"];
const productsList = ["صابون سائل", "شامبو", "منظف زجاج", "منظف أرضيات", "كلور", "معطر جو", "مناديل مبللة", "ورق تواليت", "مسحوق غسيل", "أكياس قمامة", "فرشاة تنظيف", "إسفنج"];
const addressesList = ["شارع النيل", "شارع التحرير", "شارع جامعة الدول", "مدينة نصر", "مصر الجديدة", "المعادي", "الهرم", "فيصل", "المهندسين", "الدقي", "وسط البلد"];
const visitTypes = ["WEEKLY", "BIWEEKLY", "MONTHLY", "ONE_TIME"];

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomName() {
  return `${getRandom(arabicFirstNames)} ${getRandom(arabicLastNames)}`;
}

function generateRandomPhone() {
  const prefixes = ["010", "011", "012", "015"];
  let num = getRandom(prefixes);
  for (let i = 0; i < 8; i++) {
    num += Math.floor(Math.random() * 10);
  }
  return num;
}

function generateRandomProducts() {
  const numProducts = Math.floor(Math.random() * 3) + 1;
  const prods = new Set();
  while (prods.size < numProducts) {
    prods.add(getRandom(productsList));
  }
  return Array.from(prods).join("، ");
}

async function run() {
  try {
    console.log("Starting DB seeding...");

    // 1. Delete existing data (Clients and Visits)
    console.log("Clearing existing visits and clients...");
    await prisma.visitHistory.deleteMany({});
    await prisma.client.deleteMany({});
    
    // Check regions, if less than 3 create some
    let regions = await prisma.region.findMany();
    if (regions.length < 3) {
      console.log("Creating default regions...");
      await prisma.region.createMany({
        data: [
          { name: "منطقة القاهرة", code: "CAI", isDeleted: false },
          { name: "منطقة الجيزة", code: "GIZ", isDeleted: false },
          { name: "منطقة الإسكندرية", code: "ALX", isDeleted: false }
        ]
      });
      regions = await prisma.region.findMany();
    }
    
    const regionIds = regions.map(r => r.id);

    // 2. Generate 5000 clients
    console.log("Generating 5000 dummy clients (this might take a few seconds)...");
    
    const today = new Date();
    today.setUTCHours(0,0,0,0);
    
    const BATCH_SIZE = 1000;
    let clientsData = [];
    
    for (let i = 1; i <= 5000; i++) {
      // randomly assign a nextVisitDate around today (-5 days to +15 days)
      const dayOffset = Math.floor(Math.random() * 21) - 5; 
      const nextVisitDate = new Date(today);
      nextVisitDate.setUTCDate(today.getUTCDate() + dayOffset);
      
      clientsData.push({
        name: generateRandomName(),
        phone: generateRandomPhone(),
        address: `${getRandom(addressesList)} - مبنى ${Math.floor(Math.random() * 100) + 1}`,
        regionId: getRandom(regionIds),
        visitType: getRandom(visitTypes),
        status: "ACTIVE", // Mostly ACTIVE
        price: String((Math.floor(Math.random() * 90) + 10) * 10), // 100 to 990
        products: generateRandomProducts(),
        nextVisitDate: nextVisitDate,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      if (clientsData.length === BATCH_SIZE) {
        await prisma.client.createMany({ data: clientsData });
        clientsData = [];
        console.log(`Inserted ${i} clients...`);
      }
    }
    
    // Insert any remaining
    if (clientsData.length > 0) {
      await prisma.client.createMany({ data: clientsData });
    }
    console.log("Successfully inserted 5000 clients.");

    // 3. Setup Rep User m@a.com
    console.log("Setting up representative m@a.com...");
    const repEmail = "m@a.com";
    const hashedPassword = await bcrypt.hash("12345678", 10);
    
    let rep = await prisma.user.findUnique({ where: { email: repEmail } });
    if (rep) {
      rep = await prisma.user.update({
        where: { email: repEmail },
        data: {
          passwordHash: hashedPassword,
          role: "REPRESENTATIVE",
          isActive: true,
          allowedDate: today.toISOString().slice(0, 10)
        }
      });
    } else {
      rep = await prisma.user.create({
        data: {
          email: repEmail,
          passwordHash: hashedPassword,
          name: "المندوب التجريبي",
          role: "REPRESENTATIVE",
          allowedDate: today.toISOString().slice(0, 10)
        }
      });
    }

    // Assign rep to the first 2 regions
    const assignedRegionIds = regionIds.slice(0, 2);
    
    // Disconnect old regions and connect new ones
    await prisma.user.update({
      where: { id: rep.id },
      data: {
        regions: {
          set: assignedRegionIds.map(id => ({ id }))
        }
      }
    });

    console.log(`Representative m@a.com ready, assigned to regions: ${assignedRegionIds.join(", ")}`);
    console.log("Done! You can now log in with Admin or m@a.com");

  } catch (error) {
    console.error("Error during seeding:", error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
