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

    const rolesToAssign = Array.isArray(branch_roles) && branch_roles.length > 0
      ? branch_roles
      : req.body.branch_id && req.body.role
      ? [{ branch_id: req.body.branch_id, role: req.body.role }]
      : [];

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

      if (rolesToAssign.length > 0) {
        for (const br of rolesToAssign) {
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
          diffs: { username: newUser.username, branch_roles: rolesToAssign },
          ipAddress: req.ip,
        },
        client
      );

      const userFullRes = await client.query(`
        SELECT 
          u.id, 
          u.username, 
          u.is_active, 
          u.failed_attempts,
          u.locked_until,
          u.created_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', ubr.id,
                'branch_id', ubr.branch_id,
                'branch_name', b.name,
                'branch_code', b.code,
                'role', ubr.role
              )
            ) FILTER (WHERE ubr.id IS NOT NULL),
            '[]'::json
          ) as branch_roles
        FROM users u
        LEFT JOIN user_branch_roles ubr ON ubr.user_id = u.id
        LEFT JOIN branches b ON b.id = ubr.branch_id AND b.is_active = true
        WHERE u.id = $1
        GROUP BY u.id
      `, [newUser.id]);

      return userFullRes.rows[0];
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

/**
 * GET /api/auth/users
 * Admin endpoint: List all users with their branch roles
 */
async function listUsers(req, res, next) {
  try {
    const result = await db.query(`
      SELECT 
        u.id, 
        u.username, 
        u.is_active, 
        u.failed_attempts,
        u.locked_until,
        u.created_at,
        u.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ubr.id,
              'branch_id', ubr.branch_id,
              'branch_name', b.name,
              'branch_code', b.code,
              'role', ubr.role
            )
          ) FILTER (WHERE ubr.id IS NOT NULL),
          '[]'::json
        ) as branch_roles
      FROM users u
      LEFT JOIN user_branch_roles ubr ON ubr.user_id = u.id
      LEFT JOIN branches b ON b.id = ubr.branch_id AND b.is_active = true
      GROUP BY u.id
      ORDER BY u.created_at ASC
    `);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/branches
 * List all active operating branches
 */
async function listBranches(req, res, next) {
  try {
    const result = await db.query(
      'SELECT id, name, code, is_active FROM branches WHERE is_active = true ORDER BY name ASC'
    );
    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/auth/users/:id
 * Admin endpoint: Update a user's username, active status, PIN, and/or branch roles
 */
async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { username, is_active, pin, branch_roles, branch_id, role } = req.body;

    const result = await db.withTransaction(async (client) => {
      const existingRes = await client.query('SELECT id, username, is_active FROM users WHERE id = $1', [id]);
      if (existingRes.rows.length === 0) {
        const err = new Error('User not found');
        err.statusCode = 404;
        throw err;
      }

      const updates = [];
      const values = [];
      let valIdx = 1;

      if (username && username.trim()) {
        updates.push(`username = $${valIdx++}`);
        values.push(username.trim());
      }
      if (typeof is_active === 'boolean') {
        updates.push(`is_active = $${valIdx++}`);
        values.push(is_active);
      }
      if (pin) {
        const pinStr = String(pin).trim();
        if (!/^\d{4}$/.test(pinStr)) {
          const err = new Error('PIN must be exactly 4 numeric digits');
          err.statusCode = 400;
          throw err;
        }
        const pinHash = await bcrypt.hash(pinStr, 10);
        updates.push(`pin_hash = $${valIdx++}`);
        values.push(pinHash);
        updates.push(`failed_attempts = 0`);
        updates.push(`locked_until = NULL`);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);
        await client.query(
          `UPDATE users SET ${updates.join(', ')} WHERE id = $${valIdx}`,
          values
        );
      }

      // Handle branch roles assignment
      let rolesToAssign = null;
      if (Array.isArray(branch_roles)) {
        rolesToAssign = branch_roles;
      } else if (branch_id && role) {
        rolesToAssign = [{ branch_id, role }];
      }

      if (rolesToAssign !== null) {
        await client.query('DELETE FROM user_branch_roles WHERE user_id = $1', [id]);
        for (const br of rolesToAssign) {
          if (br.branch_id && br.role) {
            await client.query(
              `
              INSERT INTO user_branch_roles (id, user_id, branch_id, role)
              VALUES (gen_random_uuid(), $1, $2, $3)
              ON CONFLICT (user_id, branch_id, role) DO NOTHING
              `,
              [id, br.branch_id, br.role]
            );
          }
        }
      }

      await recordAuditLog(
        {
          actorId: req.user.id,
          action: 'USER_UPDATED',
          entityType: 'users',
          entityId: id,
          diffs: { username, is_active, branch_roles: rolesToAssign },
          ipAddress: req.ip,
        },
        client
      );

      const updatedUserRes = await client.query(`
        SELECT 
          u.id, 
          u.username, 
          u.is_active, 
          u.failed_attempts,
          u.locked_until,
          u.created_at,
          u.updated_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', ubr.id,
                'branch_id', ubr.branch_id,
                'branch_name', b.name,
                'branch_code', b.code,
                'role', ubr.role
              )
            ) FILTER (WHERE ubr.id IS NOT NULL),
            '[]'::json
          ) as branch_roles
        FROM users u
        LEFT JOIN user_branch_roles ubr ON ubr.user_id = u.id
        LEFT JOIN branches b ON b.id = ubr.branch_id AND b.is_active = true
        WHERE u.id = $1
        GROUP BY u.id
      `, [id]);

      return updatedUserRes.rows[0];
    }, { actorId: req.user.id });

    return res.status(200).json({
      success: true,
      user: result,
      message: 'User updated successfully',
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Username already exists' });
    }
    next(err);
  }
}

/**
 * DELETE /api/auth/users/:id
 * Admin endpoint: Deactivate a user account
 */
async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot deactivate your own active session account',
      });
    }

    const result = await db.query(
      `
      UPDATE users
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, username, is_active
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    await recordAuditLog({
      actorId: req.user.id,
      action: 'USER_DEACTIVATED',
      entityType: 'users',
      entityId: id,
      diffs: { is_active: false },
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: `User "${result.rows[0].username}" deactivated successfully.`,
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
  listUsers,
  listBranches,
  updateUser,
  deleteUser,
};

