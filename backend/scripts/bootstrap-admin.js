const path = require("path");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const { PrismaClient, Role } = require("@prisma/client");

const envFile = process.env.ENV_FILE || ".env";
dotenv.config({ path: path.resolve(__dirname, `../${envFile}`) });

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const nextValue = argv[index + 1];

    if (!nextValue || nextValue.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = nextValue;
    index += 1;
  }

  return args;
}

function isStrongPassword(value) {
  const password = String(value || "");

  if (password.length < 12) {
    return false;
  }

  return /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const name = (args.name || process.env.BOOTSTRAP_ADMIN_NAME || "").trim();
  const email = (args.email || process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = args.password || process.env.BOOTSTRAP_ADMIN_PASSWORD || "";

  if (!name || !email || !password) {
    console.error("Usage: npm run admin:bootstrap -- --name \"Admin Name\" --email admin@company.com --password \"StrongPassword\"");
    process.exit(1);
  }

  if (!isStrongPassword(password)) {
    console.error("Admin password is weak. Use at least 12 chars with upper/lower/digit/symbol.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: Role.ADMIN,
        isActive: true
      }
    });

    console.log(`Admin user created: ${email}`);
  } else {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name,
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
        regionId: null
      }
    });

    console.log(`Admin user updated: ${email}`);
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
