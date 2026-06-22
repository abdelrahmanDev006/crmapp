function notFound(req, res) {
  res.status(404).json({
    message: "المسار غير موجود"
  });
}

function errorHandler(error, req, res, _next) {
  const isUniqueConstraintError = error.code === "P2002" || error.code === "23505";
  const statusCode = isUniqueConstraintError ? 409 : error.statusCode || 500;
  const message = isUniqueConstraintError
    ? "البيانات مكررة بالفعل"
    : error.message || "حدث خطأ غير متوقع";

  if (process.env.NODE_ENV !== "production") {
    console.error(error);
  }

  res.status(statusCode).json({
    message,
    ...(process.env.NODE_ENV !== "production" && { stack: error.stack })
  });
}

module.exports = {
  notFound,
  errorHandler
};
