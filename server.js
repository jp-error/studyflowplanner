'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const { Pool } = require('pg');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const sessionCookie = 'studyflow_session';
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Configure a PostgreSQL database for this service.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : undefined,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(express.json({ limit: '1mb' }));

const authAttempts = new Map();
function allowAuthAttempt(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const entry = authAttempts.get(key);
  if (!entry || now - entry.startedAt > 15 * 60 * 1000) {
    authAttempts.set(key, { startedAt: now, count: 1 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 20) return res.status(429).json({ error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' });
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of authAttempts) {
    if (now - entry.startedAt > 15 * 60 * 1000) authAttempts.delete(key);
  }
}, 15 * 60 * 1000).unref();

function parseCookie(header, name) {
  for (const part of (header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return '';
}

function setSessionCookie(res, token, maxAgeSeconds) {
  const bits = [`${sessionCookie}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (isProduction) bits.push('Secure');
  res.setHeader('Set-Cookie', bits.join('; '));
}

function newPlanner() {
  return { goal: 12, subjects: [], tasks: [], exams: [] };
}

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validPassword(value) {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') >= 10 && Buffer.byteLength(value, 'utf8') <= 128;
}

async function makePasswordHash(password, salt) {
  return scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

async function requireUser(req, res, next) {
  try {
    const token = parseCookie(req.headers.cookie, sessionCookie);
    if (!/^[a-f0-9]{64}$/.test(token)) return res.status(401).json({ error: 'Please sign in.' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query(
      'SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()',
      [tokenHash]
    );
    if (!result.rowCount) return res.status(401).json({ error: 'Please sign in.' });
    req.user = result.rows[0];
    req.sessionHash = tokenHash;
    next();
  } catch (error) {
    next(error);
  }
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/auth/signup', allowAuthAttempt, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = req.body?.password;
    if (!/^[a-z0-9_-]{3,32}$/.test(username)) {
      return res.status(400).json({ error: 'Use a username with 3–32 letters, numbers, underscores, or hyphens.' });
    }
    if (!validPassword(password)) return res.status(400).json({ error: 'Use a password that is 10–128 characters long.' });

    const userId = crypto.randomUUID();
    const salt = crypto.randomBytes(16);
    const passwordHash = await makePasswordHash(password, salt);
    await pool.query(
      'INSERT INTO users (id, username, password_salt, password_hash, planner_data) VALUES ($1, $2, $3, $4, $5::jsonb)',
      [userId, username, salt.toString('hex'), passwordHash.toString('hex'), JSON.stringify(newPlanner())]
    );
    await createSession(userId, res);
    res.status(201).json({ user: { id: userId, username } });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'That username is already taken.' });
    next(error);
  }
});

app.post('/api/auth/login', allowAuthAttempt, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = req.body?.password;
    if (!/^[a-z0-9_-]{3,32}$/.test(username) || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 128) {
      return res.status(401).json({ error: 'Username or password is incorrect.' });
    }
    const result = await pool.query('SELECT id, username, password_salt, password_hash FROM users WHERE username = $1', [username]);
    if (!result.rowCount) return res.status(401).json({ error: 'Username or password is incorrect.' });
    const user = result.rows[0];
    const expected = Buffer.from(user.password_hash, 'hex');
    const actual = await makePasswordHash(password, Buffer.from(user.password_salt, 'hex'));
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      return res.status(401).json({ error: 'Username or password is incorrect.' });
    }
    await createSession(user.id, res);
    res.json({ user: { id: user.id, username: user.username } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', async (req, res, next) => {
  try {
    const token = parseCookie(req.headers.cookie, sessionCookie);
    if (/^[a-f0-9]{64}$/.test(token)) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    }
    setSessionCookie(res, '', 0);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', requireUser, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/planner', requireUser, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT planner_data FROM users WHERE id = $1', [req.user.id]);
    if (!result.rowCount) return res.status(401).json({ error: 'Please sign in.' });
    res.json({ planner: result.rows[0].planner_data });
  } catch (error) {
    next(error);
  }
});

app.put('/api/planner', requireUser, async (req, res, next) => {
  try {
    const planner = req.body?.planner;
    if (!planner || typeof planner !== 'object' || Array.isArray(planner) ||
        !Array.isArray(planner.subjects) || !Array.isArray(planner.tasks) || !Array.isArray(planner.exams) ||
        planner.subjects.length > 500 || planner.tasks.length > 2000 || planner.exams.length > 500 ||
        !Number.isFinite(Number(planner.goal)) || Number(planner.goal) < 1 || Number(planner.goal) > 100) {
      return res.status(400).json({ error: 'Planner data is invalid or too large.' });
    }
    const result = await pool.query('UPDATE users SET planner_data = $2::jsonb WHERE id = $1', [req.user.id, JSON.stringify(planner)]);
    if (!result.rowCount) return res.status(401).json({ error: 'Please sign in.' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'The server could not complete that request. Please try again.' });
});

async function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);
  await pool.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [tokenHash, userId, expiresAt]);
  setSessionCookie(res, token, Math.floor(sessionLifetimeMs / 1000));
}

async function start() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      username VARCHAR(32) NOT NULL UNIQUE,
      password_salt CHAR(32) NOT NULL,
      password_hash CHAR(128) NOT NULL,
      planner_data JSONB NOT NULL DEFAULT '{"goal":12,"subjects":[],"tasks":[],"exams":[]}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash CHAR(64) PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expiration_idx ON sessions(expires_at);
  `);
  await pool.query('DELETE FROM sessions WHERE expires_at <= NOW()');
  const port = Number(process.env.PORT) || 10000;
  app.listen(port, '0.0.0.0', () => console.log(`Studyflow listening on port ${port}`));
}

start().catch(error => {
  console.error('Could not initialize Studyflow:', error);
  process.exit(1);
});
