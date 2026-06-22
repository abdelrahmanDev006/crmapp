const path = require("path");
const dotenv = require("dotenv");
const { DateTime } = require("luxon");
const { PrismaClient, Role, VisitType, ClientStatus } = require("@prisma/client");
const {
  normalizeToWorkDate,
  addWorkDaysWith28DayMonth
} = require("../src/utils/dateUtils");

const envFile = process.env.ENV_FILE || ".env";
dotenv.config({ path: path.resolve(__dirname, `../${envFile}`) });

const prisma = new PrismaClient();

const DEFAULT_REGION_NAMES = [
  "المنطقة الأولى",
  "المنطقة الثانية",
  "المنطقة الثالثة",
  "المنطقة الرابعة",
  "المنطقة الخامسة",
  "المنطقة السادسة"
];

const products = [
  "منظفات أرضيات",
  "مناديل ورقية",
  "مطهر أسطح",
  "أكياس تغليف",
  "صابون سائل",
  "معطر جو"
];

const addresses = [
  "شارع النصر",
  "شارع التحرير",
  "حي الجامعة",
  "شارع الهرم",
  "حي الزهور",
  "شارع الملك فيصل"
];

const visitTypes = [
  VisitType.WEEKLY,
  VisitType.BIWEEKLY,
  VisitType.MONTHLY,
  VisitType.CUSTOM,
  VisitType.ONE_TIME
];

const statuses = [
  ClientStatus.ACTIVE,
  ClientStatus.NO_ANSWER,
  ClientStatus.ACTIVE,
  ClientStatus.REJECTED
];

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function getWorkDateText() {
  const timezone = process.env.WORK_TIMEZONE || "Africa/Cairo";
  return DateTime.now().setZone(timezone).toISODate();
}

function normalizePhone(value) {
  return String(value || "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\D+/g, "");
}

async function ensureRegions() {
  const existingRegions = await prisma.region.findMany({
    where: { isDeleted: false },
    orderBy: { code: "asc" }
  });

  if (existingRegions.length > 0) {
    return existingRegions;
  }

  const regions = [];

  for (let index = 0; index < DEFAULT_REGION_NAMES.length; index += 1) {
    const region = await prisma.region.create({
      data: {
        code: index + 1,
        name: DEFAULT_REGION_NAMES[index]
      }
    });

    regions.push(region);
  }

  return regions;
}

async function getAdminId() {
  const admin = await prisma.user.findFirst({
    where: {
      role: Role.ADMIN,
      isActive: true
    },
    orderBy: { id: "asc" },
    select: { id: true }
  });

  return admin?.id || null;
}

async function setRepresentativesWorkDate(todayText) {
  const result = await prisma.user.updateMany({
    where: {
      role: Role.REPRESENTATIVE,
      isActive: true
    },
    data: {
      allowedDate: todayText
    }
  });

  return result.count;
}

function buildDemoClient(index, regions, adminId, today) {
  const displayIndex = index + 1;
  const region = regions[index % regions.length];
  const round = Math.floor(index / regions.length);
  const visitType = visitTypes[index % visitTypes.length];
  const status = statuses[round % statuses.length];
  const phone = `01988${String(displayIndex).padStart(6, "0")}`;
  const dueOffsetCycle = [-7, 0, 7, 0, 14, 0];
  const dueOffset = dueOffsetCycle[round % dueOffsetCycle.length];
  const priceNumber = 150 + (index % 12) * 25;

  return {
    name: `عميل تجريبي محلي ${String(displayIndex).padStart(3, "0")}`,
    phone,
    phoneNormalized: normalizePhone(phone),
    address: `${addresses[index % addresses.length]} - مبنى ${displayIndex}`,
    products: products[index % products.length],
    regionId: region.id,
    visitType,
    status,
    noAnswerCount: status === ClientStatus.NO_ANSWER ? 1 : 0,
    nextVisitDate:
      visitType === VisitType.ONE_TIME
        ? new Date("2099-12-31T23:59:59.999Z")
        : addWorkDaysWith28DayMonth(today, dueOffset),
    createdById: adminId,
    price: `${priceNumber} ج`,
    priceValue: priceNumber,
    customVisitIntervalDays: visitType === VisitType.CUSTOM ? 10 + (index % 4) * 5 : null,
    locationUrl: "https://maps.google.com/?q=30.0444,31.2357",
    note: index % 5 === 0 ? "بيان تجريبي لاختبار الملاحظات" : null
  };
}

async function main() {
  const targetCount = toPositiveInteger(process.env.DEMO_CLIENT_COUNT, 60);
  const regions = await ensureRegions();
  const adminId = await getAdminId();
  const todayText = getWorkDateText();
  const today = normalizeToWorkDate(todayText);
  const updatedRepresentatives = await setRepresentativesWorkDate(todayText);

  const payloads = Array.from({ length: targetCount }, (_item, index) =>
    buildDemoClient(index, regions, adminId, today)
  );
  const phones = payloads.map((client) => client.phoneNormalized);
  const existingClients = await prisma.client.findMany({
    where: {
      phoneNormalized: { in: phones },
      isDeleted: false
    },
    select: { id: true, phoneNormalized: true }
  });
  const existingByPhone = new Map(
    existingClients.map((client) => [client.phoneNormalized, client.id])
  );
  const clientsToCreate = [];
  const clientUpdateOperations = [];

  for (const payload of payloads) {
    const existingId = existingByPhone.get(payload.phoneNormalized);

    if (!existingId) {
      clientsToCreate.push(payload);
      continue;
    }

    clientUpdateOperations.push(
      prisma.client.update({
        where: { id: existingId },
        data: payload
      })
    );
  }

  if (clientsToCreate.length > 0) {
    await prisma.client.createMany({ data: clientsToCreate });
  }

  if (clientUpdateOperations.length > 0) {
    await prisma.$transaction(clientUpdateOperations);
  }

  console.log("[DEMO DATA] DONE");
  console.log(`- Regions available: ${regions.length}`);
  console.log(`- Representatives work date set to: ${todayText} (${updatedRepresentatives} users)`);
  console.log(`- Requested demo clients: ${targetCount}`);
  console.log(`- Created demo clients: ${clientsToCreate.length}`);
  console.log(`- Updated demo clients: ${clientUpdateOperations.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
