const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const appleSignin = require('apple-signin-auth');
const { query, transaction } = require('../../config/database');
const { generateInviteCode, generateToken } = require('../utils/helpers');

class AuthService {
  
  // ==========================================
  // SIGN IN WITH APPLE
  // ==========================================
  
  async appleSignIn(identityToken, fullName) {
    // Verify the Apple identity token
    let appleUser;
    try {
      appleUser = await appleSignin.verifyIdToken(identityToken, {
        audience: process.env.APPLE_CLIENT_ID,
        ignoreExpiration: false,
      });
    } catch (err) {
      throw new Error('Invalid Apple identity token');
    }

    const { sub: appleUserId, email } = appleUser;

    // Check if user exists
    let result = await query('SELECT * FROM users WHERE apple_user_id = $1', [appleUserId]);
    
    if (result.rows.length > 0) {
      // Existing user — login
      const user = result.rows[0];
      await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
      return this._generateTokens(user);
    }

    // New user — register
    const displayName = fullName || (email ? email.split('@')[0] : 'Skier');
    const inviteCode = await this._uniqueInviteCode();

    result = await query(
      `INSERT INTO users (apple_user_id, email, display_name, invite_code, last_login_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [appleUserId, email, displayName, inviteCode]
    );

    return this._generateTokens(result.rows[0]);
  }

  // ==========================================
  // EMAIL + PASSWORD REGISTRATION
  // ==========================================
  
  async register(email, password, displayName) {
    // Check if email already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      throw new Error('Email already registered');
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);
    const inviteCode = await this._uniqueInviteCode();
    const name = displayName || email.split('@')[0];

    const result = await query(
      `INSERT INTO users (email, password_hash, display_name, invite_code, last_login_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [email.toLowerCase(), passwordHash, name, inviteCode]
    );

    return this._generateTokens(result.rows[0]);
  }

  // ==========================================
  // EMAIL + PASSWORD LOGIN
  // ==========================================
  
  async login(email, password) {
    const result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    
    if (result.rows.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = result.rows[0];

    if (user.is_banned) {
      throw new Error('Account suspended');
    }

    if (!user.password_hash) {
      throw new Error('This account uses Apple Sign In. Please sign in with Apple.');
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      throw new Error('Invalid email or password');
    }

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    return this._generateTokens(user);
  }

  // ==========================================
  // TOKEN REFRESH
  // ==========================================
  
  async refreshToken(refreshToken) {
    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      throw new Error('Invalid refresh token');
    }

    // Check if refresh token exists in DB and is not expired
    const result = await query(
      'SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2 AND expires_at > NOW()',
      [refreshToken, decoded.userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Refresh token expired or revoked');
    }

    // Fetch user
    const userResult = await query('SELECT * FROM users WHERE id = $1 AND is_banned = false', [decoded.userId]);
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    // Delete old refresh token
    await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);

    // Generate new tokens
    return this._generateTokens(userResult.rows[0]);
  }

  // ==========================================
  // LOGOUT
  // ==========================================
  
  async logout(userId, refreshToken) {
    if (refreshToken) {
      await query('DELETE FROM refresh_tokens WHERE token = $1 AND user_id = $2', [refreshToken, userId]);
    } else {
      // Logout all devices
      await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    }
  }

  // ==========================================
  // DELETE ACCOUNT
  // ==========================================
  
  async deleteAccount(userId) {
    await query('DELETE FROM users WHERE id = $1', [userId]);
  }

  // ==========================================
  // HELPERS
  // ==========================================
  
  async _generateTokens(user) {
    const payload = { userId: user.id, email: user.email };

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    });

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    
    await query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, expiresAt]
    );

    // Clean up old refresh tokens (keep last 5 per user)
    await query(`
      DELETE FROM refresh_tokens WHERE id IN (
        SELECT id FROM refresh_tokens WHERE user_id = $1
        ORDER BY created_at DESC OFFSET 5
      )
    `, [user.id]);

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        inviteCode: user.invite_code,
        useMetric: user.use_metric,
        createdAt: user.created_at,
      },
      accessToken,
      refreshToken,
    };
  }

  async _uniqueInviteCode() {
    let code;
    let attempts = 0;
    do {
      code = generateInviteCode();
      const existing = await query('SELECT id FROM users WHERE invite_code = $1', [code]);
      if (existing.rows.length === 0) return code;
      attempts++;
    } while (attempts < 10);
    
    // Fallback to UUID-based code
    return `SKI-${Date.now().toString(36).toUpperCase().slice(-7)}`;
  }
}

module.exports = new AuthService();
