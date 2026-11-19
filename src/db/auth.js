const { db, hashPassword, verifyPassword } = require('./database');
const crypto = require('node:crypto');

function login(usernameOrEmail, password, rememberMe = true) {
  if (!usernameOrEmail || !password) {
    throw new Error('Username/email and password are required');
  }

  const user = db.prepare(`
    SELECT * FROM users
    WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
  `).get(usernameOrEmail.trim(), usernameOrEmail.trim());

  if (!user) {
    throw new Error('Invalid username/email or password');
  }

  const isValid = verifyPassword(password, user.password_hash, user.salt);
  if (!isValid) {
    throw new Error('Invalid username/email or password');
  }

  // Create session token
  const token = crypto.randomBytes(32).toString('hex');
  const durationDays = rememberMe ? 30 : 1;
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(token, user.id, expiresAt);

  const { password_hash, salt, ...safeUser } = user;
  safeUser.owner_whatsapp = safeUser.owner_whatsapp || safeUser.phone || '+91 98765 43210';
  return { token, user: safeUser };
}

function authenticate(token) {
  if (!token) return null;

  // Clean expired sessions
  const now = new Date().toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);

  const session = db.prepare(`
    SELECT s.token, s.expires_at, u.id, u.username, u.email, u.cafe_name, u.phone,
           COALESCE(u.owner_whatsapp, u.phone) as owner_whatsapp,
           u.address, u.gstin, u.currency_symbol, u.receipt_footer
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, now);

  return session || null;
}

function logout(token) {
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  return true;
}

function updateProfile(userId, data = {}) {
  const { cafe_name, phone, owner_whatsapp, address, gstin, receipt_footer, currency_symbol } = data;
  const whatsappNum = (owner_whatsapp !== undefined && owner_whatsapp !== null) ? owner_whatsapp : (phone !== undefined ? phone : null);

  db.prepare(`
    UPDATE users
    SET cafe_name = COALESCE(?, cafe_name),
        phone = COALESCE(?, phone),
        owner_whatsapp = COALESCE(?, owner_whatsapp),
        address = COALESCE(?, address),
        gstin = COALESCE(?, gstin),
        receipt_footer = COALESCE(?, receipt_footer),
        currency_symbol = COALESCE(?, currency_symbol)
    WHERE id = ?
  `).run(
    cafe_name ?? null,
    phone ?? null,
    whatsappNum ?? null,
    address ?? null,
    gstin ?? null,
    receipt_footer ?? null,
    currency_symbol ?? null,
    userId
  );

  const user = db.prepare('SELECT id, username, email, cafe_name, phone, owner_whatsapp, address, gstin, currency_symbol, receipt_footer FROM users WHERE id = ?').get(userId);
  return user;
}

function changePassword(userId, oldPassword, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters');
  }

  const user = db.prepare('SELECT password_hash, salt FROM users WHERE id = ?').get(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const isValid = verifyPassword(oldPassword, user.password_hash, user.salt);
  if (!isValid) {
    throw new Error('Current password is incorrect');
  }

  const { hash, salt } = hashPassword(newPassword);
  db.prepare(`
    UPDATE users
    SET password_hash = ?, salt = ?
    WHERE id = ?
  `).run(hash, salt, userId);

  return true;
}

module.exports = {
  login,
  authenticate,
  logout,
  updateProfile,
  changePassword
};

