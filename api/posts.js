// Vercel Serverless Function: /api/posts
// GET    → 投稿一覧を返す
// POST   → 投稿を追加する  (body: { title, text })
// DELETE → 投稿を削除する  (query: ?id=xxx)

import postgres from 'postgres';

let _sql = null;

function getDb() {
  if (!_sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('DATABASE_URL が設定されていません');
    _sql = postgres(url, { ssl: 'require', max: 1 });
  }
  return _sql;
}

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS posts (
      id         SERIAL PRIMARY KEY,
      title      TEXT    NOT NULL DEFAULT '',
      text       TEXT    NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

function isAuthorized(req) {
  const expected = process.env.AUTH_TOKEN;
  if (!expected) return true;
  return req.headers['x-auth-token'] === expected;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-auth-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'パスワードが違います' });
  }

  try {
    const sql = getDb();
    await ensureTable(sql);

    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM posts ORDER BY created_at DESC`;
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { title = '', text } = req.body ?? {};
      if (!text?.trim()) {
        return res.status(400).json({ error: 'テキストは必須です' });
      }
      const [row] = await sql`
        INSERT INTO posts (title, text)
        VALUES (${title.trim()}, ${text.trim()})
        RETURNING *
      `;
      return res.status(201).json(row);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id が必要です' });
      await sql`DELETE FROM posts WHERE id = ${id}`;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[posts]', err);
    return res.status(500).json({ error: err.message });
  }
}
