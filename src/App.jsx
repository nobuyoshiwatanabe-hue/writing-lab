import { useState, useEffect, useRef, useCallback } from 'react';

/* --- LocalStorage helpers (auth & settings only) ----------------- */
const ls = {
  get: (k, def = '') => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* --- API client -------------------------------------------------- */
function makeApi(token) {
  const headers = (extra = {}) => ({
    'Content-Type': 'application/json',
    'x-auth-token': token,
    ...extra,
  });
  return {
    async getPosts() {
      const r = await fetch('/api/posts', { headers: headers() });
      if (!r.ok) throw new Error((await r.json()).error || 'APIエラー');
      return r.json();
    },
    async addPost(title, text) {
      const r = await fetch('/api/posts', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ title, text }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'APIエラー');
      return r.json();
    },
    async deletePost(id) {
      const r = await fetch(`/api/posts?id=${id}`, { method: 'DELETE', headers: headers() });
      if (!r.ok) throw new Error((await r.json()).error || 'APIエラー');
    },
    async ai(type, posts, text, model, apiKey) {
      const r = await fetch('/api/ai', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ type, posts, text, model, apiKey }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'AIエラー');
      return (await r.json()).result;
    },
    async ping() {
      const r = await fetch('/api/posts', { headers: headers() });
      return r.status !== 401;
    },
  };
}

/* --- Simple Markdown renderer ------------------------------------ */
function Md({ text }) {
  const html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^---$/gm, '<hr/>')
    .replace(/^[-•] (.+)$/gm, '<ul><li>$1</li></ul>')
    .replace(/^(\d+)\. (.+)$/gm, '<ol><li>$2</li></ol>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
  return (
    <div
      className="md-content text-sm text-gray-700"
      dangerouslySetInnerHTML={{ __html: `<p>${html}</p>` }}
    />
  );
}

/* --- Reusable components ----------------------------------------- */
function Alert({ type, msg }) {
  if (!msg) return null;
  const cls = {
    warn:    'bg-amber-50  border-amber-200  text-amber-800',
    error:   'bg-red-50    border-red-200    text-red-700',
    success: 'bg-green-50  border-green-200  text-green-700',
  }[type] || 'bg-gray-50 border-gray-200 text-gray-700';
  return <div className={`border rounded-xl px-4 py-3 text-sm fade-in ${cls}`}>{msg}</div>;
}

function Btn({ onClick, disabled, loading, children, variant = 'primary', className = '' }) {
  const base = 'px-5 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    primary:   'bg-indigo-600 hover:bg-indigo-700 text-white',
    secondary: 'bg-gray-100   hover:bg-gray-200   text-gray-700',
    danger:    'bg-red-50     hover:bg-red-100    text-red-600 border border-red-200',
  };
  return (
    <button onClick={onClick} disabled={disabled || loading} className={`${base} ${variants[variant]} ${className}`}>
      {loading ? <><span className="spin">⏳</span> 処理中…</> : children}
    </button>
  );
}

/* ===================================================================
   AUTH SCREEN
====================================================================== */
function AuthScreen({ onAuth }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!pw.trim()) return;
    setChecking(true); setError('');
    const api = makeApi(pw.trim());
    const ok = await api.ping().catch(() => false);
    if (ok) {
      ls.set('wl_token', pw.trim());
      onAuth(pw.trim());
    } else {
      setError('パスワードが違います');
    }
    setChecking(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">✏️</div>
          <h1 className="text-xl font-bold text-gray-900">Writing Lab</h1>
          <p className="text-sm text-gray-400 mt-1">パスワードを入力してください</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            placeholder="パスワード"
            value={pw}
            onChange={e => setPw(e.target.value)}
            autoFocus
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
          />
          {error && <Alert type="error" msg={error} />}
          <Btn onClick={submit} loading={checking} disabled={!pw.trim()} className="w-full justify-center">
            ログイン
          </Btn>
        </form>
      </div>
    </div>
  );
}

/* ===================================================================
   TAB 1: 投稿バンク
====================================================================== */
function PostBank({ posts, loading, onAdd, onDelete }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(null); // 'add' | postId
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [showForm, setShowForm] = useState(true);
  const textRef = useRef();

  const add = async () => {
    if (!text.trim()) return;
    setSaving('add');
    await onAdd(title.trim(), text.trim());
    setTitle(''); setText('');
    setSaving(null);
    textRef.current?.focus();
  };

  const del = async (id) => {
    if (!window.confirm('この投稿を削除しますか？')) return;
    setSaving(id);
    await onDelete(id);
    setSaving(null);
  };

  const filtered = posts.filter(p =>
    p.text.toLowerCase().includes(search.toLowerCase()) ||
    (p.title || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* Add form */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <button
          onClick={() => setShowForm(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4"
        >
          <span className="font-bold text-gray-800 text-sm">📝 投稿を追加</span>
          <span className="text-gray-400 text-xs">{showForm ? '▲' : '▼'}</span>
        </button>
        {showForm && (
          <div className="px-5 pb-5 border-t border-gray-50 pt-4 space-y-3">
            <input
              type="text"
              placeholder="タイトル（任意）"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
            />
            <div className="relative">
              <textarea
                ref={textRef}
                placeholder="投稿テキストをここに貼り付け…"
                value={text}
                onChange={e => setText(e.target.value)}
                rows={5}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition resize-none"
                onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') add(); }}
              />
              <span className="absolute bottom-2 right-3 text-xs text-gray-300">{text.length}文字</span>
            </div>
            <div className="flex items-center gap-3">
              <Btn onClick={add} loading={saving === 'add'} disabled={!text.trim()}>
                保存する
              </Btn>
              <span className="text-xs text-gray-300 hidden sm:inline">Ctrl+Enter でも保存</span>
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm font-medium text-gray-500">
          {loading ? '読み込み中…' : `${posts.length} 件の投稿`}
        </span>
        <input
          type="search"
          placeholder="🔍 検索…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-40 transition"
        />
      </div>

      <div className="space-y-3">
        {loading && (
          <div className="text-center py-12 text-gray-400 text-sm">
            <span className="spin text-2xl">⏳</span>
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-14 text-gray-400">
            <div className="text-4xl mb-3">📭</div>
            <div className="text-sm">
              {posts.length === 0 ? '投稿を追加してください' : '検索結果がありません'}
            </div>
          </div>
        )}
        {filtered.map(post => (
          <div key={post.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 fade-in">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {post.title && (
                  <div className="font-semibold text-gray-800 text-sm mb-0.5">{post.title}</div>
                )}
                <div className="text-xs text-gray-400 mb-2">
                  {new Date(post.created_at).toLocaleDateString('ja-JP', {
                    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                  {expanded === post.id
                    ? post.text
                    : post.text.length > 120
                      ? post.text.slice(0, 120) + '…'
                      : post.text}
                </div>
                {post.text.length > 120 && (
                  <button
                    onClick={() => setExpanded(expanded === post.id ? null : post.id)}
                    className="text-indigo-400 text-xs mt-1.5 hover:underline"
                  >
                    {expanded === post.id ? '折りたたむ ▲' : '全文を表示 ▼'}
                  </button>
                )}
              </div>
              <button
                onClick={() => del(post.id)}
                disabled={saving === post.id}
                className="text-gray-200 hover:text-red-400 transition text-xl leading-none flex-shrink-0 disabled:opacity-40"
                title="削除"
              >
                {saving === post.id ? <span className="spin text-sm">⏳</span> : '×'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===================================================================
   TAB 2: 傾向分析
====================================================================== */
function TrendAnalysis({ posts, api, model, apiKey, hasServerKey }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const analyze = async () => {
    if (posts.length < 2) return;
    setLoading(true); setError(''); setResult('');
    try {
      const content = await api.ai('analyze', posts, '', model, hasServerKey ? '' : apiKey);
      setResult(content);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const needsKey = !hasServerKey && !apiKey;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-bold text-gray-800 mb-1">📊 傾向分析</h2>
        <p className="text-sm text-gray-500 mb-4">
          バンク内の <strong className="text-gray-700">{posts.length} 件</strong> の投稿をAIが分析。
          バズりやすい文章のパターンを抽出します。
        </p>
        {needsKey && <Alert type="warn" msg="⚙️ 設定タブでOpenAI APIキーを入力してください" />}
        {posts.length < 2 && (
          <Alert type="warn" msg={`分析には2件以上の投稿が必要です（現在 ${posts.length} 件）`} />
        )}
        <Btn
          onClick={analyze}
          loading={loading}
          disabled={posts.length < 2 || needsKey}
          className="mt-4"
        >
          ✨ 分析する
        </Btn>
      </div>

      {error && <Alert type="error" msg={`❌ ${error}`} />}

      {result && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">🎯 分析結果</h3>
            <span className="text-xs text-gray-400">{posts.length}件を分析</span>
          </div>
          <Md text={result} />
          <CopyBtn text={result} className="mt-4" />
        </div>
      )}
    </div>
  );
}

/* ===================================================================
   TAB 3: AI添削
====================================================================== */
function AIEditing({ posts, api, model, apiKey, hasServerKey }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const edit = async () => {
    if (!input.trim()) return;
    setLoading(true); setError(''); setResult('');
    try {
      const content = await api.ai('edit', posts, input, model, hasServerKey ? '' : apiKey);
      setResult(content);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const needsKey = !hasServerKey && !apiKey;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-bold text-gray-800 mb-1">✍️ AI添削</h2>
        <p className="text-sm text-gray-500 mb-4">
          バンク内の投稿スタイルを参考に、新しく書いた文章をAIが添削します。
          {posts.length > 0 && (
            <span className="text-indigo-500">（{Math.min(posts.length, 10)}件を参考使用）</span>
          )}
        </p>
        {needsKey && <Alert type="warn" msg="⚙️ 設定タブでOpenAI APIキーを入力してください" />}
        <div className="mt-3 space-y-3">
          <div className="relative">
            <textarea
              placeholder="添削してほしい文章を入力してください…"
              value={input}
              onChange={e => setInput(e.target.value)}
              rows={7}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition resize-none"
              onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') edit(); }}
            />
            <span className="absolute bottom-2 right-3 text-xs text-gray-300">{input.length}文字</span>
          </div>
          <div className="flex items-center gap-3">
            <Btn onClick={edit} loading={loading} disabled={!input.trim() || needsKey}>
              ✨ 添削する
            </Btn>
            {input && (
              <button
                onClick={() => { setInput(''); setResult(''); setError(''); }}
                className="text-sm text-gray-400 hover:text-gray-600 transition"
              >
                クリア
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <Alert type="error" msg={`❌ ${error}`} />}

      {result && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">💡 添削結果</h3>
            <CopyBtn text={result} />
          </div>
          <Md text={result} />
        </div>
      )}
    </div>
  );
}

/* --- Copy button helper ------------------------------------------ */
function CopyBtn({ text, className = '' }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  return (
    <button
      onClick={copy}
      className={`text-xs border rounded-lg px-3 py-1.5 transition ${
        copied
          ? 'border-green-300 text-green-600 bg-green-50'
          : 'border-indigo-200 text-indigo-500 hover:bg-indigo-50'
      } ${className}`}
    >
      {copied ? '✅ コピー済み' : '📋 コピー'}
    </button>
  );
}

/* ===================================================================
   TAB 4: 設定
====================================================================== */
function Settings({ apiKey, setApiKey, model, setModel, hasServerKey, token, onLogout, postCount }) {
  const [localKey, setLocalKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setApiKey(localKey.trim());
    ls.set('wl_apikey', localKey.trim());
    ls.set('wl_model', model);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-5">
      {/* OpenAI Settings */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-bold text-gray-800 mb-4">⚙️ 設定</h2>

        {hasServerKey ? (
          <Alert type="success" msg="✅ OpenAI APIキーはサーバー側で設定済みです。入力不要です。" />
        ) : (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              OpenAI APIキー
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={localKey}
                onChange={e => setLocalKey(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition font-mono pr-16"
              />
              <button
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
              >
                {showKey ? '隠す' : '表示'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer"
                className="text-indigo-500 hover:underline">platform.openai.com</a> で取得できます。
              このキーはこのデバイスのブラウザにのみ保存されます。
            </p>
          </div>
        )}

        <div className="mb-5 mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">使用モデル</label>
          <select
            value={model}
            onChange={e => { setModel(e.target.value); ls.set('wl_model', e.target.value); }}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition bg-white"
          >
            <option value="gpt-4o-mini">gpt-4o-mini（推奨・低コスト）</option>
            <option value="gpt-4o">gpt-4o（高品質）</option>
            <option value="gpt-4.1-mini">gpt-4.1-mini（最新・低コスト）</option>
            <option value="gpt-4.1">gpt-4.1（最新・高品質）</option>
          </select>
        </div>

        {!hasServerKey && (
          <Btn
            onClick={save}
            variant={saved ? 'secondary' : 'primary'}
          >
            {saved ? '✅ 保存しました' : '保存する'}
          </Btn>
        )}
      </div>

      {/* Cost guide */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
        <p className="font-semibold text-blue-800 text-sm mb-3">💰 費用の目安（gpt-4o-mini）</p>
        <div className="space-y-1.5 text-xs text-blue-700">
          <div className="flex justify-between">
            <span>傾向分析 1回（20件程度）</span>
            <span className="font-medium">≈ 0.1〜1円</span>
          </div>
          <div className="flex justify-between">
            <span>AI添削 1回</span>
            <span className="font-medium">≈ 0.1〜0.8円</span>
          </div>
          <p className="text-blue-500 mt-2 pt-2 border-t border-blue-100">
            月100回使っても数十〜数百円の見込み
          </p>
        </div>
      </div>

      {/* Data / Auth */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <p className="font-semibold text-gray-800 text-sm mb-3">💾 データ情報</p>
        <div className="text-sm text-gray-500 space-y-1.5 mb-4">
          <p>• 投稿データ：<strong className="text-gray-700">{postCount} 件</strong>（クラウドDBに保存）</p>
          <p>• データはどのデバイスからも同じものにアクセスできます</p>
        </div>
        <button
          onClick={onLogout}
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 transition hover:bg-gray-50"
        >
          このデバイスからログアウト
        </button>
      </div>
    </div>
  );
}

/* ===================================================================
   MAIN APP
====================================================================== */
export default function App() {
  const [token, setToken] = useState(() => ls.get('wl_token', ''));
  const [tab, setTab] = useState('投稿バンク');
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState('');
  const [apiKey, setApiKey] = useState(() => ls.get('wl_apikey', ''));
  const [model, setModel] = useState(() => ls.get('wl_model', 'gpt-4o-mini'));
  const [hasServerKey, setHasServerKey] = useState(false);

  const api = token ? makeApi(token) : null;

  // Load posts & check server key on auth
  useEffect(() => {
    if (!token || !api) return;
    loadPosts();
    checkServerKey();
  }, [token]);

  const loadPosts = useCallback(async () => {
    if (!api) return;
    setPostsLoading(true); setPostsError('');
    try {
      const data = await api.getPosts();
      setPosts(data);
    } catch (e) {
      setPostsError(e.message);
    } finally {
      setPostsLoading(false);
    }
  }, [api]);

  const checkServerKey = useCallback(async () => {
    try {
      const r = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ type: 'ping' }),
      });
      const d = await r.json();
      setHasServerKey(d.hasServerKey === true);
    } catch {}
  }, [token]);

  const handleAdd = useCallback(async (title, text) => {
    try {
      const post = await api.addPost(title, text);
      setPosts(prev => [post, ...prev]);
    } catch (e) { alert('保存失敗: ' + e.message); }
  }, [api]);

  const handleDelete = useCallback(async (id) => {
    try {
      await api.deletePost(id);
      setPosts(prev => prev.filter(p => p.id !== id));
    } catch (e) { alert('削除失敗: ' + e.message); }
  }, [api]);

  const logout = () => {
    ls.set('wl_token', '');
    setToken('');
    setPosts([]);
  };

  // Auth gate
  if (!token) {
    return <AuthScreen onAuth={(t) => setToken(t)} />;
  }

  const TABS = [
    { id: '投稿バンク', icon: '📚', badge: posts.length > 0 ? posts.length : null },
    { id: '傾向分析',  icon: '📊', badge: null },
    { id: 'AI添削',   icon: '✍️',  badge: null },
    { id: '設定',      icon: '⚙️',  badge: !hasServerKey && !apiKey ? '!' : null },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-16 min-h-screen">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">✏️ Writing Lab</h1>
        <p className="text-sm text-gray-400 mt-0.5">SNS投稿を貯めて・分析して・磨く</p>
      </div>

      {/* API key reminder */}
      {!hasServerKey && !apiKey && (
        <div
          className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 mb-5 cursor-pointer hover:bg-amber-100 transition"
          onClick={() => setTab('設定')}
        >
          ⚙️ <strong>設定タブ</strong>でOpenAI APIキーを入力するとAI機能が使えます →
        </div>
      )}

      {/* Error banner */}
      {postsError && (
        <div className="mb-4">
          <Alert type="error" msg={`c��ータ取得エラー: ${postsError}`} />
        </div>
      )}

      {/* Tab nav */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1.5 mb-6 flex gap-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative flex-1 flex flex-col items-center py-2.5 rounded-xl text-xs font-medium transition ${
              tab === t.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            <span className="text-base leading-tight">{t.icon}</span>
            <span className="leading-tight mt-0.5">{t.id}</span>
            {t.badge !== null && (
              <span className={`absolute top-1 right-1 text-xs rounded-full px-1.5 leading-5 font-bold ${
                tab === t.id ? 'bg-white/30 text-white' : 'bg-indigo-100 text-indigo-600'
              }`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {tab === '投稿バンク' && (
          <PostBank
            posts={posts}
            loading={postsLoading}
            onAdd={handleAdd}
            onDelete={handleDelete}
          />
        )}
        {tab === '傾向分析' && (
          <TrendAnalysis
            posts={posts}
            api={api}
            model={model}
            apiKey={apiKey}
            hasServerKey={hasServerKey}
          />
        )}
        {tab === 'AI添削' && (
          <AIEditing
            posts={posts}
            api={api}
            model={model}
            apiKey={apiKey}
            hasServerKey={hasServerKey}
          />
        )}
        {tab === '設定' && (
          <Settings
            apiKey={apiKey}
            setApiKey={setApiKey}
            model={model}
            setModel={setModel}
            hasServerKey={hasServerKey}
            token={token}
            onLogout={logout}
            postCount={posts.length}
          />
        )}
      </div>
    </div>
  );
}
