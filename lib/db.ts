import { supabase } from "./supabase";

// ── 素材库 ─────────────────────────────────
export async function loadMaterials(userId: string) {
  const { data } = await supabase
    .from("materials")
    .select("*")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });
  return data || [];
}

export async function saveMaterial(userId: string, note: any) {
  const { data: existing } = await supabase
    .from("materials")
    .select("id")
    .eq("user_id", userId)
    .or(`note_id.eq.${note.noteId || ""},url.eq.${note.url || ""}`)
    .maybeSingle();
  if (existing) return { ok: false, error: "该笔记已在素材库中" };

  const { data, error } = await supabase.from("materials").insert({
    user_id: userId,
    title: note.title || "",
    content: note.content || "",
    author: note.author || "",
    date: note.date || "",
    tags: note.tags || [],
    url: note.url || "",
    stats: note.stats || {},
    images: note.images || [],
    note_id: note.noteId || "",
    transcript: note.transcript || "",
  }).select().single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, material: data };
}

export async function deleteMaterial(id: number) {
  const { error } = await supabase.from("materials").delete().eq("id", id);
  return { ok: !error };
}

// ── 灵感碎片 ─────────────────────────────────
export async function loadIdeas(userId: string) {
  const { data } = await supabase
    .from("ideas")
    .select("id, text")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data || [];
}

export async function addIdea(userId: string, text: string) {
  const { data } = await supabase.from("ideas").insert({
    user_id: userId, text
  }).select("id, text").single();
  return data || { id: Date.now(), text };
}

export async function deleteIdea(id: number) {
  await supabase.from("ideas").delete().eq("id", id);
}

// ── 文风 ─────────────────────────────────
export async function loadStyleSamples(userId: string) {
  const { data } = await supabase
    .from("style_samples")
    .select("*")
    .eq("user_id", userId)
    .order("added_at", { ascending: false });
  const summary = data?.[0]?.summary || "";
  return { samples: data || [], summary, count: data?.length || 0 };
}

export async function saveStyleSample(userId: string, text: string) {
  await supabase.from("style_samples").insert({
    user_id: userId, text: text.slice(0, 2000)
  });
}

export async function updateStyleSummary(userId: string, summary: string) {
  // 只更新最新的样本
  const { data: latest } = await supabase
    .from("style_samples")
    .select("id")
    .eq("user_id", userId)
    .order("added_at", { ascending: false })
    .limit(1);
  if (latest?.length) {
    await supabase.from("style_samples").update({ summary }).eq("id", latest[0].id);
  }
}

export async function clearStyle(userId: string) {
  await supabase.from("style_samples").delete().eq("user_id", userId);
}

// ── 解析历史 ─────────────────────────────────
export async function saveParseHistory(userId: string, url: string, note: any) {
  await supabase.from("parse_history").insert({
    user_id: userId,
    url,
    title: note.title || "",
    content: note.content || "",
    author: note.author || "",
    date: note.date || "",
    tags: note.tags || [],
    stats: note.stats || {},
    images: note.images || [],
    note_id: note.noteId || "",
    transcript: note.transcript || "",
  });
}

export async function loadParseHistory(userId: string) {
  const { data } = await supabase
    .from("parse_history")
    .select("id, url, title, author, stats, tags, parsed_at")
    .eq("user_id", userId)
    .order("parsed_at", { ascending: false })
    .limit(50);
  return data || [];
}

// ── 待解析链接 ─────────────────────────────────
export async function loadPendingLinks(userId: string) {
  const { data } = await supabase
    .from("pending_links")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data || [];
}

export async function addPendingLink(userId: string, url: string) {
  const { data: existing } = await supabase
    .from("pending_links")
    .select("id")
    .eq("user_id", userId)
    .eq("url", url)
    .maybeSingle();
  if (existing) return { ok: false, error: "该链接已存在" };
  const { data, error } = await supabase.from("pending_links").insert({
    user_id: userId, url
  }).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, link: data };
}

export async function deletePendingLink(id: number) {
  const { error } = await supabase.from("pending_links").delete().eq("id", id);
  return { ok: !error };
}

/*
╔═══════════════════════════════════════════════════════════╗
║  Supabase 建表 SQL（在 Supabase 控制台 → SQL Editor 执行）    ║
╚═══════════════════════════════════════════════════════════╝

create table pending_links (
  id bigint primary key generated always as identity,
  user_id uuid references auth.users not null,
  url text not null,
  created_at timestamptz default now()
);

alter table pending_links enable row level security;

create policy "用户只能读写自己的待解析链接"
  on pending_links for all
  using (auth.uid() = user_id);
*/
