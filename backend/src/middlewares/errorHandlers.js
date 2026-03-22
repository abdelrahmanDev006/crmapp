function notFound(req, res) {
  res.status(404).json({
    message: "المسار غير موجود"
  });
}

function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || 500;

  if (process.env.NODE_ENV !== "production") {
    console.error(error);
  }

  res.status(statusCode).json({
    message: error.message || "حدث خطأ غير متوقع",
    ...(process.env.NODE_ENV !== "production" && { stack: error.stack })
  });
}

module.exports = {
  notFound,
  errorHandler
};
