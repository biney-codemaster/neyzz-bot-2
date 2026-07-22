const config = require('../config');

function money(amount) {
  const n = Number(amount) || 0;
  return `${n.toFixed(2).replace('.', ',')} ${config.currencySymbol}`;
}

function isAdmin(member) {
  if (!member) return false;
  if (member.permissions?.has?.('Administrator')) return true;
  return config.adminRoleIds.some((id) => member.roles.cache.has(id));
}

function isStaff(member) {
  if (!member) return false;
  if (isAdmin(member)) return true;
  return config.staffRoleIds.some((id) => member.roles.cache.has(id));
}

function truncate(str, max = 100) {
  const s = String(str || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function parseQuantity(value, fallback = 1) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 99);
}

module.exports = {
  money,
  isAdmin,
  isStaff,
  truncate,
  parseQuantity,
};
