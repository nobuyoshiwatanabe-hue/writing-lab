// Vercel Serverless Function: /api/ai
// POST  body: { type: 'analyze'|'edit'|'ping', posts, text, model, apiKey }

function isAuthorized(req) {
  const expected = process.env.AUTH_TOKEN;
  if (!expected) return true;
  return req.headers['x-auth-token'] === expected;
}

const SYSTEM = {
  analyze: `あなたはSNSマーケティングとコンテンツ分析の専門家です。
投稿者の文章を深く読み込み、バズりやすいパターンを具体的・実践的に抽出します。
分析は日本語で、見出しや箇条書きを使って読みやすく整理してください。`,

  edit: `あなたはSNSライティングの専門家です。
投稿者のスタイルと個性を最大限に活かしながら、より多くの人に読まれエンゲージメントが上がる文章に改善します。
改善案は必ず複数パターン提示し、それぞれの理由も添えてください。日本語で回答してください。`,
};

function buildPrompt(type, posts, text) {
  if (type === 'analyze') {
    const list = posts
      .map((p, i) => `【投稿${i + 1}】${p.title ? `（${p.title}）` : ''}\n${p.text}`)
      .join('\n\n---\n\n');
    return `以下は私がSNS（X/Twitter）に投稿した${posts.length}件のテキストです。
これらをまとめて分析し、「バズる文章の傾向」を抽出してください。

${list}

## 分析してほしい観点
1. **文体・語調の特徴**（トーン、口調、特徴的な言い回し）
2. **構成パターン**（書き出し・展開・締め方の傾向）
3. **テーマ・トピックの傾向**（よく扱う内容、切り口）
4. **強みと伸びしろ**（すでに良い点 / もっと伸ばせる点）
5. **バズらせるための具体的アクション**（明日から試せること3つ）`;
  }

  if (type === 'edit') {
    const examples = posts.length > 0
      ? posts.slice(0, 10).map((p, i) => `${i + 1}. ${p.text}`).join('\n\n')
      : '（参考投稿なし）';
    return `${posts.length > 0
      ? `## 私の過去の投稿スタイル（参考）\n\n${examples}\n\n---\n\n`
      : ''}## 添削してほしい文章\n\n${text}\n\n---\n
以下の形式で添削をお願いします：

## 現状の評価
良い点と改善できる点を簡潔に（各2〜3点）

## 改善案A：元の雰囲気を保ちながらブラッシュアップ
改善した文章をそのまま書いてください

## 改善案B：書き出しを変えてインパクト強化
改善した文章をそのまま書いてください

## 改善案C：より短くコンパクトにまとめた版
改善した文章をそのまま書いてください

## なぜこの改善が効果的か
各案の狙いと、どんな読者に刺さるかを説明してください`;
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-auth-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'パスワードが違います' });
  }

  const { type, posts = [], text = '', model = 'gpt-4o-mini', apiKey = '' } = req.body ?? {};

  if (type === 'ping') {
    return res.status(200).json({ hasServerKey: !!process.env.OPENAI_API_KEY });
  }

  const openaiKey = process.env.OPENAI_API_KEY || apiKey;
  if (!openaiKey) {
    return res.status(400).json({ error: 'OpenAI APIキーが必要です。設定タブから入力してください。' });
  }
  if (!['analyze', 'edit'].includes(type)) {
    return res.status(400).json({ error: '不明なタイプです' });
  }

  const userPrompt = buildPrompt(type, posts, text);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM[type] },
          { role: 'user',   content: userPrompt },
        ],
        max_tokens: 2500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(500).json({ error: err.error?.message || `OpenAI APIエラー (${response.status})` });
    }

    const data = await response.json();
    return res.status(200).json({ result: data.choices[0].message.content });
  } catch (err) {
    console.error('[ai]', err);
    return res.status(500).json({ error: err.message });
  }
}
