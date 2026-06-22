const jwt = require("jsonwebtoken");
const env = require("../config/env");

function generateToken(user) {
  const regionIds = Array.isArray(user.regions) ? user.regions.map((region) => region.id) : [];

  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      regionIds,
      tver: user.tokenVersion || 0
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

module.exports = {
  generateToken,
  verifyToken
};
