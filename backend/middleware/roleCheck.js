// Usage: router.get('/route', protect, authorize('admin'), handler)
// Must be used AFTER the `protect` middleware, since it relies on req.user.
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Requires one of these roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
};

module.exports = { authorize };
