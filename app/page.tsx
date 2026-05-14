"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles, Link as LinkIcon, FileText, Download, Hash,
  Clock, Heart, Star, MessageCircle, Settings, Search,
  Plus, Layout, CheckCircle2, ChevronRight,
  Bookmark, RefreshCw, Trash2, BookOpen, PenLine, LogIn, LogOut, User, History,
  Menu, X, Link2, Mail
} from "lucide-react";
import { supabase } from "../lib/supabase";
import * as db from "../lib/db";

const STORAGE_KEYS = {
  materials: "ember_materials",
  ideas: "ember_ideas",
  pendingLinks: "ember_pendingLinks",
  parseHistory: "ember_parseHistory",
};

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveLocal<T>(key: string, data: T) {
  localStorage.setItem(key, JSON.stringify(data));
}
function genId() { return Date.now() + Math.floor(Math.random() * 1000); }

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authStep, setAuthStep] = useState<"email" | "code">("email");
  const [authError, setAuthError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [activeTab, setActiveTab] = useState("parse");
  const [url, setUrl] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  const [isExported, setIsExported] = useState(false);
  const [ideas, setIdeas] = useState<{id: number; text: string}[]>([]);
  const [aiMode, setAiMode] = useState<"auto" | "colab">("auto");
  const [aiResult, setAiResult] = useState("");
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [aiNoteSaved, setAiNoteSaved] = useState(false);
  const [materials, setMaterials] = useState<any[]>([]);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [selectedRefIds, setSelectedRefIds] = useState<number[]>([]);
  const [styleSummary, setStyleSummary] = useState("");
  const [styleSamplesCount, setStyleSamplesCount] = useState(0);
  const [recommendedTopics, setRecommendedTopics] = useState<{title:string;desc:string}[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [isGenWithRefs, setIsGenWithRefs] = useState(false);
  const [genRefsResult, setGenRefsResult] = useState("");
  const [parseHistory, setParseHistory] = useState<any[]>([]);
  const [pendingLinks, setPendingLinks] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => listener?.subscription.unsubscribe();
  }, []);

  const handleSendCode = async () => {
    if (!authEmail || !authEmail.includes("@")) { setAuthError("请输入有效邮箱"); return; }
    setAuthError("");
    const { error } = await supabase.auth.signInWithOtp({ email: authEmail });
    if (error) { setAuthError(error.message); }
    else { setAuthStep("code"); }
  };

  const handleVerifyCode = async () => {
    if (!authCode) { setAuthError("请输入验证码"); return; }
    setAuthError("");
    const { error } = await supabase.auth.verifyOtp({ email: authEmail, token: authCode, type: "email" });
    if (error) { setAuthError(error.message); }
    else { setShowAuth(false); setAuthStep("email"); setAuthCode(""); }
  };

  const handleLogout = () => { supabase.auth.signOut(); setUser(null); };

  const loadAll = useCallback(async (uid: string) => {
    setMaterials(await db.loadMaterials(uid));
    setIdeas(await db.loadIdeas(uid));
    const style = await db.loadStyleSamples(uid);
    setStyleSummary(style.summary);
    setStyleSamplesCount(style.count);
    setParseHistory(await db.loadParseHistory(uid));
    setPendingLinks(await db.loadPendingLinks(uid));
  }, []);

  useEffect(() => { if (user) loadAll(user.id); }, [user, loadAll]);

  const handleAnalyzeParsed = async () => {
    if (!parsedData) return;
    setAiAnalyzing(true); setAiNote("");
    try {
      const res = await fetch("/api/ai-analyze-parsed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsedData) });
      const data = await res.json();
      if (data.ok && data.result) setAiNote(data.result);
      else setAiNote("分析失败：" + (data.error || "未知错误"));
    } catch (e: any) { setAiNote("分析失败：" + e.message); }
    finally { setAiAnalyzing(false); }
  };

  const handleParse = async () => {
    const urlVal = (document.getElementById("parse-url-input") as HTMLInputElement)?.value?.trim() || "";
    if (!urlVal) return;
    setIsParsing(true); setIsExported(false);
    try {
      const res = await fetch("/api/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: urlVal }) });
      const data = await res.json();
      if (data.error) { alert("解析失败：" + data.error); }
      else {
        setParsedData(data);
        if (user) { await db.saveParseHistory(user.id, urlVal, data); setParseHistory(await db.loadParseHistory(user.id)); }
        else {
          const entry = { id: genId(), url: urlVal, title: data.title || "", author: data.author || "", stats: data.stats || {}, tags: data.tags || [], parsed_at: new Date().toISOString() };
          const next = [entry, ...parseHistory].slice(0, 50);
          setParseHistory(next); saveLocal(STORAGE_KEYS.parseHistory, next);
        }
      }
    } catch (e: any) { alert("解析失败：" + e.message); }
    finally { setIsParsing(false); }
  };

  const handleExport = async () => {
    if (!parsedData) return;
    try {
      const res = await fetch("/api/save-to-obsidian", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsedData) });
      const r = await res.json();
      alert(r.ok ? `✅ 已保存到 Obsidian：${r.relpath}` : "保存失败：" + JSON.stringify(r));
    } catch (e: any) { alert("保存失败：" + e.message); }
  };

  const handleSaveAiNote = async () => {
    if (!aiNote || !parsedData) return;
    setAiNoteSaved(false);
    try {
      const res = await fetch("/api/save-ai-note", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: parsedData.title || "笔记", content: aiNote }) });
      const r = await res.json();
      if (r.ok) { setAiNoteSaved(true); alert(`✅ 已保存到 Obsidian：${r.relpath}`); }
      else alert("保存失败：" + JSON.stringify(r));
    } catch (e: any) { alert("保存失败：" + e.message); }
  };

  const handleSaveToMaterial = async () => {
    if (!parsedData) return;
    if (user) {
      const r = await db.saveMaterial(user.id, parsedData);
      if (r.ok) { alert("✅ 已保存到素材库"); setMaterials(await db.loadMaterials(user.id)); }
      else alert(r.error || "保存失败");
    } else {
      const entry = { id: genId(), ...parsedData, savedAt: new Date().toISOString() };
      const next = [entry, ...materials];
      setMaterials(next); saveLocal(STORAGE_KEYS.materials, next);
      alert("✅ 已保存到素材库（本地）");
    }
  };

  const handleDeleteMaterial = async (id: number) => {
    if (user) { await db.deleteMaterial(id); setMaterials(await db.loadMaterials(user.id)); }
    else { const next = materials.filter(m => m.id !== id); setMaterials(next); saveLocal(STORAGE_KEYS.materials, next); }
  };

  const handleAddIdea = async () => {
    const text = (document.getElementById("idea-input") as HTMLInputElement)?.value?.trim() || "";
    if (!text) return;
    if (user) {
      const idea = await db.addIdea(user.id, text);
      setIdeas(prev => [{ id: typeof idea.id === 'number' ? idea.id : genId(), text: idea.text }, ...prev]);
    } else {
      const idea = { id: genId(), text };
      setIdeas(prev => [idea, ...prev]);
      saveLocal(STORAGE_KEYS.ideas, [{ id: idea.id, text: idea.text }, ...ideas]);
    }
    const inp = document.getElementById("idea-input") as HTMLInputElement;
    if (inp) inp.value = "";
  };

  const handleDeleteIdea = async (id: number) => {
    if (user) { await db.deleteIdea(id); }
    setIdeas(prev => { const next = prev.filter(i => i.id !== id); saveLocal(STORAGE_KEYS.ideas, next); return next; });
  };

  const handleRecommendTopics = async () => {
    if (ideas.length === 0) { alert("灵感库为空，先记一些灵感"); return; }
    setTopicsLoading(true);
    try {
      const res = await fetch("/api/topics/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ideas: ideas.map(i => i.text) }) });
      const d = await res.json();
      if (d.ok) setRecommendedTopics(d.topics);
    } catch {} finally { setTopicsLoading(false); }
  };

  const handleUseTopic = (topic: string) => {
    const ta = document.getElementById("ai-input") as HTMLTextAreaElement;
    if (ta) ta.value = topic;
    setActiveTab("generate");
  };

  const handleAnalyzeStyle = async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/style/analyze", { method: "POST" });
      const d = await res.json();
      if (d.ok) {
        setStyleSummary(d.summary);
        await db.updateStyleSummary(user.id, d.summary);
        alert("✅ 文风分析完成");
      }
    } catch {}
  };

  const handleClearStyle = async () => {
    if (!user) return;
    await db.clearStyle(user.id);
    setStyleSummary(""); setStyleSamplesCount(0);
  };

  const handleGenerate = async () => {
    const prompt = (document.getElementById("ai-input") as HTMLTextAreaElement)?.value?.trim() || "";
    if (!prompt) return;
    setAiResult("生成中..."); setGenRefsResult("");
    try {
      const res = await fetch("/api/ai-generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, mode: aiMode }) });
      const d = await res.json();
      setAiResult(d.ok ? d.result : ("生成失败：" + (d.error || "")));
    } catch (e: any) { setAiResult("生成失败：" + e.message); }
  };

  const handleGenerateWithRefs = async () => {
    const prompt = (document.getElementById("ai-input") as HTMLTextAreaElement)?.value?.trim() || "";
    if (!prompt) return;
    setIsGenWithRefs(true); setGenRefsResult(""); setAiResult("");
    const refContents = materials.filter(m => selectedRefIds.includes(m.id)).map(m => ({
      title: m.title, content: (m.content || "").substring(0, 500), tags: m.tags
    }));
    try {
      const res = await fetch("/api/generate-with-refs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, mode: aiMode, refIds: selectedRefIds, refContents, styleSample: styleSummary }) });
      const d = await res.json();
      setGenRefsResult(d.ok ? d.result : ("生成失败：" + (d.error || "")));
    } catch (e: any) { setGenRefsResult("生成失败：" + e.message); }
    finally { setIsGenWithRefs(false); }
  };

  const toggleRefId = (id: number) => { setSelectedRefIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); };

  const handleAddPendingLink = async () => {
    const urlVal = (document.getElementById("pending-url-input") as HTMLInputElement)?.value?.trim() || "";
    if (!urlVal) return;
    if (user) {
      const r = await db.addPendingLink(user.id, urlVal);
      if (r.ok) { setPendingLinks(prev => [r.link, ...prev]); const inp = document.getElementById("pending-url-input") as HTMLInputElement; if (inp) inp.value = ""; }
      else alert(r.error || "添加失败");
    } else {
      const entry = { id: genId(), url: urlVal, created_at: new Date().toISOString() };
      const next = [entry, ...pendingLinks];
      setPendingLinks(next); saveLocal(STORAGE_KEYS.pendingLinks, next);
      const inp = document.getElementById("pending-url-input") as HTMLInputElement;
      if (inp) inp.value = "";
    }
  };

  const handleDeletePendingLink = async (id: number) => {
    if (user) { await db.deletePendingLink(id); }
    setPendingLinks(prev => { const next = prev.filter(l => l.id !== id); saveLocal(STORAGE_KEYS.pendingLinks, next); return next; });
  };

  const handleParsePending = async (linkUrl: string) => {
    const inp = document.getElementById("parse-url-input") as HTMLInputElement;
    if (inp) inp.value = linkUrl;
    setActiveTab("parse");
  };

  // 登录时把 localStorage 数据同步到 Supabase
  useEffect(() => {
    if (!user) return;
    const sync = async () => {
      const localMats = loadLocal<any[]>(STORAGE_KEYS.materials, []);
      for (const m of localMats) {
        await db.saveMaterial(user.id, m);
      }
      const localIdeas = loadLocal<any[]>(STORAGE_KEYS.ideas, []);
      for (const i of localIdeas) {
        await db.addIdea(user.id, i.text);
      }
      const localPending = loadLocal<any[]>(STORAGE_KEYS.pendingLinks, []);
      for (const p of localPending) {
        await db.addPendingLink(user.id, p.url);
      }
      const localHistory = loadLocal<any[]>(STORAGE_KEYS.parseHistory, []);
      for (const h of localHistory) {
        await db.saveParseHistory(user.id, h.url, h);
      }
      // 清空 localStorage
      Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    };
    sync();
  }, [user]);

  // 加载 localStorage 数据（未登录时）
  useEffect(() => {
    if (user) return;
    setMaterials(loadLocal(STORAGE_KEYS.materials, []));
    setIdeas(loadLocal(STORAGE_KEYS.ideas, []));
    setPendingLinks(loadLocal(STORAGE_KEYS.pendingLinks, []));
    setParseHistory(loadLocal(STORAGE_KEYS.parseHistory, []));
  }, [user]);

  // 登录弹窗内联
  const closeModal = () => { setShowAuth(false); setAuthStep("email"); setAuthEmail(""); setAuthCode(""); setAuthError(""); };

  const searchInited = useRef(false);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center text-muted text-sm">加载中...</div>;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex overflow-hidden">
      {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed md:static inset-y-0 left-0 z-40 w-64 bg-white md:bg-secondary/30 border-r border-border flex flex-col transition-transform duration-200 md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-border/50">
          <div className="flex items-center gap-2 text-accent">
            <Sparkles size={22} className="fill-accent-light" />
            <span className="font-bold text-lg text-foreground tracking-wide">Ember<span className="text-muted font-normal text-sm ml-1">灵感助手</span></span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-muted hover:text-foreground"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto py-6 px-3 flex flex-col gap-1">
          <div className="px-3 mb-2 text-xs font-semibold text-muted uppercase tracking-wider">核心工具</div>
          <NavBtn tab="parse" icon={<LinkIcon size={18} />} label="小红书解析" />
          <NavBtn tab="pending" icon={<Link2 size={18} />} label={"待解析" + (pendingLinks.length > 0 ? ` ${pendingLinks.length}` : "")} />
          <NavBtn tab="ideas" icon={<Hash size={18} />} label="灵感碎片库" />
          <NavBtn tab="generate" icon={<FileText size={18} />} label="笔记生成" />
          <NavBtn tab="materials" icon={<Bookmark size={18} />} label={"素材库" + (materials.length > 0 ? ` ${materials.length}` : "")} />
          <NavBtn tab="history" icon={<History size={18} />} label="解析历史" />
          <div className="px-3 mt-8 mb-2 text-xs font-semibold text-muted uppercase tracking-wider">我的知识库</div>
          <button
            onClick={() => { const a = document.createElement('a'); a.href = 'obsidian://open?vault=Obsidian%20Vault'; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.click(); }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted hover:bg-secondary/30 w-full"
          >
            <Layout size={18} />
            <span>Obsidian 归档</span>
          </button>
        </div>
        <div className="p-4 border-t border-border">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-light to-accent flex items-center justify-center text-white font-bold text-sm">{user?.email?.[0]?.toUpperCase() || "U"}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.email || ""}</p>
                <p className="text-xs text-muted">已登录</p>
              </div>
              <button onClick={handleLogout} className="p-2 text-muted hover:text-foreground rounded-xl hover:bg-secondary/30"><LogOut size={16} /></button>
            </div>
          ) : (
            <button onClick={() => setShowAuth(true)} className="flex items-center gap-3 w-full p-2 hover:bg-secondary/50 rounded-xl transition-all">
              <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center text-muted"><Mail size={16} /></div>
              <span className="text-sm text-muted">邮箱登录</span>
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        <header className="h-16 flex items-center justify-between px-4 md:px-8 border-b border-border/30 bg-white/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 text-muted hover:text-foreground rounded-lg hover:bg-secondary/30"><Menu size={20} /></button>
            <div className="flex items-center gap-2 text-sm text-muted">
              <span>Workspace</span>
              <ChevronRight size={14} />
              <span className="text-foreground font-medium">{tabTitle(activeTab)}</span>
            </div>
          </div>
          {activeTab === "ideas" && (
            <button onClick={handleAddIdea} className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-foreground px-4 py-1.5 rounded-full text-sm font-medium shadow-sm transition-all"><Plus size={16} /> 记灵感</button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className={`${activeTab === "parse" ? "" : "hidden"}`} id="page-parse"><ParseContent /></div>
          <div className={`${activeTab === "pending" ? "" : "hidden"}`} id="page-pending"><PendingLinksContent /></div>
          <div className={`${activeTab === "ideas" ? "" : "hidden"}`} id="page-ideas"><IdeasContent /></div>
          <div className={`${activeTab === "generate" ? "" : "hidden"}`} id="page-generate"><GenerateContent /></div>
          <div className={`${activeTab === "materials" ? "" : "hidden"}`} id="page-materials">
            <div className="max-w-6xl mx-auto mb-10">
              <h1 className="text-3xl font-bold text-foreground mb-2">素材库</h1>
              <p className="text-muted">{user ? "保存的参考笔记素材，跨设备同步。" : "保存的参考笔记素材（本地存储）。"}</p>
            </div>
            <div className="max-w-6xl mx-auto">
              <div className="bg-white rounded-3xl p-4 md:p-6 shadow-sm border border-border mb-8">
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                  <div className="relative flex-1 max-w-md">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                    <input type="text" id="mat-input" placeholder="搜索素材..." autoComplete="off"
                      ref={el => {
                        if (el && !searchInited.current) {
                          searchInited.current = true;
                          const grid = document.getElementById("mat-grid");
                          if (!grid) return;
                          el.oninput = function () {
                            const q = (this as HTMLInputElement).value.toLowerCase();
                            if (!q) { grid.querySelectorAll("[data-mat-card]").forEach((c: any) => c.style.display = ""); return; }
                            grid.querySelectorAll("[data-mat-card]").forEach((c: any) => {
                              c.style.display = (c.dataset.searchTxt || "").indexOf(q) >= 0 ? "" : "none";
                            });
                          };
                        }
                      }}
                      className="w-full pl-12 pr-4 py-3 bg-background border border-border rounded-2xl outline-none text-sm focus:border-accent" />
                  </div>
                  <div className="flex gap-2 text-sm text-muted items-center">
                    <span>{materials.length} 个素材</span>
                    <button onClick={() => user ? loadAll(user.id) : setMaterials(loadLocal(STORAGE_KEYS.materials, []))} className="p-2 hover:bg-secondary/30 rounded-xl"><RefreshCw size={16} /></button>
                  </div>
                </div>
                {ideas.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <button onClick={handleRecommendTopics} disabled={topicsLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-accent/5 border border-accent/20 text-accent rounded-xl text-sm font-medium hover:bg-accent/10">
                      <Sparkles size={16} />{topicsLoading ? "分析中..." : "推荐话题"}
                    </button>
                    {recommendedTopics.length > 0 && (
                      <div className="mt-3 space-y-2">{recommendedTopics.map((t, i) => (
                        <div key={i} className="flex items-center justify-between bg-background rounded-xl px-4 py-3 border border-border">
                          <div><span className="text-sm font-medium text-foreground">{t.title}</span>{t.desc && <p className="text-xs text-muted mt-0.5">{t.desc}</p>}</div>
                          <button onClick={() => handleUseTopic(t.title)} className="text-xs px-3 py-1.5 bg-accent text-white rounded-xl font-medium">使用此话题</button>
                        </div>
                      ))}</div>
                    )}
                  </div>
                )}
              </div>
              <div id="mat-grid">
                {materials.length === 0 ? (
                  <div className="text-center py-20 text-muted text-sm">
                    <Bookmark size={48} className="mx-auto mb-4 opacity-30" />
                    素材库为空，解析笔记后点击"保存到素材库"
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {materials.map((mat: any) => (
                      <div key={mat.id} data-mat-card data-search-txt={`${mat.title||''} ${(mat.tags||[]).join(' ')} ${mat.author||''}`.toLowerCase()}
                        className="bg-white rounded-2xl p-5 border border-border shadow-sm hover:shadow transition-all">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <h3 className="text-sm font-semibold text-foreground line-clamp-2">{mat.title || "无标题"}</h3>
                          <button onClick={() => handleDeleteMaterial(mat.id)} className="text-muted hover:text-red-400 shrink-0"><Trash2 size={14} /></button>
                        </div>
                        {mat.content && <p className="text-xs text-muted line-clamp-2 mb-3">{mat.content.substring(0, 200)}</p>}
                        <div className="flex flex-wrap items-center gap-2">
                          {mat.author && <span className="text-xs text-muted bg-background px-2 py-0.5 rounded-lg">{mat.author}</span>}
                          {mat.tags?.slice(0, 3).map((tag: string) => <span key={tag} className="text-xs text-accent bg-[#fff0f2] px-2 py-0.5 rounded-lg">#{tag}</span>)}
                          {mat.stats?.likes && <span className="text-xs text-muted flex items-center gap-1"><Heart size={12} /> {mat.stats.likes}</span>}
                          {mat.stats?.collects && <span className="text-xs text-muted flex items-center gap-1"><Star size={12} /> {mat.stats.collects}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className={`${activeTab === "history" ? "" : "hidden"}`} id="page-history"><HistoryContent /></div>
        </div>
      </main>

      {showAuth && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={closeModal}>
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">{authStep === "email" ? "邮箱登录" : "输入验证码"}</h2>
            {authError && <p className="text-sm text-red-400 mb-3">{authError}</p>}
            {authStep === "email" ? (
              <>
                <div className="flex gap-3">
                  <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="输入邮箱地址" className="flex-1 px-4 py-3 bg-background border border-border rounded-2xl text-sm outline-none focus:border-accent" onKeyDown={e => { if (e.key === "Enter") handleSendCode(); }} />
                  <button onClick={handleSendCode} className="px-5 py-3 bg-accent text-white rounded-2xl font-medium text-sm hover:bg-accent/90 transition-all">发送验证码</button>
                </div>
                <p className="text-xs text-muted text-center mt-4">登录后可跨设备同步数据</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted mb-3">验证码已发送至 <span className="text-foreground font-medium">{authEmail}</span></p>
                <input type="text" value={authCode} onChange={e => setAuthCode(e.target.value)} placeholder="输入验证码" className="w-full px-4 py-3 bg-background border border-border rounded-2xl text-sm outline-none focus:border-accent" onKeyDown={e => { if (e.key === "Enter") handleVerifyCode(); }} />
                <button onClick={handleVerifyCode} className="w-full py-3 bg-accent text-white rounded-2xl font-medium text-sm mt-4 hover:bg-accent/90 transition-all">验证并登录</button>
                <p className="text-xs text-muted text-center mt-4 cursor-pointer hover:text-foreground" onClick={() => { setAuthStep("email"); setAuthCode(""); setAuthError(""); }}>返回上一步</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );

  function NavBtn({ tab, icon, label }: { tab: string; icon: React.ReactNode; label: string }) {
    const [iconPart, ...rest] = label.split(" ");
    const count = rest.join(" ");
    return (
      <button onClick={() => { setActiveTab(tab); setSidebarOpen(false); }}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab ? "bg-white shadow-sm text-foreground border border-border/50" : "text-muted hover:bg-secondary/30"}`}>
        <span className={activeTab === tab ? "text-accent" : ""}>{icon}</span>
        <span>{iconPart}</span>
        {count && <span className="ml-auto text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded-full">{count}</span>}
      </button>
    );
  }

  function tabTitle(tab: string) {
    const map: Record<string, string> = { parse: "小红书解析", pending: "待解析", ideas: "灵感碎片库", generate: "笔记生成", materials: "素材库", history: "解析历史" };
    return map[tab] || "";
  }

  function ParseContent() {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-foreground mb-2">解析爆款笔记</h1>
          <p className="text-muted">提取小红书链接内容，一键存入您的 Obsidian 知识库。</p>
        </div>
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-border mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <LinkIcon size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input type="text" id="parse-url-input" placeholder="在此粘贴小红书笔记链接..."
                className="w-full pl-12 pr-12 py-4 bg-background border border-border focus:border-accent rounded-2xl outline-none transition-all focus:bg-white focus:ring-4 focus:ring-accent-light/30" />
              <button id="parse-url-clear" onClick={() => { const i = document.getElementById('parse-url-input') as HTMLInputElement; if(i){i.value='';i.focus();} }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-foreground p-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <button onClick={handleParse} disabled={isParsing}
              className="px-8 py-4 bg-primary hover:bg-primary-hover disabled:opacity-50 text-foreground font-medium rounded-2xl shadow-sm hover:shadow-md transition-all min-w-[120px]">
              {isParsing ? <div className="w-5 h-5 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin mx-auto" /> : "开始解析"}
            </button>
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1"><CheckCircle2 size={14} className="text-accent" /> 支持图文提取</span>
            <span className="flex items-center gap-1"><CheckCircle2 size={14} className="text-accent" /> 自动识别标签</span>
            <span className="flex items-center gap-1"><CheckCircle2 size={14} className="text-accent" /> 无水印大图下载</span>
          </div>
          <div className="mt-3 px-3 py-2 bg-accent/5 border border-accent/20 rounded-xl text-xs text-muted flex items-start gap-2">
            <span className="shrink-0 mt-0.5">💡</span>
            <span>请粘贴<strong>完整的小红书链接</strong>。从 App 分享时选择"<strong>复制链接</strong>"。</span>
          </div>
        </div>

        {parsedData && (
          <div className="animate-[fadeIn_0.5s_ease-out]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2"><FileText size={20} className="text-accent-light" /> 解析结果预览</h2>
              <button onClick={handleExport}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${isExported ? "bg-secondary text-muted" : "bg-white border border-border text-foreground hover:border-accent hover:shadow-sm"}`}>
                {isExported ? <CheckCircle2 size={16} /> : <Download size={16} />}
                {isExported ? "已导出 .md" : "导出到 Obsidian"}
              </button>
            </div>
            <div className="bg-white rounded-3xl p-8 border border-border shadow-sm">
              <div className="flex flex-wrap items-center gap-4 mb-6 pb-6 border-b border-background">
                <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-lg text-sm"><span className="font-medium">{parsedData.author}</span></div>
                {parsedData.date && <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-lg text-sm text-muted"><Clock size={14} /> {parsedData.date}</div>}
                <div className="flex gap-3 text-sm text-muted ml-auto">
                  {parsedData.stats?.likes && <span className="flex items-center gap-1"><Heart size={14} className="text-accent" /> {parsedData.stats.likes}</span>}
                  {parsedData.stats?.collects && <span className="flex items-center gap-1"><Star size={14} className="text-accent" /> {parsedData.stats.collects}</span>}
                  {parsedData.stats?.comments && <span className="flex items-center gap-1"><MessageCircle size={14} /> {parsedData.stats.comments}</span>}
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-4 leading-snug">{parsedData.title}</h3>
              <p className="text-[#6b5a56] whitespace-pre-line leading-relaxed mb-4">{parsedData.content}</p>
              {parsedData.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-8">{parsedData.tags.map((t: string) => <span key={t} className="text-xs font-medium text-accent bg-[#fff0f2] px-3 py-1.5 rounded-full">#{t}</span>)}</div>
              )}
              <div className="flex gap-3 mb-6">
                <button onClick={handleAnalyzeParsed} disabled={aiAnalyzing}
                  className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent/90 text-white font-medium rounded-2xl text-sm shadow-sm transition-all disabled:opacity-50">
                  <Sparkles size={16} />{aiAnalyzing ? "生成中..." : "✨ 生成笔记"}</button>
                <button onClick={handleSaveToMaterial}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white border border-border text-foreground hover:border-accent font-medium rounded-2xl text-sm shadow-sm transition-all">
                  <Bookmark size={16} />保存到素材库</button>
              </div>
              {aiNote && (
                <div className="mb-4 bg-[#f8fafc] border border-[#e2e8f0] rounded-2xl p-5 overflow-x-auto">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#475569]"><Sparkles size={16} className="text-[#8b5cf6]" />结构化笔记</div>
                    <button onClick={handleSaveAiNote}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${aiNoteSaved ? "bg-secondary text-muted" : "bg-white border border-border text-foreground hover:border-accent hover:shadow-sm"}`}>
                      <Download size={12} />{aiNoteSaved ? "已保存 .md" : "保存到 Obsidian"}</button>
                  </div>
                  <div className="text-sm text-[#334155] whitespace-pre-line leading-relaxed">
                    {aiNote.split('\n').map((line, i) => (
                      line.startsWith('> [!') || line === '>' ? <div key={i} className="text-[#6366f1] font-medium my-1">{line}</div> : <div key={i}>{line}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!parsedData && !isParsing && (
          <div className="text-center py-20 px-4">
            <div className="w-24 h-24 bg-secondary/50 rounded-full flex items-center justify-center mx-auto mb-6">
              <div className="w-16 h-16 bg-border/50 rounded-full flex items-center justify-center text-accent-light"><Sparkles size={32} /></div>
            </div>
            <h3 className="text-lg font-medium text-muted mb-2">等待灵感注入</h3>
            <p className="text-muted text-sm max-w-sm mx-auto">输入小红书爆款笔记链接，将其转化为你个人知识库中的结构化灵感。</p>
          </div>
        )}
      </div>
    );
  }

  function PendingLinksContent() {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-foreground mb-2">待解析链接</h1>
          <p className="text-muted">电脑关机时先收藏链接，稍后在电脑上统一解析。</p>
        </div>
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-border mb-8">
          <div className="flex gap-3">
            <input type="text" id="pending-url-input" placeholder="粘贴小红书链接..."
              onKeyDown={e => { if (e.key === "Enter") { const v = (document.getElementById("pending-url-input") as HTMLInputElement)?.value?.trim(); if(v){ handleAddPendingLink(); } } }}
              className="flex-1 px-4 py-3 bg-background border border-border focus:border-accent rounded-2xl outline-none text-sm" />
            <button onClick={handleAddPendingLink} className="px-6 py-3 bg-primary hover:bg-primary-hover text-foreground font-medium rounded-2xl text-sm shadow-sm transition-all">添加</button>
          </div>
        </div>
        {pendingLinks.length === 0 ? (
          <div className="text-center py-16 text-muted text-sm">还没有待解析链接，在上方添加吧</div>
        ) : (
          <div className="space-y-3">
            {pendingLinks.map(link => (
              <div key={link.id} className="bg-white rounded-2xl p-4 border border-border shadow-sm flex items-center gap-3">
                <Link2 size={16} className="text-accent shrink-0" />
                <span className="text-sm text-foreground flex-1 truncate" title={link.url}>{link.url}</span>
                <button onClick={() => handleParsePending(link.url)} className="text-xs px-3 py-1.5 bg-accent/5 text-accent rounded-xl hover:bg-accent/10 font-medium shrink-0">去解析</button>
                <button onClick={() => handleDeletePendingLink(link.id)} className="text-muted hover:text-red-400 text-xs shrink-0">删除</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function IdeasContent() {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-foreground mb-2">灵感碎片库</h1>
          <p className="text-muted">随时记录碎片想法，跨设备同步。</p>
        </div>
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-border mb-8">
          <div className="flex gap-3">
            <input type="text" id="idea-input" placeholder="记录一条灵感..."
              onKeyDown={e => { if (e.key === "Enter") { const v = (document.getElementById("idea-input") as HTMLInputElement)?.value?.trim(); if(v){ handleAddIdea(); } } }}
              className="flex-1 px-4 py-3 bg-background border border-border focus:border-accent rounded-2xl outline-none text-sm" />
            <button onClick={handleAddIdea} className="px-6 py-3 bg-primary hover:bg-primary-hover text-foreground font-medium rounded-2xl text-sm shadow-sm transition-all">添加</button>
          </div>
        </div>
        {ideas.length === 0 ? (
          <div className="text-center py-16 text-muted text-sm">还没有灵感记录，在上方添加吧 ✨</div>
        ) : (
          <div className="space-y-3">
            {ideas.map(idea => (
              <div key={idea.id} className="bg-white rounded-2xl p-4 border border-border shadow-sm flex items-center gap-3">
                <Sparkles size={16} className="text-accent shrink-0" />
                <span className="text-sm text-foreground flex-1">{idea.text}</span>
                <button onClick={() => handleDeleteIdea(idea.id)} className="text-muted hover:text-red-400 text-xs">删除</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function GenerateContent() {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-foreground mb-2">笔记生成</h1>
          <p className="text-muted">记录你的想法，生成结构化笔记卡片。</p>
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-border">
            <button onClick={() => setShowMaterialPicker(!showMaterialPicker)} className="flex items-center justify-between w-full text-sm font-medium text-foreground">
              <span className="flex items-center gap-2"><BookOpen size={16} className="text-accent" />参考素材 {selectedRefIds.length > 0 && `（已选 ${selectedRefIds.length} 个）`}</span>
              <ChevronRight size={16} className={`transition-transform ${showMaterialPicker ? "rotate-90" : ""}`} />
            </button>
            {showMaterialPicker && (
              <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
                {materials.length === 0 ? <p className="text-xs text-muted text-center py-4">素材库为空</p> : materials.map((mat: any) => (
                  <label key={mat.id} className="flex items-center gap-3 p-3 bg-background rounded-xl border border-border cursor-pointer hover:border-accent/50 transition-all">
                    <input type="checkbox" checked={selectedRefIds.includes(mat.id)} onChange={() => toggleRefId(mat.id)} className="accent-accent" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{mat.title || "无标题"}</p>
                      <div className="flex gap-2 text-xs text-muted mt-0.5">
                        {mat.stats?.likes && <span>❤️ {mat.stats.likes}</span>}
                        {mat.stats?.collects && <span>⭐ {mat.stats.collects}</span>}
                        {mat.tags?.slice(0, 2).map((t: string) => <span key={t}>#{t}</span>)}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-border">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground"><PenLine size={16} className="text-accent" />文风设置</span>
              <div className="flex gap-2">
                {styleSamplesCount > 0 && <>
                  <span className="text-xs text-muted">{styleSamplesCount} 个样本</span>
                  <button onClick={handleAnalyzeStyle} className="text-xs px-3 py-1 bg-accent/5 text-accent rounded-xl font-medium hover:bg-accent/10">分析文风</button>
                  <button onClick={handleClearStyle} className="text-xs px-3 py-1 bg-red-50 text-red-400 rounded-xl hover:bg-red-100">清除</button>
                </>}
              </div>
            </div>
            {styleSummary ? <p className="mt-3 text-xs text-muted bg-background rounded-xl p-3 border border-border leading-relaxed">{styleSummary}</p>
              : styleSamplesCount === 0 && <p className="mt-2 text-xs text-muted">保存素材到素材库后，可分析你的文风</p>}
          </div>

          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-border">
            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground mb-3">选择模式</label>
              <div className="flex gap-3">
                <button onClick={() => setAiMode("auto")}
                  className={`flex-1 px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${aiMode === "auto" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent"}`}>⚡ 自动模式</button>
                <button onClick={() => setAiMode("colab")}
                  className={`flex-1 px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${aiMode === "colab" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent"}`}>✍️ 协作模式</button>
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground mb-2">你的想法</label>
              <textarea id="ai-input" rows={6} placeholder="写下你的想法..."
                className="w-full px-4 py-3 bg-background border border-border focus:border-accent rounded-2xl outline-none text-sm resize-none" />
            </div>
            <div className="flex gap-3">
              {(selectedRefIds.length > 0 || styleSummary) ? (
                <button onClick={handleGenerateWithRefs} disabled={isGenWithRefs}
                  className="px-8 py-3 bg-accent hover:bg-accent/90 text-white font-medium rounded-2xl text-sm shadow-sm transition-all disabled:opacity-50">
                  {isGenWithRefs ? "生成中..." : "✨ 带参考生成"}</button>
              ) : null}
              <button onClick={handleGenerate}
                className="px-8 py-3 bg-primary hover:bg-primary-hover text-foreground font-medium rounded-2xl text-sm shadow-sm transition-all">开始生成</button>
            </div>
            {genRefsResult && <div className="mt-6 bg-background rounded-2xl p-6 border border-border"><h3 className="text-sm font-medium text-foreground mb-3">生成结果</h3><p className="text-sm text-muted whitespace-pre-line">{genRefsResult}</p></div>}
            {aiResult && !genRefsResult && <div className="mt-6 bg-background rounded-2xl p-6 border border-border"><h3 className="text-sm font-medium text-foreground mb-3">生成结果</h3><p className="text-sm text-muted whitespace-pre-line">{aiResult}</p></div>}
          </div>
        </div>
      </div>
    );
  }

  function HistoryContent() {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-foreground mb-2">解析历史</h1>
          <p className="text-muted">你解析过的所有小红书笔记。</p>
        </div>
        {parseHistory.length === 0 ? (
          <div className="text-center py-20 text-muted text-sm"><History size={48} className="mx-auto mb-4 opacity-30" />暂无解析记录</div>
        ) : (
          <div className="space-y-3">
            {parseHistory.map((h: any) => (
              <div key={h.id} className="bg-white rounded-2xl p-4 border border-border shadow-sm flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{h.title || "无标题"}</p>
                  <div className="flex gap-3 text-xs text-muted mt-1">
                    {h.author && <span>{h.author}</span>}
                    {h.stats?.likes && <span>❤️ {h.stats.likes}</span>}
                    {h.stats?.collects && <span>⭐ {h.stats.collects}</span>}
                    {h.tags?.slice(0, 2).map((t: string) => <span key={t}>#{t}</span>)}
                  </div>
                </div>
                <span className="text-xs text-muted shrink-0">{new Date(h.parsed_at).toLocaleDateString("zh-CN")}</span>
                <button onClick={() => { const inp = document.getElementById("parse-url-input") as HTMLInputElement; if(inp) inp.value = h.url; setActiveTab("parse"); }}
                  className="text-xs px-3 py-1.5 bg-accent/5 text-accent rounded-xl hover:bg-accent/10 font-medium">重新解析</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
}
