const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const asyncHandler = require("../middlewares/asyncHandler");
const { Roles } = require("../constants/enums");
const { createHttpError } = require("../utils/httpError");
const { sanitizeUser } = require("./authController");
const { logActivity } = require("../services/logService");

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
      include: { regions: true },
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
  const { name, email, password, role, regionIds, isActive } = req.body;
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

  let validRegionIds = [];

  if (role === Roles.REPRESENTATIVE) {
    if (!regionIds || regionIds.length === 0) {
      throw createHttpError(400, "يجب تحديد منطقة واحدة على الأقل للمندوب");
    }

    const regions = await prisma.region.findMany({
      where: { id: { in: regionIds } }
    });

    if (regions.length !== regionIds.length) {
      throw createHttpError(400, "بعض المناطق غير موجودة");
    }

    validRegionIds = regions.map(r => r.id);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      passwordHash,
      role,
      regions: {
        connect: validRegionIds.map(id => ({ id }))
      },
      isActive: isActive ?? true
    },
    include: { regions: true }
  });

  await logActivity({
    userId: req.user.id,
    action: "CREATE_USER",
    entityType: "USER",
    entityId: user.id,
    entityName: user.name,
    details: `تم إضافة ${role === Roles.ADMIN ? 'مدير' : 'مندوب'} جديد: ${user.name}`
  });

  res.status(201).json({
    message: "تم إنشاء المستخدم",
    item: sanitizeUser(user)
  });
});

const updateUser = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  const { name, password, role, regionIds, isActive } = req.body;

  const existing = await prisma.user.findUnique({ 
    where: { id: userId },
    include: { regions: true }
  });
  
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

  if (req.body.allowedDate !== undefined) {
    data.allowedDate = req.body.allowedDate;
  }

  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  const nextRole = role || existing.role;

  if (role) {
    data.role = role;
  }

  let nextRegionIds = existing.regions.map(r => r.id);

  if (nextRole === Roles.ADMIN) {
    data.regions = { set: [] };
    nextRegionIds = [];
  } else if (regionIds !== undefined) {
    if (regionIds.length === 0) {
      if (nextRole === Roles.REPRESENTATIVE) {
        throw createHttpError(400, "المندوب يجب أن يكون مرتبطًا بمنطقة واحدة على الأقل");
      }
      data.regions = { set: [] };
      nextRegionIds = [];
    } else {
      const regions = await prisma.region.findMany({
        where: { id: { in: regionIds } }
      });

      if (regions.length !== regionIds.length) {
        throw createHttpError(400, "بعض المناطق غير موجودة");
      }

      data.regions = { set: regions.map(r => ({ id: r.id })) };
      nextRegionIds = regions.map(r => r.id);
    }
  }

  const nextIsActive = data.isActive !== undefined ? data.isActive : existing.isActive;

  if (req.user.id === userId && nextIsActive === false) {
    throw createHttpError(400, "لا يمكنك إيقاف حسابك الحالي");
  }

  if (nextRole === Roles.REPRESENTATIVE && nextRegionIds.length === 0) {
    throw createHttpError(400, "المندوب يجب أن يكون مرتبطًا بمنطقة واحدة على الأقل");
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
    include: { regions: true }
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
