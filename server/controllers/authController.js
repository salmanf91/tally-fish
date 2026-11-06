const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { recordAuditLog } = require('../utils/auditLogger');

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * POST /api/auth/login
 * Body: { username, pin }
 */
async function login(req, res, next) {
  try {
    const { username, pin } = req.body;

    if (!username || !pin) {
      return res.status(400).json({
        success: false,
        error: 'Username and 4-digit numeric PIN are required',
      });
    }

    const pinStr = String(pin).trim();
    if (!/^\d{4}$/.test(pinStr)) {
      return res.status(400).json({
        success: false,
        error: 'PIN must be exactly 4 digits',
      });
    }

    // Lookup user
    const userResult = await db.query(
      `
      SELECT id, username, pin_hash, failed_attempts, locked_until, is_active
      FROM users
      WHERE LOWER(username) = LOWER($1)
      `,
      [username.trim()]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or PIN',
      });
    }

    const user = userResult.rows[0];

    // Check account active status
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Account is deactivated. Contact an administrator.',
      });
    }

    // Check account lockout status
    const now = new Date();
    if (user.locked_until && new Date(user.locked_until) > now) {
      const remainingMs = new Date(user.locked_until).getTime() - now.getTime();
      const remainingMins = Math.ceil(remainingMs / (60 * 1000));
      return res.status(423).json({
        success: false,
        error: `Account is locked due to ${LOCKOUT_THRESHOLD} consecutive failed attempts. Try again in ${remainingMins} minute(s).`,
        locked_until: user.locked_until,
      });
    }

    // Verify PIN with bcrypt
    const isMatch = await bcrypt.compare(pinStr, user.pin_hash);

    if (!isMatch) {
      const newFailedAttempts = (user.failed_attempts || 0) + 1;
      let newLockUntil = null;

      if (newFailedAttempts >= LOCKOUT_THRESHOLD) {
        newLockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      }

      await db.query(
        `
        UPDATE users
        SET failed_attempts = $1, locked_until = $2
        WHERE id = $3
        `,
        [newFailedAttempts, newLockUntil, user.id]
      );

      // Record failed attempt audit log
      await recordAuditLog({
        actorId: user.id,
        action: newLockUntil ? 'AUTH_ACCOUNT_LOCKED' : 'AUTH_FAILED_PIN',
        entityType: 'users',
        entityId: user.id,
        diffs: {
          failed_attempts: newFailedAttempts,
          locked: !!newLockUntil,
        },
        ipAddress: req.ip,
      });

      if (newLockUntil) {
        return res.status(423).json({
          success: false,
          error: `Too many invalid attempts. Account has been locked for 15 minutes.`,
          locked_until: newLockUntil,
        });
      }

      return res.status(401).json({
        success: false,
        error: 'Invalid username or PIN',
        remainingAttempts: LOCKOUT_THRESHOLD - newFailedAttempts,
      });
    }

    // PIN is correct: reset lockout counters
    await db.query(
      `
      UPDATE users
      SET failed_attempts = 0, locked_until = NULL
      WHERE id = $1
      `,
      [user.id]
    );

    // Fetch branches and roles assigned to this user
    const rolesResult = await db.query(
      `
      SELECT ubr.branch_id, b.name as branch_name, b.code as branch_code, ubr.role
      FROM user_branch_roles ubr
      JOIN branches b ON b.id = ubr.branch_id
      WHERE ubr.user_id = $1 AND b.is_active = true
      ORDER BY b.name ASC
      `,
      [user.id]
    );

    // Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    // Audit log successful login
    await recordAuditLog({
      actorId: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
      entityType: 'users',
      entityId: user.id,
      diffs: { username: user.username },
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
      },
      branches: rolesResult.rows,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Returns current authenticated user and their branch roles
 */
async function getCurrentUser(req, res, next) {
  try {
    const userResult = await db.query(
      `
      SELECT id, username, is_active, created_at
      FROM users
      WHERE id = $1
      `,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const rolesResult = await db.query(
      `
      SELECT ubr.branch_id, b.name as branch_name, b.code as branch_code, ubr.role
      FROM user_branch_roles ubr
      JOIN branches b ON b.id = ubr.branch_id
      WHERE ubr.user_id = $1 AND b.is_active = true
      ORDER BY b.name ASC
      `,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      user: userResult.rows[0],
      branches: rolesResult.rows,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/users
 * Admin endpoint: Create a new user with PIN and initial branch roles
 */
async function createUser(req, res, next) {
  try {
    const { username, pin, branch_roles } = req.body;

    if (!username || !pin) {
      return res.status(400).json({
        success: false,
        error: 'username and 4-digit numeric PIN are required',
      });
    }

    const pinStr = String(pin).trim();
    if (!/^\d{4}$/.test(pinStr)) {
      return res.status(400).json({
        success: false,
        error: 'PIN must be exactly 4 numeric digits',
      });
    }

    const pinHash = await bcrypt.hash(pinStr, 10);

    const result = await db.withTransaction(async (client) => {
      const userRes = await client.query(
        `
        INSERT INTO users (id, username, pin_hash, is_active)
        VALUES (gen_random_uuid(), $1, $2, true)
        RETURNING id, username, is_active, created_at
        `,
        [username.trim(), pinHash]
      );

      const newUser = userRes.rows[0];

      if (Array.isArray(branch_roles) && branch_roles.length > 0) {
        for (const br of branch_roles) {
          if (br.branch_id && br.role) {
            await client.query(
              `
              INSERT INTO user_branch_roles (id, user_id, branch_id, role)
              VALUES (gen_random_uuid(), $1, $2, $3)
              ON CONFLICT (user_id, branch_id, role) DO NOTHING
              `,
              [newUser.id, br.branch_id, br.role]
            );
          }
        }
      }

      await recordAuditLog(
        {
          actorId: req.user.id,
          action: 'USER_CREATED',
          entityType: 'users',
          entityId: newUser.id,
          diffs: { username: newUser.username, branch_roles },
          ipAddress: req.ip,
        },
        client
      );

      return newUser;
    }, { actorId: req.user.id });

    return res.status(201).json({
      success: true,
      user: result,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Username already exists',
      });
    }
    next(err);
  }
}

/**
 * POST /api/auth/reset-pin
 * Admin endpoint: Reset a user's PIN and unlock their account
 */
async function resetUserPin(req, res, next) {
  try {
    const { userId, newPin } = req.body;

    if (!userId || !newPin) {
      return res.status(400).json({
        success: false,
        error: 'userId and newPin are required',
      });
    }

    const pinStr = String(newPin).trim();
    if (!/^\d{4}$/.test(pinStr)) {
      return res.status(400).json({
        success: false,
        error: 'newPin must be exactly 4 digits',
      });
    }

    const pinHash = await bcrypt.hash(pinStr, 10);

    const updateRes = await db.query(
      `
      UPDATE users
      SET pin_hash = $1, failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, username
      `,
      [pinHash, userId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    await recordAuditLog({
      actorId: req.user.id,
      action: 'USER_PIN_RESET',
      entityType: 'users',
      entityId: userId,
      diffs: { unlocked: true },
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: `PIN reset successfully for user "${updateRes.rows[0].username}". Account unlocked.`,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  getCurrentUser,
  createUser,
  resetUserPin,
};
