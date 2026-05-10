const prisma = require("../config/prisma");
const asyncHandler = require("../middlewares/asyncHandler");

const getLogs = asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 20, search, date } = req.query;
  const skip = (Number(page) - 1) * Number(pageSize);
  
  const where = {};

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    where.createdAt = {
      gte: startOfDay,
      lte: endOfDay
    };
  }

  if (search) {
    const trimmedSearch = String(search).trim();
    where.OR = [
      { details: { contains: trimmedSearch, mode: "insensitive" } },
      { entityName: { contains: trimmedSearch, mode: "insensitive" } },
      { action: { contains: trimmedSearch, mode: "insensitive" } },
      {
        user: {
          name: { contains: trimmedSearch, mode: "insensitive" }
        }
      }
    ];
  }

  const [items, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(pageSize),
      include: {
        user: { select: { name: true, role: true } }
      }
    }),
    prisma.activityLog.count({ where })
  ]);

  res.json({
    items,
    total,
    page: Number(page),
    pageSize: Number(pageSize),
    totalPages: Math.ceil(total / Number(pageSize))
  });
});

module.exports = {
  getLogs
};
