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
      if (!r.ok) throw new Error((await r.json()).error || 'APIã¨ã©ã¼');
      return r.json();
    },
    async addPost(title, text) {
      const r = await fetch('/api/posts', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ title, text }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'APIã¨ã©ã¼');
      return r.json();
    },
    async deletePost(id) {
      const r = await fetch(`/api/posts?id=${id}`, { method: 'DELETE', headers: headers() });
      if (!r.ok) throw new Error((await r.json()).error || 'APIã¨ã©ã¼');
    },
    async ai(type, posts, text, model, apiKey) {
      const r = await fetch('/api/ai', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ type, posts, text, model, apiKey }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'AIã¨ã©ã¼');
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
    .replace(/^[-â¢] (.+)$/gm, '<ul><li>$1</li></ul>')
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
      {loading ? <><span className="spin">â³</span> å¦çä¸­â¦</> : children}
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
      setError('ãã¹ã¯ã¼ããéãã¾ã');
    }
    setChecking(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">âï¸</div>
          <h1 className="text-xl font-bold text-gray-900">Writing Lab</h1>
          <p className="text-sm text-gray-400 mt-1">ãã¹ã¯ã¼ããå¥åãã¦ãã ãã</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            placeholder="ãã¹ã¯ã¼ã"
            value={pw}
            onChange={e => setPw(e.target.value)}
            autoFocus
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
          />
          {error && <Alert type="error" msg={error} />}
          <Btn onClick={submit} loading={checking} disabled={!pw.trim()} className="w-full justify-center">
            ã­ã°ã¤ã³
          </Btn>
        </form>
      </div>
    </div>
  );
}

/* ===================================================================
   TAB 1: æç¨¿ãã³ã¯
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
    if (!window.confirm('ãã®æç¨¿ãåé¤ãã¾ããï¼')) return;
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
          <span className="font-bold text-gray-800 text-sm">ð æç¨¿ãè¿½å </span>
          <span className="text-gray-400 text-xs">{showForm ? 'â²' : 'â¼'}|/span>
        </button>
        {showForm && (
          <div className="px-5 pb-5 border-t border-gray-50 pt-4 space-y-3">
            <input
              type="text"
              placeholder="ã¿ã¤ãã«ï¼ä»»æï¼"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
            />
            <div className="relative">
              <textarea
                ref={textRef}
                placeholder="æç¨¿ãã­ã¹ããããã«è²¼ãä»ãâ¦"
                value={text}
                onChange={e => setText(e.target.value)}
                rows={5}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition resize-none"
                onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') add(); }}
              />
              <span className="absolute bottom-2 right-3 text-xs text-gray-300">{text.length}æå­</span>
            </div>
            <div className="flex items-center gap-3">
              <Btn onClick={add} loading={saving === 'add'} disabled={!text.trim()}>
                ä¿å­ãã
              </Btn>
              <span className="text-xs text-gray-300 hidden sm:inline">Ctrl+Enter ã§ãä¿å­</span>
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm font-medium text-gray-500">
          {loading ? 'èª­ã¿è¾¼ã¿ä¸­â¦' : `${posts.length} ä»¶ã®æç¨¿`}
        </span>
        <input
          type="search"
          placeholder="ð æ¤ç´¢â¦"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-40 transition"
        />
      </div>

      <div className="space-y-3">
        {loading && (
          <div className="text-center py-12 text-gray-400 text-sm">
            <span className="spin text-2xl">â³</span>
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-14 text-gray-400">
            <div className="text-4xl mb-3">ð­</div>
            <div className="text-sm">
              {posts.length === 0 ? 'æç¨¿ãè¿½å ãã¦ãã ãã' : 'æ¤ç´¢çµæãããã¾ãã'}
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
                      ? post.text.slice(0, 120) + 'â¦'
                      : post.text}
                </div>
                {post.text.length > 120 && (
                  <button
                    onClick={() => setExpanded(expanded === post.id ? null : post.id)}
                    className="text-indigo-400 text-xs mt-1.5 hover:underline"
                  >
                    {expanded === post.id ? 'æãããã â²' : 'å¨æãè¡¨ç¤º â¼'}
                  </button>
                )}
              </div>
              <button
                onClick={() => del(post.id)}
                disabled={saving === post.id}
                className="text-gray-200 hover:text-red-400 transition text-xl leading-none flex-shrink-0 disabled:opacity-40"
                title="åé¤"
              >
                {saving === post.id ? <span className="spin text-sm">â³</span> : 'Ã'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===================================================================
   TAB 2: å¾ååæ
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
        <h2 className="text-lg font-bold text-gray-800 mb-1">ð å¾ååæ</h2>
        <p className="text-sm text-gray-500 mb-4">
          ãã³ã¯åã® <strong className="text-gray-700">{posts.length} ä»¶</strong> ã®æç¨¿ãAIãåæã
          ããºããããæç« ã®ãã¿ã¼ã³ãæ½åºãã¾ãã
        </p>
        {needsKey && <Alert type="warn" msg="âï¸ è¨­å®ã¿ãã§OpenAI APIã­ã¼ãå¥åãã¦ãã ãã" />}
        {posts.length < 2 && (
          <Alert type="warn" msg={`åæã«ã¯2ä»¶ä»¥ä¸ã®æç¨¿ãå¿è¦ã§ãï¼ç¾å¨ ${posts.length} ä»¶ï¼`} />
        )}
        <Btn
          onClick={analyze}
          loading={loading}
          disabled={posts.length < 2 || needsKey}
          className="mt-4"
        >
          â¨ åæãã
        </Btn>
      </div>

      {error && <Alert type="error" msg={`â ${error}`} />}

      {result && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">ð¯ åæçµæ</h3>
            <span className="text-xs text-gray-400">{posts.length}ä»¶ãåæ</span>
          </div>
          <Md text={result} />
          <CopyBtn text={result} className="mt-4" />
        </div>
      )}
    </div>
  );
}

/* ===================================================================
   TAB 3: AIæ·»å
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
        <h2 className="text-lg font-bold text-gray-800 mb-1">âï¸ AIæ·»å</h2>
        <p className="text-sm text-gray-500 mb-4">
          ãã³ã¯åã®æç¨¿ã¹ã¿ã¤ã«ãåèã«ãæ°ããæ¸ããæç« ãAIãæ·»åãã¾ãã
          {posts.length > 0 && (
            <span className="text-indigo-500">ï¼{Math.min(posts.length, 10)}ä»¶ãåèä½¿ç¨ï¼</span>
          )}
        </p>
        {needsKey && <Alert type="warn" msg="âï¸ è¨­å®ã¿ãã§OpenAI APIã­ã¼ãå¥åãã¦ãã ãã" />}
        <div className="mt-3 space-y-3">
          <div className="relative">
            <textarea
              placeholder="æ·»åãã¦ã»ããæç« ãå¥åãã¦ãã ããâ¦"
              value={input}
              onChange={e => setInput(e.target.value)}
              rows={7}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition resize-none"
              onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') edit(); }}
            />
            <span className="absolute bottom-2 right-3 text-xs text-gray-300">{input.length}æå­</span>
          </div>
          <div className="flex items-center gap-3">
            <Btn onClick={edit} loading={loading} disabled={!input.trim() || needsKey}>
              â¨ æ·»åãã
            </Btn>
            {input && (
              <button
                onClick={() => { setInput(''); setResult(''); setError(''); }}
                className="text-sm text-gray-400 hover:text-gray-600 transition"
              >
                ã¯ãªã¢
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <Alert type="error" msg={`â ${error}`} />}

      {result && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">ð¡ æ·»åçµæ</h3>
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
      {copied ? 'â ã³ãã¼æ¸ã¿' : 'ð ã³ãã¼'}
    </button>
  );
}

/* ===================================================================
   TAB 4: è¨­å®
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
        <h2 className="text-lg font-bold text-gray-800 mb-4">âï¸ è¨­å®</h2>

        {hasServerKey ? (
          <Alert type="success" msg="â OpenAI APIã­ã¼ã¯ãµã¼ãã¼å´ã§è¨­å®æ¸ã¿ã§ããå¥åä¸è¦ã§ãã" />
        ) : (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              OpenAI APIã­ã¼
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
                {showKey ? 'é ã' : 'è¡¨ç¤º'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer"
                className="text-indigo-500 hover:underline">platform.openai.com</a> ã§åå¾ã§ãã¾ãã
              ãã®ã­ã¼ã¯ãã®ããã¤ã¹ã®ãã©ã¦ã¶ã«ã®ã¿ä¿å­ããã¾ãã
            </p>
          </div>
        )}

        <div className="mb-5 mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">ä½¿ç¨ã¢ãã«</label>
          <select
            value={model}
            onChange={e => { setModel(e.target.value); ls.set('wl_model', e.target.value); }}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition bg-white"
          >
            <option value="gpt-4o-mini">gpt-4o-miniï¼æ¨å¥¨ã»ä½ã³ã¹ãï¼</option>
            <option value="gpt-4o">gpt-4oï¼é«åè³ªï¼</option>
            <option value="gpt-4.1-mini">gpt-4.1-miniï¼ææ°ã»ä½ã³ã¹ãï¼</option>
            <option value="gpt-4.1">gpt-4.1ï¼ææ°ã»é«åè³ªï¼</option>
          </select>
        </div>

        {!hasServerKey && (
          <Btn
            onClick={save}
            variant={saved ? 'secondary' : 'primary'}
          >
            {saved ? 'â ä¿å­ãã¾ãã' : 'ä¿å­ãã'}
          </Btn>
        )}
      </div>

      {/* Cost guide */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
        <p className="font-semibold text-blue-800 text-sm mb-3">ð° è²»ç¨ã®ç®å®ï¼gpt-4o-miniï¼</p>
        <div className="space-y-1.5 text-xs text-blue-700">
          <div className="flex justify-between">
            <span>å¾ååæ 1åï¼20ä»¶ç¨åº¦ï¼</span>
            <span className="font-medium">â 0.1ã1å</span>
          </div>
          <div className="flex justify-between">
            <span>AIæ·»å 1å</span>
            <span className="font-medium">â 0.1ã0.8å</span>
          </div>
          <p className="text-blue-500 mt-2 pt-2 border-t border-blue-100">
            æ100åä½¿ã£ã¦ãæ°åãæ°ç¾åã®è¦è¾¼ã¿
          </p>
        </div>
      </div>

      {/* Data / Auth */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <p className="font-semibold text-gray-800 text-sm mb-3">ð¾ ãã¼ã¿æå ±</p>
        <div className="text-sm text-gray-500 space-y-1.5 mb-4">
          <p>â¢ æç¨¿ãã¼ã¿ï¼<strong className="text-gray-700">{postCount} ä»¶</strong>ï¼ã¯ã©ã¦ãDBã«ä¿å­ï¼</p>
          <p>â¢ ãã¼ã¿ã¯ã©ã®ããã¤ã¹ãããåããã®ã«ã¢ã¯ã»ã¹ã§ãã¾ã</p>
        </div>
        <button
          onClick={onLogout}
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 transition hover:bg-gray-50"
        >
          ãã®ããã¤ã¹ããã­ã°ã¢ã¦ã
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
  const [tab, setTab] = useState('æç¨¿ãã³ã¯');
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
    } catch (e) { alert('ä¿å­å¤±æ: ' + e.message); }
  }, [api]);

  const handleDelete = useCallback(async (id) => {
    try {
      await api.deletePost(id);
      setPosts(prev => prev.filter(p => p.id !== id));
    } catch (e) { alert('åé¤å¤±æ: ' + e.message); }
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
    { id: 'æç¨¿ãã³ã¯', icon: 'ð', badge: posts.length > 0 ? posts.length : null },
    { id: 'å¾ååæ',  icon: 'ð', badge: null },
    { id: 'AIæ·»å',   icon: 'âï¸',  badge: null },
    { id: 'è¨­å®',      icon: 'âï¸',  badge: !hasServerKey && !apiKey ? '!' : null },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-16 min-h-screen">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">âï¸ Writing Lab</h1>
        <p className="text-sm text-gray-400 mt-0.5">SNSæç¨¿ãè²¯ãã¦ã»åæãã¦ã»ç£¨ã</p>
      </div>

      {/* API key reminder */}
      {!hasServerKey && !apiKey && (
        <div
          className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 mb-5 cursor-pointer hover:bg-amber-100 transition"
          onClick={() => setTab('è¨­å®')}
        >
          âï¸ <strong>è¨­å®ã¿ã</strong>ã§OpenAI APIã­ã¼ãå¥åããã¨AIæ©è½ãä½¿ãã¾ã â
        </div>
      )}

      {/* Error banner */}
      {postsError && (
        <div className="mb-4">
          <Alert type="error" msg={`cã¼ã¿åå¾ã¨ã©ã¼: ${postsError}`} />
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
        {tab === 'æç¨¿ãã³ã¯' && (
          <PostBank
            posts={posts}
            loading={postsLoading}
            onAdd={handleAdd}
            onDelete={handleDelete}
          />
        )}
        {tab === 'å¾ååæ' && (
          <TrendAnalysis
            posts={posts}
            api={api}
            model={model}
            apiKey={apiKey}
            hasServerKey={hasServerKey}
          />
        )}
        {tab === 'AIæ·»å' && (
          <AIEditing
            posts={posts}
            api={api}
            model={model}
            apiKey={apiKey}
            hasServerKey={hasServerKey}
          />
        )}
        {tab === 'è¨­å®' && (
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
