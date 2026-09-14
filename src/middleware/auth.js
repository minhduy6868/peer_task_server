const jwt = require('jsonwebtoken');
const { sendError } = require('./errorHandler');

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return sendError(res, 401, 'Access token required', 'UNAUTHORIZED');
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      const expired = err.name === 'TokenExpiredError';
      return sendError(
        res,
        expired ? 401 : 403,
        expired ? 'Token expired' : 'Invalid or expired token',
        expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
      );
    }
    req.user = user;
    next();
  });
}

module.exports = { authenticateToken };
