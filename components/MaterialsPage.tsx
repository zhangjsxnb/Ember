"use client";

import { useRef } from "react";
import { Search, RefreshCw, Trash2, Bookmark, Sparkles, Heart, Star, LogIn } from "lucide-react";

export default function MaterialsPage({
  user, materials, ideas, recommendedTopics, topicsLoading,
  onRefresh, onDelete, onRecommend, onUseTopic, onShowAuth
}: {
  user: any; materials: any[]; ideas: any[]; recommendedTopics: {title:string;desc:string}[];
  topicsLoading: boolean;
  onRefresh: () => void; onDelete: (id: number) => void;
  onRecommend: () => void; onUseTopic: (t: string) => void; onShowAuth: () => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);

  // 完全原生的搜索，不经过 React
  const setupSearch = () => {
    if (typeof window === "undefined") return;
    const input = document.getElementById("mat-search-real") as HTMLInputElement;
    if (!input) return;
    
    input.oninput = () => {
      const q = input.value.toLowerCase();
      const cards = document.querySelectorAll("[data-mat-card]");
      let visible = 0;
      cards.forEach((el: any) => {
        const txt = (el.dataset.searchText || "").toLowerCase();
        const show = !q || txt.includes(q);
        el.style.display = show ? "" : "none";
        if (show) visible++;
      });
      const empty = document.getElementById("mat-empty-real");
      if (empty) empty.style.display = visible === 0 && cards.length > 0 ? "" : "none";
    };
  };

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-10"><h1 className="text-3xl font-bold text-foreground mb-2">素材库</h1><p className="text-muted">保存的参考笔记素材，跨设备同步。</p></div>
        <div className="text-center py-20">
          <LogIn size={48} className="mx-auto mb-4 text-muted opacity-30" />
          <p className="text-muted text-sm mb-4">请先登录以使用此功能</p>
          <button onClick={onShowAuth} className="px-6 py-3 bg-accent text-white rounded-2xl text-sm font-medium">登录 / 注册</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-10"><h1 className="text-3xl font-bold text-foreground mb-2">素材库</h1><p className="text-muted">保存的参考笔记素材，跨设备同步。</p></div>
      
      {/* 搜索栏 - 纯原生HTML */}
      <div className="bg-white rounded-3xl p-4 md:p-6 shadow-sm border border-border mb-8">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            {/* 这是裸input，没有任何React绑定 */}
            <input 
              id="mat-search-real"
              type="text" 
              placeholder="搜索素材..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              className="w-full pl-12 pr-4 py-3 bg-background border border-border rounded-2xl outline-none text-sm focus:border-accent"
            />
            <script dangerouslySetInnerHTML={{__html: `(${setupSearch.toString()})()`}} />
          </div>
          <div className="flex gap-2 text-sm text-muted items-center">
            <span>{materials.length} 个素材</span>
            <button onClick={onRefresh} className="p-2 hover:bg-secondary/30 rounded-xl"><RefreshCw size={16} /></button>
          </div>
        </div>

        {ideas.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <button onClick={onRecommend} disabled={topicsLoading}
              className="flex items-center gap-2 px-4 py-2 bg-accent/5 border border-accent/20 text-accent rounded-xl text-sm font-medium hover:bg-accent/10">
              <Sparkles size={16} />{topicsLoading ? "分析中..." : "推荐话题"}
            </button>
            {recommendedTopics.length > 0 && (
              <div className="mt-3 space-y-2">{recommendedTopics.map((t, i) => (
                <div key={i} className="flex items-center justify-between bg-background rounded-xl px-4 py-3 border border-border">
                  <div><span className="text-sm font-medium text-foreground">{t.title}</span>{t.desc && <p className="text-xs text-muted mt-0.5">{t.desc}</p>}</div>
                  <button onClick={() => onUseTopic(t.title)} className="text-xs px-3 py-1.5 bg-accent text-white rounded-xl font-medium">使用此话题</button>
                </div>
              ))}</div>
            )}
          </div>
        )}
      </div>

      <div id="mat-empty-real" style={{display:"none"}} className="text-center py-20 text-muted text-sm">
        <Bookmark size={48} className="mx-auto mb-4 opacity-30" />
        没有匹配的素材
      </div>

      {materials.length === 0 ? (
        <div className="text-center py-20 text-muted text-sm">
          <Bookmark size={48} className="mx-auto mb-4 opacity-30" />
          素材库为空，解析笔记后点击"保存到素材库"
        </div>
      ) : (
        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {materials.map((mat: any) => (
            <div key={mat.id} 
              data-mat-card 
              data-search-text={`${mat.title || ""} ${(mat.tags || []).join(" ")} ${mat.author || ""}`}
              className="bg-white rounded-2xl p-5 border border-border shadow-sm hover:shadow transition-all">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="text-sm font-semibold text-foreground line-clamp-2">{mat.title || "无标题"}</h3>
                <button onClick={() => onDelete(mat.id)} className="text-muted hover:text-red-400 shrink-0"><Trash2 size={14} /></button>
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
  );
}
