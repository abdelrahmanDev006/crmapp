const { createHttpError } = require("../utils/httpError");

function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const message = result.error.issues.map((issue) => issue.message).join(" | ");
      return next(createHttpError(400, message));
    }

    req[source] = result.data;
    return next();
  };
}

module.exports = validate;
