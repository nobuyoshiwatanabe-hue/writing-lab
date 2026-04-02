import { useState, useEffect } from "react";
import "./App.css";

// =============================================
// 定数
// =============================================
const GIST_FILE = "writing-lab-data.json";
const AI_MODEL = "claude-sonnet-4-6";
const TAGS = ["バズ", "共感", "知識", "物語", "その他"];
const TAG_COLORS = {
  バズ: "#ff6b6b",
  共感: "#ffd93d",
  知識: "#6bcb77",
  物語: "#4d96ff",
  その他: "#888888",
};

// =============================================
// GitHub Gist ヘルパー
// =============================================
async function gistLoad(token, gistId) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Gist読み込み失敗");
  }
  const data = await res.json();
  const content = data.files[GIST_FILE]?.content;
  if (!content) return [];
  return JSON.parse(content);
}

async function gistSave(token, gistId, posts) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: { [GIST_FILE]: { content: JSON.stringify(posts, null, 2) } },
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Gist保存失敗");
  }
}

async function gistCreate(token) {
  const res = await fetch("https://api.github.com/gists", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: "Writing Lab — SNS文章バンク",
      public: false,
      files: { [GIST_FILE]: { content: "[]" } },
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Gist作成失敗");
  }
  return (await res.json()).id;
}

// =============================================
// AI ヘルパー（/api/ai プロキシ経由）
// =============================================
async function callAI(system, user, maxTokens = 1500) {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "AI呼び出し失敗");
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "AI エラー");
  return data.content[0].text;
}

// =============================================
// ユーティリティ
// =============================================
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function formatTime(date) {
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

// =============================================
// メインアプリ
// =============================================
export default function App() {
  // データ
  const [posts, setPosts] = useState([]);
  const [tab, setTab] = useState("bank");

  // 設定
  const [token, setToken] = useState(() => localStorage.getItem("wl_gh_token") || "");
  const [gistId, setGistId] = useState(() => localStorage.getItem("wl_gist_id") || "");
  const [showSettings, setShowSettings] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ text: "未接続", ok: false });
  const [syncing, setSyncing] = useState(false);

  // バンクタブ
  const [newText, setNewText] = useState("");
  const [newTag, setNewTag] = useState("バズ");
  const [newNote, setNewNote] = useState("");
  const [analyses, setAnalyses] = useState({});
  const [analyzingId, setAnalyzingId] = useState(null);
  const [openAnalysisId, setOpenAnalysisId] = useState(null);
  const [filterTag, setFilterTag] = useState("すべて");

  // 傾向タブ
  const [trendReport, setTrendReport] = useState("");
  const [trendLoading, setTrendLoading] = useState(false);

  // 添削タブ
  const [draftText, setDraftText] = useState("");
  const [editResult, setEditResult] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // ─── 初期化 ───────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("wl_posts");
    if (saved) {
      try { setPosts(JSON.parse(saved)); } catch {}
    }
    if (token && gistId) {
      handleSyncLoad(true);
    }
  }, []);

  // localStorage への自動保存
  useEffect(() => {
    localStorage.setItem("wl_posts", JSON.stringify(posts));
  }, [posts]);

  // ─── 同期 ─────────────────────────────────────
  async function handleSyncLoad(silent = false) {
    if (!token || !gistId) {
      setSyncStatus({ text: "⚠ トークン / Gist ID 未設定", ok: false });
      return;
    }
    setSyncing(true);
    if (!silent) setSyncStatus({ text: "読み込み中…", ok: false });
    try {
      const data = await gistLoad(token, gistId);
      setPosts(data);
      setSyncStatus({ text: `☁ 同期済み ${formatTime(new Date())}`, ok: true });
    } catch (e) {
      setSyncStatus({ text: `✕ ${e.message}`, ok: false });
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncSave(updatedPosts) {
    if (!token || !gistId) return;
    try {
      await gistSave(token, gistId, updatedPosts);
      setSyncStatus({ text: `☁ 保存済み ${formatTime(new Date())}`, ok: true });
    } catch (e) {
      setSyncStatus({ text: `✕ 保存エラー: ${e.message}`, ok: false });
    }
  }

  async function handleCreateGist() {
    if (!token) { alert("GitHub トークンを入力してください"); return; }
    setSyncing(true);
    try {
      const newId = await gistCreate(token);
      setGistId(newId);
      localStorage.setItem("wl_gist_id", newId);
      localStorage.setItem("wl_gh_token", token);
      setSyncStatus({ text: `✓ Gist 作成完了`, ok: true });
      alert(`✅ Gist を作成しました！\n\nGist ID:\n${newId}\n\n（自動で保存されました）`);
    } catch (e) {
      alert(`❌ エラー: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  }

  function handleSaveSettings() {
    localStorage.setItem("wl_gh_token", token);
    localStorage.setItem("wl_gist_id", gistId);
    setShowSettings(false);
    handleSyncLoad();
  }

  // ─── バンク操作 ───────────────────────────────
  async function handleAddPost() {
    if (!newText.trim()) return;
    const post = {
      id: Date.now().toString(),
      text: newText.trim(),
      tag: newTag,
      note: newNote.trim(),
      date: todayStr(),
    };
    const updated = [post, ...posts];
    setPosts(updated);
    setNewText("");
    setNewNote("");
    await handleSyncSave(updated);
  }

  async function handleDeletePost(id) {
    if (!confirm("この文章を削除しますか？")) return;
    const updated = posts.filter((p) => p.id !== id);
    setPosts(updated);
    setAnalyses((prev) => { const n = { ...prev }; delete n[id]; return n; });
    if (openAnalysisId === id) setOpenAnalysisId(null);
    await handleSyncSave(updated);
  }

  // ─── AI: 個別分析 ─────────────────────────────
  async function handleAnalyzePost(post) {
    if (analyses[post.id]) {
      setOpenAnalysisId(openAnalysisId === post.id ? null : post.id);
      return;
    }
    setAnalyzingId(post.id);
    try {
      const result = await callAI(
        "あなたは優秀なSNS文章分析の専門家です。日本語で簡潔に回答してください。",
        `以下のSNS文章を分析してください。\n\n「${post.text}」\n\nタグ: ${post.tag}\n\n以下の観点で分析（各200文字以内）：\n\n## 文章構造\n（どのような組み立てか）\n\n## 感情フック\n（読者の感情をどこで引くか）\n\n## バズるポイント\n（なぜ注目を集めるか）\n\n## 学びポイント\n（この文章から使える技術）`,
        1200
      );
      setAnalyses((prev) => ({ ...prev, [post.id]: result }));
      setOpenAnalysisId(post.id);
    } catch (e) {
      alert(`分析エラー: ${e.message}`);
    } finally {
      setAnalyzingId(null);
    }
  }

  // ─── AI: 傾向分析 ─────────────────────────────
  async function handleAnalyzeTrend() {
    if (posts.length < 2) { alert("分析には最低 2 件の文章が必要です"); return; }
    setTrendLoading(true);
    setTrendReport("");
    try {
      const sample = posts.slice(0, 20);
      const postsText = sample
        .map((p, i) => `[${i + 1}] タグ:${p.tag}\n${p.text}`)
        .join("\n\n");
      const result = await callAI(
        "あなたはSNS文章のバズり傾向を分析する専門家です。日本語で詳細に分析してください。",
        `以下の ${sample.length} 件のSNS文章を分析して、バズるパターンをまとめてください。\n\n${postsText}\n\n## 分析項目\n1. 共通する文章構造・フォーマット\n2. よく使われる感情的要素・トリガー\n3. 効果的な言葉・表現パターン\n4. タグ別の傾向と特徴\n5. バズる文章を書くための具体的なアドバイス（3〜5項目）`,
        2000
      );
      setTrendReport(result);
    } catch (e) {
      alert(`分析エラー: ${e.message}`);
    } finally {
      setTrendLoading(false);
    }
  }

  // ─── AI: 文章添削 ─────────────────────────────
  async function handleEditText() {
    if (!draftText.trim()) return;
    if (posts.length === 0) {
      alert("文章バンクにデータがありません。先に文章を追加してください。");
      return;
    }
    setEditLoading(true);
    setEditResult("");
    try {
      const sample = posts.slice(0, 12);
      const examples = sample.map((p) => `[${p.tag}] ${p.text}`).join("\n\n");
      const result = await callAI(
        "あなたはSNS文章の添削専門家です。参考文章のバズるパターンを活かして添削します。日本語で回答してください。",
        `【参考文章（バンクから ${sample.length} 件）】\n${examples}\n\n---\n\n【添削してほしい文章】\n${draftText}\n\n上記の参考文章のバズるパターンを活かして、以下の形式で添削してください：\n\n## ✏️ 添削後の文章\n\n（添削済み文章をここに）\n\n## 🔍 変更のポイント\n\n（何をどう変えたか、具体的に）\n\n## 💡 バズる要素の追加\n\n（参考文章からどのパターンを取り入れたか）`,
        1800
      );
      setEditResult(result);
    } catch (e) {
      alert(`添削エラー: ${e.message}`);
    } finally {
      setEditLoading(false);
    }
  }

  // ─── フィルタ ──────────────────────────────────
  const filteredPosts =
    filterTag === "すべて" ? posts : posts.filter((p) => p.tag === filterTag);

  const syncConnected = !!(token && gistId);

  // =============================================
  // レンダリング
  // =============================================
  return (
    <div className="app">
      {/* ── ヘッダー ── */}
      <header className="header">
        <h1>✍️ Writing Lab</h1>
        <div className="header-right">
          <span
            className="sync-indicator"
            title={syncStatus.text}
            style={{ color: syncConnected && syncStatus.ok ? "#6bcb77" : "#888" }}
          >
            {syncing ? "⟳" : syncConnected && syncStatus.ok ? "☁" : "○"}
          </span>
          <button className="icon-btn" onClick={() => setShowSettings(true)} title="設定">
            ⚙
          </button>
        </div>
      </header>

      {/* ── メインコンテンツ ── */}
      <main className="main">
        {/* ======== バンクタブ ======== */}
        {tab === "bank" && (
          <div className="tab-content">
            {/* 追加フォーム */}
            <div className="card add-form">
              <textarea
                className="textarea"
                placeholder="気になった文章を貼り付け…"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                rows={4}
              />
              {/* タグ選択 */}
              <div className="tag-row">
                {TAGS.map((t) => (
                  <button
                    key={t}
                    className={`tag-btn ${newTag === t ? "active" : ""}`}
                    style={{ "--tag-color": TAG_COLORS[t] }}
                    onClick={() => setNewTag(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <input
                className="input"
                placeholder="📝 メモ（なぜ気になったか・任意）"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <button
                className="btn primary"
                onClick={handleAddPost}
                disabled={!newText.trim()}
              >
                保存する
              </button>
            </div>

            {/* フィルタ */}
            <div className="filter-row">
              {["すべて", ...TAGS].map((t) => (
                <button
                  key={t}
                  className={`filter-btn ${filterTag === t ? "active" : ""}`}
                  onClick={() => setFilterTag(t)}
                >
                  {t} {t !== "すべて" && <span className="filter-count">{posts.filter(p => p.tag === t).length}</span>}
                </button>
              ))}
            </div>

            <div className="posts-meta">{filteredPosts.length} 件</div>

            {/* 投稿リスト */}
            {filteredPosts.map((post) => (
              <div key={post.id} className="card post-card">
                <div className="post-header">
                  <span
                    className="tag-badge"
                    style={{ background: TAG_COLORS[post.tag], color: post.tag === "共感" ? "#000" : "#fff" }}
                  >
                    {post.tag}
                  </span>
                  <span className="post-date">{post.date}</span>
                  <button
                    className="delete-btn"
                    onClick={() => handleDeletePost(post.id)}
                    title="削除"
                  >
                    ✕
                  </button>
                </div>

                <p className="post-text">{post.text}</p>

                {post.note && (
                  <p className="post-note">📝 {post.note}</p>
                )}

                <button
                  className="btn secondary small"
                  onClick={() => handleAnalyzePost(post)}
                  disabled={analyzingId === post.id}
                >
                  {analyzingId === post.id
                    ? "分析中…"
                    : analyses[post.id]
                    ? openAnalysisId === post.id ? "▲ 分析を閉じる" : "▼ 分析を見る"
                    : "🔍 AI分析"}
                </button>

                {openAnalysisId === post.id && analyses[post.id] && (
                  <div className="analysis-box">
                    <pre>{analyses[post.id]}</pre>
                  </div>
                )}
              </div>
            ))}

            {filteredPosts.length === 0 && (
              <div className="empty-state">
                <p className="empty-emoji">📚</p>
                <p>{posts.length === 0 ? "まだ文章がありません" : "このタグの文章はありません"}</p>
                <p className="empty-sub">
                  {posts.length === 0 ? "X や Threads で気になった文章を上から追加しましょう" : "フィルタを変えて確認してみてください"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ======== 傾向タブ ======== */}
        {tab === "trend" && (
          <div className="tab-content">
            <div className="card">
              <h2 className="section-title">📊 傾向分析</h2>
              <p className="section-desc">
                バンクに貯めた文章からバズるパターンをまとめます
              </p>
              <div className="info-row">
                <span className="info-badge">{posts.length} 件のデータ</span>
                {posts.length < 5 && (
                  <span className="info-hint">※ 5件以上あると精度が上がります</span>
                )}
              </div>
              <button
                className="btn primary"
                onClick={handleAnalyzeTrend}
                disabled={trendLoading || posts.length < 2}
              >
                {trendLoading ? "分析中…" : "🚀 傾向分析を実行"}
              </button>
            </div>

            {trendLoading && (
              <div className="card loading-card">
                <div className="loading-spinner">⟳</div>
                <p>AIが分析中です…</p>
              </div>
            )}

            {trendReport && !trendLoading && (
              <div className="card">
                <div className="result-header">
                  <h3>📋 分析レポート</h3>
                  <button
                    className="btn secondary small"
                    onClick={() => {
                      navigator.clipboard.writeText(trendReport);
                      alert("コピーしました！");
                    }}
                  >
                    コピー
                  </button>
                </div>
                <div className="report-content">
                  <pre>{trendReport}</pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======== 添削タブ ======== */}
        {tab === "edit" && (
          <div className="tab-content">
            <div className="card">
              <h2 className="section-title">✏️ 文章添削</h2>
              <p className="section-desc">
                バンクの文章パターンを参考に、AIが添削します
              </p>
              <textarea
                className="textarea"
                placeholder="添削してほしい文章を入力…"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                rows={6}
              />
              <button
                className="btn primary"
                onClick={handleEditText}
                disabled={editLoading || !draftText.trim()}
              >
                {editLoading ? "添削中…" : "✨ 添削する"}
              </button>
              {posts.length === 0 && (
                <p className="warning-text">
                  ⚠ バンクに文章がないと参考データなしで添削されます
                </p>
              )}
            </div>

            {editLoading && (
              <div className="card loading-card">
                <div className="loading-spinner">⟳</div>
                <p>AIが添削中です…</p>
              </div>
            )}

            {editResult && !editLoading && (
              <div className="card">
                <div className="result-header">
                  <h3>📝 添削結果</h3>
                  <button
                    className="btn secondary small"
                    onClick={() => {
                      navigator.clipboard.writeText(editResult);
                      alert("コピーしました！");
                    }}
                  >
                    コピー
                  </button>
                </div>
                <div className="report-content">
                  <pre>{editResult}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── ボトムナビ ── */}
      <nav className="bottom-nav">
        {[
          { id: "bank", icon: "📚", label: "バンク" },
          { id: "trend", icon: "📊", label: "傾向" },
          { id: "edit", icon: "✏️", label: "添削" },
        ].map((item) => (
          <button
            key={item.id}
            className={`nav-item ${tab === item.id ? "active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* ── 設定モーダル ── */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>⚙️ 設定</h2>
              <button className="icon-btn" onClick={() => setShowSettings(false)}>
                ✕
              </button>
            </div>

            {/* クラウド同期設定 */}
            <section className="settings-section">
              <h3>☁️ クラウド同期（GitHub Gist）</h3>

              <label className="settings-label">
                Personal Access Token
                <a
                  href="https://github.com/settings/tokens/new?scopes=gist"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="settings-link"
                >
                  発行はこちら →
                </a>
              </label>
              <input
                className="input"
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxx"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />

              <label className="settings-label">Gist ID</label>
              <div className="input-row">
                <input
                  className="input"
                  placeholder="（「新規作成」で自動生成されます）"
                  value={gistId}
                  onChange={(e) => setGistId(e.target.value)}
                />
                {gistId && (
                  <button
                    className="btn secondary small"
                    onClick={() => { navigator.clipboard.writeText(gistId); alert("コピーしました"); }}
                    title="Gist IDをコピー"
                  >
                    コピー
                  </button>
                )}
              </div>

              <div className="btn-row">
                <button
                  className="btn secondary"
                  onClick={handleCreateGist}
                  disabled={syncing || !token}
                >
                  {syncing ? "作成中…" : "新規 Gist 作成"}
                </button>
                <button className="btn primary" onClick={handleSaveSettings}>
                  保存して同期
                </button>
              </div>

              {syncStatus.text && (
                <p
                  className="sync-status-text"
                  style={{ color: syncStatus.ok ? "#6bcb77" : "#ff9a9a" }}
                >
                  {syncStatus.text}
                </p>
              )}

              <button
                className="btn secondary full mt8"
                onClick={() => handleSyncLoad()}
                disabled={syncing || !syncConnected}
              >
                {syncing ? "同期中…" : "↻ 今すぐ同期（読み込み）"}
              </button>
            </section>

            {/* データ管理 */}
            <section className="settings-section">
              <h3>📊 データ管理</h3>
              <p className="settings-info">
                現在 <strong>{posts.length}</strong> 件の文章を保存中
              </p>
              <button
                className="btn danger"
                onClick={() => {
                  if (confirm(`全データ（${posts.length}件）を削除しますか？\nこの操作は元に戻せません。`)) {
                    setPosts([]);
                    handleSyncSave([]);
                    setShowSettings(false);
                  }
                }}
              >
                🗑 全データ削除
              </button>
            </section>

            {/* バージョン */}
            <p className="settings-version">Writing Lab v1.0.0</p>
          </div>
        </div>
      )}
    </div>
  );
}
