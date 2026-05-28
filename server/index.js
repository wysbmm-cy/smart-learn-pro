/* eslint-env node */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { statements, toPublicUser } from './db.js';

const loadLocalEnv = () => {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

loadLocalEnv();

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGINS = String(process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const DEFAULT_CLIENT_ORIGIN = CLIENT_ORIGINS[0] || 'http://localhost:5173';
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'verbapath_session';
const SESSION_DAYS = Number(process.env.AUTH_SESSION_DAYS || 30);
const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const IS_PROD = process.env.NODE_ENV === 'production';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROXY_ACCESS_TOKEN = String(process.env.PROXY_ACCESS_TOKEN || '').trim();
const PROXY_RATE_LIMIT_WINDOW_MS = Number(process.env.PROXY_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const PROXY_RATE_LIMIT_MAX = Number(process.env.PROXY_RATE_LIMIT_MAX || 40);
const AI_PROXY_BASE_URL = process.env.AI_PROXY_BASE_URL || 'https://api.deepseek.com/v1';
const AI_PROXY_API_KEY = process.env.AI_PROXY_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.MOONSHOT_API_KEY || '';
const AI_PROXY_MODEL = process.env.AI_PROXY_MODEL || 'deepseek-v4-flash';
const AUDIO_PROXY_BASE_URL = process.env.AUDIO_PROXY_BASE_URL || 'https://api.siliconflow.cn/v1';
const AUDIO_PROXY_API_KEY = process.env.AUDIO_PROXY_API_KEY || process.env.SILICONFLOW_API_KEY || '';
const TTS_PROXY_BASE_URL = process.env.TTS_PROXY_BASE_URL || 'https://openrouter.ai/api/v1';
const TTS_PROXY_API_KEY = process.env.TTS_PROXY_API_KEY || process.env.OPENROUTER_API_KEY || AUDIO_PROXY_API_KEY;
const IMAGE_PROXY_BASE_URL = process.env.IMAGE_PROXY_BASE_URL || AI_PROXY_BASE_URL;
const IMAGE_PROXY_API_KEY = process.env.IMAGE_PROXY_API_KEY || AI_PROXY_API_KEY;
const IMAGE_PROXY_MODEL = process.env.IMAGE_PROXY_MODEL || 'dall-e-3';

const now = () => Date.now();
const createId = (prefix) => `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const rateLimitBuckets = new Map();

const requestOrigin = (req) => String(req.headers.origin || '').replace(/\/+$/, '');
const isAllowedOrigin = (req) => {
  const origin = requestOrigin(req);
  return !origin || CLIENT_ORIGINS.includes(origin);
};
const corsOrigin = (req) => {
  const origin = requestOrigin(req);
  return origin && CLIENT_ORIGINS.includes(origin) ? origin : DEFAULT_CLIENT_ORIGIN;
};
const baseHeaders = (req, contentType = 'application/json; charset=utf-8') => ({
  'Content-Type': contentType,
  'Access-Control-Allow-Origin': corsOrigin(req),
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-VerbaPath-Proxy-Token',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Vary': 'Origin',
  'X-Content-Type-Options': 'nosniff',
});

const json = (req, res, status, payload, extraHeaders = {}) => {
  res.writeHead(status, {
    ...baseHeaders(req),
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

const readRawBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
};

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
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

  if (!emailPattern.test(email)) return json(req, res, 400, { error: '邮箱格式不正确' });
  if (password.length < 8) return json(req, res, 400, { error: '密码至少需要 8 位' });
  if (statements.findUserByEmail.get(email)) return json(req, res, 409, { error: '该邮箱已经注册' });

  const createdAt = now();
  const userId = createId('user');
  statements.insertUser.run(userId, email, hashPassword(password), nickname, createdAt, createdAt);
  const user = statements.findUserById.get(userId);
  const sessionId = createSession(userId);
  return json(req, res, 201, { user: toPublicUser(user) }, { 'Set-Cookie': sessionCookie(sessionId) });
};

const handleLogin = async (req, res) => {
  const body = await readBody(req);
  const user = statements.findUserByEmail.get(normalizeEmail(body.email));
  if (!user || !verifyPassword(String(body.password || ''), user.password_hash)) {
    return json(req, res, 401, { error: '邮箱或密码不正确' });
  }
  const sessionId = createSession(user.id);
  return json(req, res, 200, { user: toPublicUser(user) }, { 'Set-Cookie': sessionCookie(sessionId) });
};

const handleLogout = (req, res) => {
  const sessionId = parseCookies(req)[COOKIE_NAME];
  if (sessionId) statements.deleteSession.run(sessionId);
  return json(req, res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
};

const normalizeBaseUrl = (value) => String(value || '').replace(/\/+$/, '');

const clientIp = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
};

const hasProxyAccess = (req) => {
  if (!PROXY_ACCESS_TOKEN) return true;
  return safeEqual(req.headers['x-verbapath-proxy-token'], PROXY_ACCESS_TOKEN);
};

const consumeProxyRateLimit = (req, prefix) => {
  if (!PROXY_RATE_LIMIT_MAX || PROXY_RATE_LIMIT_MAX <= 0) return true;
  const nowMs = now();
  const key = `${clientIp(req)}:${prefix}`;
  const current = rateLimitBuckets.get(key);
  if (!current || current.resetAt <= nowMs) {
    rateLimitBuckets.set(key, { count: 1, resetAt: nowMs + PROXY_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  current.count += 1;
  return current.count <= PROXY_RATE_LIMIT_MAX;
};

const guardProxyRequest = (req, res, prefix) => {
  if (!hasProxyAccess(req)) {
    json(req, res, 401, { error: 'Proxy access token is required' });
    return false;
  }
  if (!consumeProxyRateLimit(req, prefix)) {
    json(req, res, 429, { error: 'Too many proxy requests. Please try again later.' });
    return false;
  }
  return true;
};

const proxyProviderRequest = async (req, res, url, config) => {
  const { prefix, baseUrl, apiKey, defaultModel } = config;
  if (!guardProxyRequest(req, res, prefix)) return;
  if (!apiKey) {
    return json(req, res, 500, { error: '服务器未配置上游服务密钥' });
  }

  const cleanBase = normalizeBaseUrl(baseUrl);
  const upstreamPath = url.pathname.slice(prefix.length) || '/';
  const upstreamUrl = `${cleanBase}${upstreamPath}${url.search || ''}`;
  const contentType = req.headers['content-type'] || 'application/json';
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': contentType,
  };

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const raw = await readRawBody(req);
    if (contentType.includes('application/json')) {
      const parsed = raw.length ? JSON.parse(raw.toString('utf8')) : {};
      if ((!parsed.model || parsed.model === 'server-managed') && defaultModel) {
        parsed.model = defaultModel;
      }
      body = JSON.stringify(parsed);
    } else {
      body = raw;
    }
  }

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body,
  });
  const upstreamContentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
  res.writeHead(upstream.status, baseHeaders(req, upstreamContentType));
  const responseBuffer = Buffer.from(await upstream.arrayBuffer());
  return res.end(responseBuffer);
};

const server = http.createServer(async (req, res) => {
  try {
    if (!isAllowedOrigin(req)) {
      return json(req, res, 403, { error: 'Origin is not allowed' });
    }
    if (req.method === 'OPTIONS') return json(req, res, 204, {});

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(req, res, 200, { ok: true, service: 'verbapath-api' });
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      statements.deleteExpiredSessions.run(now());
      return json(req, res, 200, { user: toPublicUser(readSessionUser(req, res)) });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/register') return handleRegister(req, res);
    if (req.method === 'POST' && url.pathname === '/api/auth/login') return handleLogin(req, res);
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') return handleLogout(req, res);
    if (url.pathname.startsWith('/api/ai/')) {
      return proxyProviderRequest(req, res, url, {
        prefix: '/api/ai',
        baseUrl: AI_PROXY_BASE_URL,
        apiKey: AI_PROXY_API_KEY,
        defaultModel: AI_PROXY_MODEL,
      });
    }
    if (url.pathname.startsWith('/api/audio/')) {
      return proxyProviderRequest(req, res, url, {
        prefix: '/api/audio',
        baseUrl: AUDIO_PROXY_BASE_URL,
        apiKey: AUDIO_PROXY_API_KEY,
      });
    }
    if (url.pathname.startsWith('/api/tts/')) {
      return proxyProviderRequest(req, res, url, {
        prefix: '/api/tts',
        baseUrl: TTS_PROXY_BASE_URL,
        apiKey: TTS_PROXY_API_KEY,
      });
    }
    if (url.pathname.startsWith('/api/image/')) {
      return proxyProviderRequest(req, res, url, {
        prefix: '/api/image',
        baseUrl: IMAGE_PROXY_BASE_URL,
        apiKey: IMAGE_PROXY_API_KEY,
        defaultModel: IMAGE_PROXY_MODEL,
      });
    }

    return json(req, res, 404, { error: '接口不存在' });
  } catch (error) {
    console.error(error);
    return json(req, res, 500, { error: '服务器内部错误' });
  }
});

server.listen(PORT, () => {
  console.log(`VerbaPath API server listening on http://localhost:${PORT}`);
});
