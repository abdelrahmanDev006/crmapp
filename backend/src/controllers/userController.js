const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const asyncHandler = require("../middlewares/asyncHandler");
const { Roles } = require("../constants/enums");
const { createHttpError } = require("../utils/httpError");
const { sanitizeUser } = require("./authController");

const listUsers = asyncHandler(async (req, res) => {
  const { page, pageSize, search } = req.query;

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } }
        ]
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { region: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.user.count({ where })
  ]);

  res.json({
    items: items.map(sanitizeUser),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  });
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, regionId, isActive } = req.body;
  const normalizedEmail = String(email || "").trim().toLowerCase();

  const existingUser = await prisma.user.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: "insensitive"
      }
    }
  });
  if (existingUser) {
    throw createHttpError(409, "البريد الإلكتروني مستخدم بالفعل");
  }

  let validatedRegionId = null;

  if (role === Roles.REPRESENTATIVE) {
    const region = await prisma.region.findUnique({
      where: { id: Number(regionId) }
    });

    if (!region) {
      throw createHttpError(400, "المنطقة غير موجودة");
    }

    validatedRegionId = region.id;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      passwordHash,
      role,
      regionId: validatedRegionId,
      isActive: isActive ?? true
    },
    include: { region: true }
  });

  res.status(201).json({
    message: "تم إنشاء المستخدم",
    item: sanitizeUser(user)
  });
});

const updateUser = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  const { name, password, role, regionId, isActive } = req.body;

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    throw createHttpError(404, "المستخدم غير موجود");
  }

  const data = {};

  if (name !== undefined) {
    data.name = name;
  }

  if (isActive !== undefined) {
    data.isActive = isActive;
  }

  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  const nextRole = role || existing.role;

  if (role) {
    data.role = role;
  }

  if (nextRole === Roles.ADMIN) {
    data.regionId = null;
  } else if (regionId !== undefined) {
    if (regionId === null) {
      data.regionId = null;
    } else {
      const region = await prisma.region.findUnique({
        where: { id: Number(regionId) }
      });

      if (!region) {
        throw createHttpError(400, "المنطقة غير موجودة");
      }

      data.regionId = region.id;
    }
  }

  const nextRegionId = data.regionId !== undefined ? data.regionId : existing.regionId;
  const nextIsActive = data.isActive !== undefined ? data.isActive : existing.isActive;

  if (req.user.id === userId && nextIsActive === false) {
    throw createHttpError(400, "لا يمكنك إيقاف حسابك الحالي");
  }

  if (nextRole === Roles.REPRESENTATIVE && nextRegionId === null) {
    throw createHttpError(400, "المندوب يجب أن يكون مرتبطًا بمنطقة");
  }

  const adminPrivilegesRemoved = existing.role === Roles.ADMIN && nextRole !== Roles.ADMIN;
  const adminDisabled = existing.role === Roles.ADMIN && nextIsActive === false;

  if (adminPrivilegesRemoved || adminDisabled) {
    const otherActiveAdmins = await prisma.user.count({
      where: {
        role: Roles.ADMIN,
        isActive: true,
        id: { not: userId }
      }
    });

    if (otherActiveAdmins === 0) {
      throw createHttpError(400, "لا يمكن تعطيل أو تحويل آخر حساب أدمن نشط");
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    include: { region: true }
  });

  res.json({
    message: "تم تحديث بيانات المستخدم",
    item: sanitizeUser(updated)
  });
});

const deleteUser = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);

  if (req.user.id === userId) {
    throw createHttpError(400, "لا يمكن حذف حسابك الحالي");
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!existing) {
    throw createHttpError(404, "المستخدم غير موجود");
  }

  if (existing.role === Roles.ADMIN) {
    const otherAdmins = await prisma.user.count({
      where: {
        role: Roles.ADMIN,
        id: { not: userId }
      }
    });

    if (otherAdmins === 0) {
      throw createHttpError(400, "لا يمكن حذف آخر حساب أدمن");
    }

    if (existing.isActive) {
      const otherActiveAdmins = await prisma.user.count({
        where: {
          role: Roles.ADMIN,
          isActive: true,
          id: { not: userId }
        }
      });

      if (otherActiveAdmins === 0) {
        throw createHttpError(400, "لا يمكن حذف آخر حساب أدمن نشط");
      }
    }
  }

  const visitCount = await prisma.visitHistory.count({
    where: { visitedById: userId }
  });

  if (visitCount > 0) {
    throw createHttpError(400, "لا يمكن حذف مستخدم لديه سجل زيارات");
  }

  await prisma.user.delete({
    where: { id: userId }
  });

  res.json({
    message: "تم حذف المستخدم بنجاح"
  });
});

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deleteUser
};
