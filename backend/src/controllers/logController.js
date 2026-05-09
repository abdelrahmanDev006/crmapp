const prisma = require("../config/prisma");
const asyncHandler = require("../middlewares/asyncHandler");

const getLogs = asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(pageSize);
  
  const [items, total] = await Promise.all([
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(pageSize),
      include: {
        user: { select: { name: true, role: true } }
      }
    }),
    prisma.activityLog.count()
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
