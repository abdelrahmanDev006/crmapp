const bcrypt = require("bcryptjs");
const nodeCrypto = require("crypto");
const path = require("path");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

const envFile = process.env.ENV_FILE || ".env";
dotenv.config({ path: path.resolve(__dirname, `../${envFile}`) });

const prisma = new PrismaClient();

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

function getExpectedDefaultPasswords(email) {
  const normalizedEmail = String(email || "").toLowerCase().trim();
  const candidates = new Set(["Admin@123", "Admin2@123", "Rep@1234"]);

  if (normalizedEmail === "admin@crm.local") {
    return ["Admin@123"];
  }

  if (normalizedEmail === "admin2@crm.local") {
    return ["Admin2@123", "Admin@123"];
  }

  const adminMatch = normalizedEmail.match(/^admin(\d+)@crm\.local$/);
  if (adminMatch) {
    const adminIndex = adminMatch[1];
    candidates.add(`Admin${adminIndex}@123`);
    candidates.add(`Admin@${adminIndex}123`);
  }

  const repMatch = normalizedEmail.match(/^rep(\d+)@crm\.local$/);
  if (repMatch) {
    const repIndex = repMatch[1];
    candidates.add(`Rep@${repIndex}234`);
    candidates.add(`Rep${repIndex}@1234`);
    candidates.add(`Rep@${repIndex}@1234`);
  }

  return [...candidates];
}

async function hasDefaultPassword(passwordHash, email) {
  const candidates = getExpectedDefaultPasswords(email);

  for (let index = 0; index < candidates.length; index += 1) {
    if (await bcrypt.compare(candidates[index], passwordHash)) {
      return true;
    }
  }

  return false;
}

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      passwordHash: true
    },
    orderBy: { id: "asc" }
  });

  const rotated = [];

  for (let index = 0; index < users.length; index += 1) {
    const user = users[index];

    if (!(await hasDefaultPassword(user.passwordHash, user.email))) {
      continue;
    }

    const nextPassword = generateStrongPassword();
    const nextHash = await bcrypt.hash(nextPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: nextHash }
    });

    rotated.push({
      email: user.email,
      role: user.role,
      newPassword: nextPassword
    });
  }

  if (rotated.length === 0) {
    console.log("No users with known default passwords were found.");
    return;
  }

  console.log(`Rotated ${rotated.length} account(s):`);
  for (let index = 0; index < rotated.length; index += 1) {
    const account = rotated[index];
    console.log(`${account.role}: ${account.email} / ${account.newPassword}`);
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
