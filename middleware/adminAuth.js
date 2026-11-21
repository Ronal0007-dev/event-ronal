'use strict';

function requireAdmin(req, res, next) {
  if (req.session?.adminAuthenticated) return next();
  return res.redirect('/admin/login');
}

function redirectIfAdmin(req, res, next) {
  if (req.session?.adminAuthenticated) return res.redirect('/admin');
  return next();
}

module.exports = { requireAdmin, redirectIfAdmin };
