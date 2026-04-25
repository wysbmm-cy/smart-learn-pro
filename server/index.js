import crypto from 'node:crypto';
import http from 'node:http';
import { statements, toPublicUser } from './db.js';

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'verbapath_session';
const SESSION_DAYS = Number(process.env.AUTH_SESSION_DAYS || 30);
const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const IS_PROD = process.env.NODE_ENV === 'production';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const now = () => Date.now();
const createId = (prefix) => `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const json = (res, status, payload, extraHeaders = {}) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': CLIENT_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
};

const parseCookies = (req) => {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').map((part) => {
    const [key, ...rest] = part.trim().split('=');
    return [key, decodeURIComponent(rest.join('=') || '')];
  }).filter(([key]) => key));
};

const sessionCookie = (sessionId) => {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}`,
  ];
  if (IS_PROD) parts.push('Secure');
  return parts.join('; ');
};

const clearCookie = () => `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${IS_PROD ? '; Secure' : ''}`;

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
};

const verifyPassword = (password, stored) => {
  const [method, salt, hash] = String(stored || '').split('$');
  if (method !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
};

const createSession = (userId) => {
  const sessionId = createId('sess');
  statements.insertSession.run(sessionId, userId, now() + SESSION_MAX_AGE_MS, now());
  return sessionId;
};

const readSessionUser = (req, res) => {
  const sessionId = parseCookies(req)[COOKIE_NAME];
  if (!sessionId) return null;

  const session = statements.findSession.get(sessionId);
  if (!session || session.expires_at <= now()) {
    statements.deleteSession.run(sessionId);
    res.setHeader('Set-Cookie', clearCookie());
    return null;
  }

  return statements.findUserById.get(session.user_id) || null;
};

const handleRegister = async (req, res) => {
  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const nickname = String(body.nickname || '').trim().slice(0, 50);

  if (!emailPattern.test(email)) return json(res, 400, { error: '邮箱格式不正确' });
  if (password.length < 8) return json(res, 400, { error: '密码至少需要 8 位' });
  if (statements.findUserByEmail.get(email)) return json(res, 409, { error: '该邮箱已经注册' });

  const createdAt = now();
  const userId = createId('user');
  statements.insertUser.run(userId, email, hashPassword(password), nickname, createdAt, createdAt);
  const user = statements.findUserById.get(userId);
  const sessionId = createSession(userId);
  return json(res, 201, { user: toPublicUser(user) }, { 'Set-Cookie': sessionCookie(sessionId) });
};

const handleLogin = async (req, res) => {
  const body = await readBody(req);
  const user = statements.findUserByEmail.get(normalizeEmail(body.email));
  if (!user || !verifyPassword(String(body.password || ''), user.password_hash)) {
    return json(res, 401, { error: '邮箱或密码不正确' });
  }
  const sessionId = createSession(user.id);
  return json(res, 200, { user: toPublicUser(user) }, { 'Set-Cookie': sessionCookie(sessionId) });
};

const handleLogout = (req, res) => {
  const sessionId = parseCookies(req)[COOKIE_NAME];
  if (sessionId) statements.deleteSession.run(sessionId);
  return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, { ok: true, service: 'verbapath-auth' });
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      statements.deleteExpiredSessions.run(now());
      return json(res, 200, { user: toPublicUser(readSessionUser(req, res)) });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/register') return handleRegister(req, res);
    if (req.method === 'POST' && url.pathname === '/api/auth/login') return handleLogin(req, res);
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') return handleLogout(req, res);

    return json(res, 404, { error: '接口不存在' });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: '服务器内部错误' });
  }
});

server.listen(PORT, () => {
  console.log(`VerbaPath auth server listening on http://localhost:${PORT}`);
});
