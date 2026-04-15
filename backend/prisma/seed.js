const bcrypt = require("bcryptjs");
const nodeCrypto = require("crypto");
const path = require("path");
const dotenv = require("dotenv");
const { PrismaClient, Role, VisitType, ClientStatus } = require("@prisma/client");
const { addWorkDaysWith28DayMonth, getCurrentWorkWeekStart } = require("../src/utils/dateUtils");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

const SeedModes = {
  FULL: "FULL",
  ADMIN_ONLY: "ADMIN_ONLY"
};

const regionNames = [
  "المنطقة الأولى",
  "المنطقة الثانية",
  "المنطقة الثالثة",
  "المنطقة الرابعة",
  "المنطقة الخامسة",
  "المنطقة السادسة"
];

const clientNamePrefixes = ["مؤسسة", "شركة", "مخزن", "مكتبة", "متجر", "صيدلية", "معرض"];
const addressPool = ["شارع التحرير", "شارع الملك فيصل", "حي الجامعة", "شارع النصر", "حي الزهور", "شارع الهرم"];
const productsPool = [
  "منتج A, منتج B",
  "منتج C",
  "منتج D, منتج E",
  "منتج F",
  "منتج G, منتج H",
  "منتج I"
];

const visitTypeCycle = [VisitType.WEEKLY, VisitType.BIWEEKLY, VisitType.MONTHLY];
const statusCycle = [ClientStatus.ACTIVE, ClientStatus.NO_ANSWER, ClientStatus.REJECTED, ClientStatus.ACTIVE];
const visitOffsetCycle = [-7, 0, 7, 14, 21, 28];

function buildClientPayload(index, regions, adminId) {
  const region = regions[index % regions.length];
  const visitType = visitTypeCycle[index % visitTypeCycle.length];
  const status = statusCycle[index % statusCycle.length];
  const visitOffset = visitOffsetCycle[index % visitOffsetCycle.length];
  const prefix = clientNamePrefixes[index % clientNamePrefixes.length];
  const address = addressPool[index % addressPool.length];
  const products = productsPool[index % productsPool.length];
  const price = String(120 + (index % 18) * 15);
  const phoneNumber = `01${String(index + 1).padStart(9, "0")}`;

  return {
    name: `${prefix} العميل ${index + 1}`,
    phone: phoneNumber,
    address,
    products,
    price,
    visitType,
    status,
    nextVisitDate: getSafeWorkDate(visitOffset),
    regionId: region.id,
    createdById: adminId
  };
}

function getSafeWorkDate(offsetDays = 0) {
  return addWorkDaysWith28DayMonth(getCurrentWorkWeekStart(new Date()), offsetDays);
}

function toNonNegativeInteger(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function resolveSeedMode(value) {
  const mode = String(value || SeedModes.FULL).trim().toUpperCase();
  const allowedModes = Object.values(SeedModes);

  if (!allowedModes.includes(mode)) {
    throw new Error(`Unsupported SEED_MODE "${value}". Allowed values: ${allowedModes.join(", ")}`);
  }

  return mode;
}

function generateStrongPassword(length = 16) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let password = "";

  while (password.length < length) {
    const bytes = nodeCrypto.randomBytes(length);

    for (let index = 0; index < bytes.length && password.length < length; index += 1) {
      password += alphabet[bytes[index] % alphabet.length];
    }
  }

  return password;
}

async function seedRegions() {
  const regions = [];

  for (let index = 0; index < regionNames.length; index += 1) {
    const code = index + 1;
    const region = await prisma.region.upsert({
      where: { code },
      update: { name: regionNames[index] },
      create: {
        code,
        name: regionNames[index]
      }
    });

    regions.push(region);
  }

  return regions;
}

async function seedUsers(regions) {
  const availableRegions = Array.isArray(regions) ? regions : [];
  const createdCredentials = [];
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@crm.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || generateStrongPassword();

  let admin = await prisma.user.findUnique({
    where: { email: adminEmail }
  });

  if (!admin) {
    const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
    admin = await prisma.user.create({
      data: {
        name: "مدير النظام",
        email: adminEmail,
        passwordHash: adminPasswordHash,
        role: Role.ADMIN
      }
    });

    createdCredentials.push({
      role: "ADMIN",
      email: adminEmail,
      password: adminPassword
    });
  }

  const repEmailPrefix = process.env.SEED_REP_EMAIL_PREFIX || "rep";
  const repCount = toNonNegativeInteger(process.env.SEED_REP_COUNT, availableRegions.length);
  const sharedRepPassword = process.env.SEED_REP_DEFAULT_PASSWORD || null;

  if (repCount === 0 || availableRegions.length === 0) {
    return {
      adminId: admin.id,
      createdCredentials
    };
  }

  for (let index = 0; index < repCount; index += 1) {
    const region = availableRegions[index % availableRegions.length];
    const email = `${repEmailPrefix}${index + 1}@crm.local`;

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          regionId: region.id,
          role: Role.REPRESENTATIVE,
          isActive: true
        }
      });

      continue;
    }

    const password = sharedRepPassword || generateStrongPassword();
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        name: `مندوب ${index + 1}`,
        email,
        passwordHash,
        role: Role.REPRESENTATIVE,
        regionId: region.id
      }
    });

    createdCredentials.push({
      role: "REPRESENTATIVE",
      email,
      password
    });
  }

  return {
    adminId: admin.id,
    createdCredentials
  };
}

async function seedClients(regions, adminId) {
  if (!adminId || regions.length === 0) {
    return;
  }

  const defaultClientCount = regions.length * 3;
  const targetClientCount = toNonNegativeInteger(process.env.SEED_CLIENT_COUNT, defaultClientCount);

  if (targetClientCount === 0) {
    return;
  }

  const existingCount = await prisma.client.count();
  const clientsToCreate = Math.max(0, targetClientCount - existingCount);

  if (clientsToCreate === 0) {
    return;
  }

  const batchSize = 500;

  for (let start = 0; start < clientsToCreate; start += batchSize) {
    const currentBatchSize = Math.min(batchSize, clientsToCreate - start);
    const data = [];

    for (let offset = 0; offset < currentBatchSize; offset += 1) {
      const globalIndex = existingCount + start + offset;
      data.push(buildClientPayload(globalIndex, regions, adminId));
    }

    await prisma.client.createMany({ data });
  }
}

async function main() {
  const seedMode = resolveSeedMode(process.env.SEED_MODE);
  const isAdminOnlyMode = seedMode === SeedModes.ADMIN_ONLY;
  const regions = isAdminOnlyMode ? [] : await seedRegions();

  const { adminId, createdCredentials } = await seedUsers(regions);
  if (!isAdminOnlyMode) {
    await seedClients(regions, adminId);
  }

  console.log(`Seed completed (${seedMode}).`);

  if (isAdminOnlyMode) {
    console.log("Admin-only seed mode: regions, representatives, and clients were skipped.");
  }

  if (createdCredentials.length === 0) {
    console.log("No new users created in this seed run.");
    return;
  }

  console.log("Generated credentials for newly created users:");
  for (const credential of createdCredentials) {
    console.log(`${credential.role}: ${credential.email} / ${credential.password}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
