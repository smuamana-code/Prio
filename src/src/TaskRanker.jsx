import React, { useState, useEffect, useRef } from "react";

// ────────────────────────────────────────────────────────────────────────────
// Task Ranker — no API, fully client-side.
// Flow: dump → manually drag tasks into categories (+ set duration & difficulty)
//       → rank by binary-insertion battles → configure per-day scheduling rules
//       → generate week → drag to adjust → export .ics for Google Calendar.
// ────────────────────────────────────────────────────────────────────────────

const COLORS = {
  navy: "#0F1729", card: "#1E2D4A", amber: "#F5A623", white: "#F5F0E8",
  muted: "#8896A8", border: "rgba(136,150,168,0.2)", green: "#3DD68C",
  red: "#F06B6B", blue: "#7CB9F5",
};

const DEFAULT_CATEGORIES = {
  heavy:    { label: "Time intensive", dot: COLORS.amber },
  short:    { label: "Quick",          dot: COLORS.green },
  fun:      { label: "Fun",            dot: COLORS.green },
  tedious:  { label: "Tedious",        dot: COLORS.red },
  physical: { label: "Physical",       dot: COLORS.blue },
  seated:   { label: "Desk / seated",  dot: COLORS.amber },
  admin:    { label: "Admin",          dot: COLORS.muted },
  creative: { label: "Creative",       dot: COLORS.green },
};
// Palette new categories cycle through for their dot color.
const DOT_PALETTE = [COLORS.amber, COLORS.green, COLORS.blue, COLORS.red, COLORS.muted, "#C792EA", "#F78C6C"];
const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const EXAMPLE_TASKS = [
  "Write project proposal", "Call dentist", "Clean apartment", "Finish quarterly report",
  "Go for a run", "Sort invoices", "Read 20 pages", "Design new logo concept",
  "Reply to emails", "Buy groceries",
];

// ─── Persistence ─────────────────────────────────────────────────────────────
// Mirrors useState but syncs to localStorage. Guarded so it degrades gracefully
// in environments without localStorage (it just behaves like plain useState).
function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = typeof localStorage !== "undefined" && localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or unavailable — ignore */
    }
  }, [key, value]);
  return [value, setValue];
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function TaskRanker() {
  const [screen, setScreen] = usePersistentState("tr_screen", "dump");
  const [rawText, setRawText] = usePersistentState("tr_rawText", "");
  const [tasks, setTasks] = usePersistentState("tr_tasks", []);     // { id, name, cat, duration, difficulty }
  const [ranked, setRanked] = usePersistentState("tr_ranked", []);
  const [dayRules, setDayRules] = usePersistentState("tr_dayRules", defaultDayRules());
  const [week, setWeek] = usePersistentState("tr_week", null);
  const [categories, setCategories] = usePersistentState("tr_categories", DEFAULT_CATEGORIES);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.navy, color: COLORS.white, fontFamily: "'Inter', system-ui, sans-serif", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <div style={{ flex: 1, padding: "24px 18px 12px" }}>
          {screen === "dump" && (
            <DumpScreen
              rawText={rawText} setRawText={setRawText}
              onNext={(text) => {
                const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
                setTasks(lines.map((name) => ({
                  id: Math.random().toString(36).slice(2),
                  name, cat: null, duration: 30, difficulty: 3,
                })));
                setScreen("sort");
              }}
            />
          )}
          {screen === "sort" && (
            <SortScreen
              tasks={tasks} setTasks={setTasks}
              categories={categories} setCategories={setCategories}
              onBack={() => setScreen("dump")} onNext={() => setScreen("battle")}
            />
          )}
          {screen === "battle" && (
            <BattleScreen tasks={tasks.filter((t) => t.cat)} categories={categories} onComplete={(list) => { setRanked(list); setScreen("rank"); }} />
          )}
          {screen === "rank" && (
            <RankScreen ranked={ranked} setRanked={setRanked} categories={categories} onNext={() => setScreen("config")} onRestart={() => { setScreen("dump"); setTasks([]); setRanked([]); setWeek(null); }} />
          )}
          {screen === "config" && (
            <ConfigScreen
              dayRules={dayRules} setDayRules={setDayRules} categories={categories}
              onBack={() => setScreen("rank")}
              onGenerate={() => { setWeek(buildSchedule(ranked, dayRules, categories)); setScreen("week"); }}
            />
          )}
          {screen === "week" && (
            <WeekScreen week={week} setWeek={setWeek} dayRules={dayRules} categories={categories} onBack={() => setScreen("config")} />
          )}
        </div>
        <BottomNav screen={screen} hasData={tasks.length > 0} hasRanked={ranked.length > 0} onNav={setScreen} />
      </div>
    </div>
  );
}

function defaultDayRules() {
  // Each day: { off, cats:[], maxHours, pairTimeShort, pairHardEasy }
  const r = {};
  ALL_DAYS.forEach((d) => {
    r[d] = { off: d === "Sunday", cats: [], maxHours: 4, pairTimeShort: false, pairHardEasy: false };
  });
  return r;
}

// ─── Shared UI ───────────────────────────────────────────────────────────────
function StepLabel({ children }) {
  return <div style={{ fontSize: 11, letterSpacing: "0.08em", fontFamily: "monospace", color: COLORS.amber, marginBottom: 8 }}>{children}</div>;
}
function H1({ children }) { return <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{children}</h1>; }
function Muted({ children, style }) { return <p style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.5, margin: "6px 0 0", ...style }}>{children}</p>; }
function PrimaryButton({ children, onClick, style, disabled }) {
  return <button onClick={onClick} disabled={disabled} style={{ width: "100%", padding: 13, borderRadius: 8, border: "none", background: disabled ? COLORS.card : COLORS.amber, color: disabled ? COLORS.muted : "#1a1000", fontSize: 15, fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer", ...style }}>{children}</button>;
}
function GhostButton({ children, onClick, style }) {
  return <button onClick={onClick} style={{ width: "100%", padding: 13, borderRadius: 8, border: `0.5px solid ${COLORS.border}`, background: "transparent", color: COLORS.muted, fontSize: 14, fontWeight: 500, cursor: "pointer", ...style }}>{children}</button>;
}
function SectionTitle({ children }) {
  return <div style={{ fontSize: 11, color: COLORS.muted, letterSpacing: "0.08em", margin: "16px 0 6px", fontFamily: "monospace" }}>{children}</div>;
}
function CatPill({ cat, categories }) {
  const info = (categories && categories[cat]) || { label: cat };
  return <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "rgba(245,166,35,0.13)", color: COLORS.amber }}>{info.label}</span>;
}
function diffLabel(d) { return ["Very easy", "Easy", "Medium", "Hard", "Very hard"][d - 1] || "Medium"; }

// ─── Screen 1: Dump ──────────────────────────────────────────────────────────
function DumpScreen({ rawText, setRawText, onNext }) {
  return (
    <div>
      <StepLabel>STEP 1 OF 5</StepLabel>
      <H1>Brain dump</H1>
      <Muted>List everything on your plate — one task per line.</Muted>
      <button onClick={() => setRawText(EXAMPLE_TASKS.join("\n"))} style={{ margin: "14px 0 10px", padding: "5px 11px", borderRadius: 20, fontSize: 12, background: COLORS.card, color: COLORS.muted, border: `0.5px solid ${COLORS.border}`, cursor: "pointer" }}>+ load example tasks</button>
      <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder={"Write a proposal\nCall the dentist\nGo for a run"} style={{ width: "100%", minHeight: 200, background: COLORS.card, color: COLORS.white, border: `0.5px solid ${COLORS.border}`, borderRadius: 8, padding: 12, fontSize: 14, lineHeight: 1.6, resize: "none", outline: "none", fontFamily: "inherit", marginBottom: 14 }} />
      <PrimaryButton onClick={() => rawText.trim() && onNext(rawText)}>Next: sort into categories →</PrimaryButton>
    </div>
  );
}

// ─── Screen 2: Manual categorization + sliders + editable categories ─────────
function SortScreen({ tasks, setTasks, categories, setCategories, onBack, onNext }) {
  const dragRef = useRef(null);
  const [overCat, setOverCat] = useState(null);
  const [expanded, setExpanded] = useState(null); // task id whose sliders are open
  const [editingCat, setEditingCat] = useState(null); // category key being renamed
  const [editValue, setEditValue] = useState("");
  const [manageMode, setManageMode] = useState(false);

  const catKeys = Object.keys(categories);
  const unsorted = tasks.filter((t) => !t.cat);
  const allSorted = unsorted.length === 0;

  function assignCat(taskId, cat) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, cat } : t)));
  }
  function updateTask(taskId, patch) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  }
  function onDrop(cat) {
    const id = dragRef.current; dragRef.current = null; setOverCat(null);
    if (id) assignCat(id, cat);
  }

  // ── Category management ──
  function addCategory() {
    const key = "cat_" + Math.random().toString(36).slice(2, 8);
    const dot = DOT_PALETTE[catKeys.length % DOT_PALETTE.length];
    setCategories((prev) => ({ ...prev, [key]: { label: "New category", dot } }));
    setEditingCat(key); setEditValue("New category");
  }
  function renameCategory(key, label) {
    const clean = label.trim();
    if (clean) setCategories((prev) => ({ ...prev, [key]: { ...prev[key], label: clean } }));
    setEditingCat(null);
  }
  function deleteCategory(key) {
    // Return any tasks in this category to the unsorted tray.
    setTasks((prev) => prev.map((t) => (t.cat === key ? { ...t, cat: null } : t)));
    setCategories((prev) => { const n = { ...prev }; delete n[key]; return n; });
  }

  return (
    <div>
      <StepLabel>STEP 2 OF 5</StepLabel>
      <H1>Sort into categories</H1>
      <Muted>Drag each task into a category. Tap a sorted task to set duration and difficulty.</Muted>

      {/* Unsorted tray */}
      <SectionTitle>UNSORTED ({unsorted.length})</SectionTitle>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 38, padding: unsorted.length ? 0 : 8 }}>
        {unsorted.length === 0 && <span style={{ fontSize: 12, color: COLORS.green }}>✓ All tasks sorted</span>}
        {unsorted.map((t) => (
          <div key={t.id} draggable onDragStart={() => { dragRef.current = t.id; }}
            style={{ padding: "7px 11px", borderRadius: 8, fontSize: 13, background: COLORS.card, border: `0.5px solid ${COLORS.border}`, cursor: "grab" }}>
            ⠿ {t.name}
          </div>
        ))}
      </div>

      {/* Category header with manage toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 6px" }}>
        <span style={{ fontSize: 11, color: COLORS.muted, letterSpacing: "0.08em", fontFamily: "monospace" }}>CATEGORIES</span>
        <button onClick={() => { setManageMode((m) => !m); setEditingCat(null); }} style={{ fontSize: 11, color: COLORS.amber, background: "none", border: "none", cursor: "pointer", fontFamily: "monospace" }}>
          {manageMode ? "done" : "✎ edit"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {catKeys.map((cat) => {
          const inCat = tasks.filter((t) => t.cat === cat);
          const info = categories[cat];
          return (
            <div key={cat}
              onDragOver={(e) => { e.preventDefault(); setOverCat(cat); }}
              onDragLeave={() => setOverCat((c) => (c === cat ? null : c))}
              onDrop={() => onDrop(cat)}
              style={{ background: COLORS.card, borderRadius: 8, border: `0.5px solid ${overCat === cat ? COLORS.amber : COLORS.border}`, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", borderBottom: inCat.length ? `0.5px solid ${COLORS.border}` : "none", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: info.dot }} />
                {editingCat === cat ? (
                  <input
                    autoFocus value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => renameCategory(cat, editValue)}
                    onKeyDown={(e) => { if (e.key === "Enter") renameCategory(cat, editValue); }}
                    style={{ flex: 1, background: COLORS.navy, color: COLORS.white, border: `0.5px solid ${COLORS.amber}`, borderRadius: 5, padding: "3px 7px", fontSize: 12, fontFamily: "monospace", outline: "none" }}
                  />
                ) : (
                  <span
                    onClick={() => { if (manageMode) { setEditingCat(cat); setEditValue(info.label); } }}
                    style={{ fontSize: 12, color: COLORS.amber, fontFamily: "monospace", fontWeight: 500, letterSpacing: "0.04em", cursor: manageMode ? "text" : "default", flex: 1 }}>
                    {info.label.toUpperCase()}
                  </span>
                )}
                {manageMode && editingCat !== cat && (
                  <>
                    <button onClick={() => { setEditingCat(cat); setEditValue(info.label); }} style={{ fontSize: 11, color: COLORS.muted, background: "none", border: "none", cursor: "pointer" }}>rename</button>
                    <button onClick={() => deleteCategory(cat)} style={{ fontSize: 11, color: COLORS.red, background: "none", border: "none", cursor: "pointer" }}>delete</button>
                  </>
                )}
                {!manageMode && <span style={{ fontSize: 11, color: COLORS.muted, marginLeft: "auto" }}>{inCat.length || ""}</span>}
              </div>
              {inCat.length > 0 && (
                <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {inCat.map((t) => (
                    <div key={t.id}>
                      <div onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 0" }}>
                        <span style={{ fontSize: 13, flex: 1 }}>{t.name}</span>
                        <span style={{ fontSize: 11, color: COLORS.muted, fontFamily: "monospace" }}>{t.duration}m · {diffLabel(t.difficulty)}</span>
                        <span style={{ color: COLORS.muted, fontSize: 12 }}>{expanded === t.id ? "▴" : "▾"}</span>
                      </div>
                      {expanded === t.id && (
                        <div style={{ padding: "8px 0 10px" }}>
                          <SliderRow label="Duration" value={`${t.duration} min`}>
                            <input type="range" min={5} max={240} step={5} value={t.duration}
                              onChange={(e) => updateTask(t.id, { duration: Number(e.target.value) })}
                              style={{ width: "100%", accentColor: COLORS.amber }} />
                          </SliderRow>
                          <SliderRow label="Difficulty" value={diffLabel(t.difficulty)}>
                            <input type="range" min={1} max={5} step={1} value={t.difficulty}
                              onChange={(e) => updateTask(t.id, { difficulty: Number(e.target.value) })}
                              style={{ width: "100%", accentColor: COLORS.amber }} />
                          </SliderRow>
                          <button onClick={() => assignCat(t.id, null)} style={{ fontSize: 11, color: COLORS.muted, background: "none", border: "none", cursor: "pointer", padding: "4px 0", textDecoration: "underline" }}>remove from category</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {manageMode && (
        <button onClick={addCategory} style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 8, border: `0.5px dashed ${COLORS.border}`, background: "transparent", color: COLORS.amber, fontSize: 13, cursor: "pointer" }}>
          + Add category
        </button>
      )}

      <div style={{ marginTop: 14 }}>
        <PrimaryButton onClick={onNext} disabled={!allSorted} style={{ marginBottom: 8 }}>
          {allSorted ? "Start ranking battles ⚔" : `Sort ${unsorted.length} more task${unsorted.length === 1 ? "" : "s"}`}
        </PrimaryButton>
        <GhostButton onClick={onBack}>← Edit tasks</GhostButton>
      </div>
    </div>
  );
}

function SliderRow({ label, value, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: COLORS.muted, marginBottom: 3 }}>
        <span>{label}</span><span style={{ color: COLORS.amber, fontFamily: "monospace" }}>{value}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Screen 3: Battle (binary insertion) ─────────────────────────────────────
function BattleScreen({ tasks, categories, onComplete }) {
  const engine = useRef(null);
  const [matchup, setMatchup] = useState(null);
  const [progress, setProgress] = useState({ placed: 1, total: tasks.length, taps: 0 });
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    if (tasks.length === 0) { onComplete([]); return; }
    if (tasks.length === 1) { onComplete([tasks[0]]); return; }
    engine.current = { ranked: [tasks[0]], queue: tasks.slice(1), incoming: null, lo: 0, hi: 0, taps: 0 };
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function advance() {
    const e = engine.current;
    if (e.incoming !== null && e.lo < e.hi) {
      const mid = Math.floor((e.lo + e.hi) / 2);
      setMatchup({ incoming: e.incoming, against: e.ranked[mid], midIdx: mid });
      return;
    }
    if (e.incoming !== null && e.lo >= e.hi) { e.ranked.splice(e.lo, 0, e.incoming); e.incoming = null; }
    if (e.incoming === null) {
      if (e.queue.length === 0) { setProgress((p) => ({ ...p, placed: e.ranked.length })); onComplete(e.ranked); return; }
      e.incoming = e.queue.shift(); e.lo = 0; e.hi = e.ranked.length;
      setProgress((p) => ({ ...p, placed: e.ranked.length }));
      const mid = Math.floor((e.lo + e.hi) / 2);
      setMatchup({ incoming: e.incoming, against: e.ranked[mid], midIdx: mid });
    }
  }

  function choose(incomingWins) {
    const e = engine.current;
    const mid = Math.floor((e.lo + e.hi) / 2);
    e.taps += 1; setProgress((p) => ({ ...p, taps: e.taps }));
    setFlash(incomingWins ? "incoming" : "against");
    setTimeout(() => {
      if (incomingWins) e.hi = mid; else e.lo = mid + 1;
      setFlash(null); advance();
    }, 280);
  }

  if (!matchup) return (<div><StepLabel>STEP 3 OF 5</StepLabel><H1>Setting up…</H1></div>);

  let estTotal = 0;
  for (let i = 1; i < tasks.length; i++) estTotal += Math.ceil(Math.log2(i + 1));
  const pct = Math.min(100, Math.round((progress.taps / Math.max(estTotal, 1)) * 100));

  return (
    <div>
      <StepLabel>STEP 3 OF 5</StepLabel>
      <H1>Which matters more?</H1>
      <Muted>Go with your gut.</Muted>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 4px" }}>
        <div style={{ flex: 1, height: 3, background: COLORS.border, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: COLORS.amber, borderRadius: 2, transition: "width 0.3s" }} />
        </div>
        <span style={{ fontSize: 11, color: COLORS.muted, fontFamily: "monospace", whiteSpace: "nowrap" }}>{progress.placed} / {tasks.length} ranked</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "14px 0" }}>
        <BattleCard task={matchup.incoming} categories={categories} role="new task" highlight={flash === "incoming"} onClick={() => choose(true)} />
        <div style={{ textAlign: "center", fontSize: 10, letterSpacing: "0.12em", color: COLORS.muted, fontFamily: "monospace" }}>VS</div>
        <BattleCard task={matchup.against} categories={categories} role={`ranked #${matchup.midIdx + 1}`} highlight={flash === "against"} onClick={() => choose(false)} />
      </div>
      <Muted style={{ textAlign: "center", fontSize: 11 }}>{progress.taps} comparison{progress.taps === 1 ? "" : "s"} so far</Muted>
    </div>
  );
}

function BattleCard({ task, categories, role, highlight, onClick }) {
  return (
    <button onClick={onClick} style={{ background: highlight ? "rgba(61,214,140,0.08)" : COLORS.card, border: `0.5px solid ${highlight ? COLORS.green : COLORS.border}`, borderRadius: 14, padding: "18px 16px", cursor: "pointer", textAlign: "left", transition: "border-color 0.15s, background 0.15s", color: COLORS.white, width: "100%" }}>
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>{task.name}</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <CatPill cat={task.cat} categories={categories} />
        <span style={{ fontSize: 12, color: COLORS.muted }}>~{task.duration} min</span>
        <span style={{ fontSize: 11, color: COLORS.muted, marginLeft: "auto", fontFamily: "monospace" }}>{role}</span>
      </div>
    </button>
  );
}

// ─── Screen 4: Ranking ───────────────────────────────────────────────────────
function RankScreen({ ranked, setRanked, categories, onNext, onRestart }) {
  const dragIdx = useRef(null);
  const [overIdx, setOverIdx] = useState(null);
  function onDrop(i) {
    const from = dragIdx.current;
    if (from === null || from === i) { setOverIdx(null); return; }
    const next = [...ranked]; const [m] = next.splice(from, 1); next.splice(i, 0, m);
    setRanked(next); dragIdx.current = null; setOverIdx(null);
  }
  return (
    <div>
      <StepLabel>STEP 4 OF 5</StepLabel>
      <H1>Your ranking</H1>
      <Muted>Drag to fine-tune. This order drives scheduling.</Muted>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "14px 0" }}>
        {ranked.map((t, i) => (
          <div key={t.id} draggable onDragStart={() => { dragIdx.current = i; }}
            onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }} onDragLeave={() => setOverIdx(null)} onDrop={() => onDrop(i)}
            style={{ display: "flex", alignItems: "center", gap: 12, background: COLORS.card, borderRadius: 8, padding: "10px 12px", border: `0.5px solid ${overIdx === i ? COLORS.amber : COLORS.border}`, cursor: "grab" }}>
            <span style={{ color: COLORS.muted, fontSize: 16 }}>⠿</span>
            <span style={{ fontFamily: "monospace", fontSize: 13, color: COLORS.amber, minWidth: 22 }}>{String(i + 1).padStart(2, "0")}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14 }}>{t.name}</div>
              <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 2 }}>{categories[t.cat]?.label} · {t.duration}m · {diffLabel(t.difficulty)}</div>
            </div>
          </div>
        ))}
      </div>
      <PrimaryButton onClick={onNext} style={{ marginBottom: 8 }}>Configure schedule →</PrimaryButton>
      <GhostButton onClick={onRestart}>← Start over</GhostButton>
    </div>
  );
}

// ─── Screen 5a: Per-day config ───────────────────────────────────────────────
function ConfigScreen({ dayRules, setDayRules, categories, onBack, onGenerate }) {
  const catKeys = Object.keys(categories);
  function update(day, patch) { setDayRules((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } })); }
  function toggleCat(day, cat) {
    setDayRules((prev) => {
      const cur = prev[day].cats;
      const cats = cur.includes(cat) ? cur.filter((c) => c !== cat) : [...cur, cat];
      return { ...prev, [day]: { ...prev[day], cats } };
    });
  }
  return (
    <div>
      <StepLabel>STEP 5 OF 5</StepLabel>
      <H1>Schedule rules</H1>
      <Muted>Set rules per day. Generate follows them exactly, in your ranked priority order.</Muted>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "14px 0" }}>
        {ALL_DAYS.map((day) => {
          const r = dayRules[day];
          return (
            <div key={day} style={{ background: COLORS.card, borderRadius: 8, border: `0.5px solid ${COLORS.border}`, padding: "12px 14px", opacity: r.off ? 0.55 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.amber, fontFamily: "monospace" }}>{day}</span>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: COLORS.muted, cursor: "pointer" }}>
                  Day off
                  <input type="checkbox" checked={r.off} onChange={(e) => update(day, { off: e.target.checked })} style={{ accentColor: COLORS.amber, width: 16, height: 16 }} />
                </label>
              </div>
              {!r.off && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 5 }}>Preferred categories (drag overflow allowed)</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                    {catKeys.map((cat) => {
                      const on = r.cats.includes(cat);
                      return (
                        <button key={cat} onClick={() => toggleCat(day, cat)} style={{ padding: "4px 9px", borderRadius: 20, fontSize: 11, cursor: "pointer", border: `0.5px solid ${on ? COLORS.amber : COLORS.border}`, background: on ? "rgba(245,166,35,0.13)" : "transparent", color: on ? COLORS.amber : COLORS.muted }}>{categories[cat].label}</button>
                      );
                    })}
                  </div>
                  <SliderRow label="Max hours" value={`${r.maxHours}h`}>
                    <input type="range" min={1} max={12} step={1} value={r.maxHours} onChange={(e) => update(day, { maxHours: Number(e.target.value) })} style={{ width: "100%", accentColor: COLORS.amber }} />
                  </SliderRow>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                    <ToggleRow label="Pair time-intensive + quick" on={r.pairTimeShort} onToggle={() => update(day, { pairTimeShort: !r.pairTimeShort })} />
                    <ToggleRow label="Balance hard + easy" on={r.pairHardEasy} onToggle={() => update(day, { pairHardEasy: !r.pairHardEasy })} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <PrimaryButton onClick={onGenerate} style={{ marginBottom: 8 }}>Generate schedule ✦</PrimaryButton>
      <GhostButton onClick={onBack}>← Back to ranking</GhostButton>
    </div>
  );
}

function ToggleRow({ label, on, onToggle }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 12 }}>{label}</span>
      <button onClick={onToggle} style={{ width: 38, height: 22, borderRadius: 11, background: on ? COLORS.amber : COLORS.border, cursor: "pointer", position: "relative", border: "none", transition: "background 0.2s" }}>
        <span style={{ position: "absolute", width: 16, height: 16, borderRadius: "50%", background: "white", top: 3, left: on ? 19 : 3, transition: "left 0.2s" }} />
      </button>
    </div>
  );
}

// ─── Screen 5b: Week overview + ICS export ───────────────────────────────────
function WeekScreen({ week, setWeek, dayRules, categories, onBack }) {
  const dragRef = useRef(null);
  const [overDay, setOverDay] = useState(null);
  const days = week || [];

  function moveTask(toDay) {
    const src = dragRef.current; dragRef.current = null; setOverDay(null);
    if (!src || src.dayName === toDay) return;
    setWeek((prev) => {
      const next = prev.map((d) => ({ ...d, tasks: [...d.tasks] }));
      const from = next.find((d) => d.name === src.dayName);
      const to = next.find((d) => d.name === toDay);
      if (!from || !to) return prev;
      const idx = from.tasks.findIndex((t) => t.id === src.taskId);
      if (idx === -1) return prev;
      const [m] = from.tasks.splice(idx, 1); to.tasks.push(m);
      from.total = from.tasks.reduce((s, t) => s + t.duration, 0);
      to.total = to.tasks.reduce((s, t) => s + t.duration, 0);
      return next;
    });
  }

  function exportICS() {
    const ics = buildICS(days, categories);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "my-week.ics";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <StepLabel>YOUR WEEK</StepLabel>
      <H1>Generated schedule</H1>
      <Muted>Drag tasks between days to adjust. Export when ready.</Muted>
      {days.length === 0 && <Muted style={{ marginTop: 16 }}>No tasks scheduled — check your day rules.</Muted>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
        {days.map((day) => {
          const cap = (dayRules[day.name]?.maxHours || 0) * 60;
          const over = cap > 0 && day.total > cap;
          return (
            <div key={day.name} onDragOver={(e) => { e.preventDefault(); setOverDay(day.name); }} onDragLeave={() => setOverDay((d) => (d === day.name ? null : d))} onDrop={() => moveTask(day.name)}
              style={{ background: COLORS.card, borderRadius: 8, border: `0.5px solid ${overDay === day.name ? COLORS.amber : COLORS.border}`, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", borderBottom: `0.5px solid ${COLORS.border}`, fontSize: 12, fontWeight: 500, color: COLORS.amber, fontFamily: "monospace", letterSpacing: "0.05em", display: "flex", justifyContent: "space-between" }}>
                <span>{day.name.toUpperCase()}</span>
                <span style={{ color: over ? COLORS.red : COLORS.muted }}>{Math.round(day.total / 6) / 10}h / {dayRules[day.name]?.maxHours}h</span>
              </div>
              <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6, minHeight: 30 }}>
                {day.tasks.length === 0 && <span style={{ fontSize: 11, color: COLORS.muted, fontStyle: "italic" }}>drop tasks here</span>}
                {day.tasks.map((t) => (
                  <div key={t.id} draggable onDragStart={() => { dragRef.current = { dayName: day.name, taskId: t.id }; }}
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "grab", background: COLORS.navy, borderRadius: 6, padding: "6px 8px", border: `0.5px solid ${COLORS.border}` }}>
                    <span style={{ color: COLORS.muted, fontSize: 13 }}>⠿</span>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: categories[t.cat]?.dot || COLORS.amber, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, flex: 1 }}>{t.name}</span>
                    <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: "monospace" }}>{t.startLabel}</span>
                  </div>
                ))}
              </div>
              {over && <div style={{ padding: "0 12px 8px", fontSize: 11, color: COLORS.red }}>Over the {dayRules[day.name].maxHours}h limit</div>}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 14 }}>
        <PrimaryButton onClick={exportICS} style={{ marginBottom: 8 }}>↓ Export for Google Calendar (.ics)</PrimaryButton>
        <GhostButton onClick={onBack}>← Back to rules</GhostButton>
      </div>
      <Muted style={{ fontSize: 11, marginTop: 10 }}>
        Tip: open Google Calendar → Settings → Import &amp; export → import the downloaded my-week.ics file.
      </Muted>
    </div>
  );
}

// ─── Scheduler ───────────────────────────────────────────────────────────────
// Follows per-day rules literally. Tasks placed in ranked priority order.
// Soft categories: a day prefers its chosen categories, but overflow is allowed.
// Pairing rules order the tasks within a day (time+short interleave, hard+easy
// alternation). Times are assigned from a 9:00 start, stacking by duration.
function buildSchedule(ranked, dayRules, categories) {
  const activeDays = ALL_DAYS.filter((d) => !dayRules[d].off);
  if (activeDays.length === 0) return [];

  const buckets = Object.fromEntries(activeDays.map((d) => [d, []]));
  const totals = Object.fromEntries(activeDays.map((d) => [d, 0]));
  const cap = (d) => dayRules[d].maxHours * 60;

  function score(day, task) {
    // Higher is better. Prefer days that list this task's category, that have
    // room under the cap, and that are currently least loaded.
    const r = dayRules[day];
    let s = 0;
    if (r.cats.length === 0 || r.cats.includes(task.cat)) s += 100; // preferred/neutral
    if (totals[day] === 0 || totals[day] + task.duration <= cap(day)) s += 50; // has room
    s -= totals[day] / 10; // tie-break toward emptier days
    return s;
  }

  ranked.forEach((task) => {
    let best = activeDays[0], bestScore = -Infinity;
    activeDays.forEach((day) => {
      const s = score(day, task);
      if (s > bestScore) { bestScore = s; best = day; }
    });
    buckets[best].push(task);
    totals[best] += task.duration;
  });

  // Order tasks within each day per that day's pairing rules, then assign times.
  return activeDays
    .map((name) => {
      let tasks = buckets[name];
      const r = dayRules[name];
      if (r.pairHardEasy) tasks = alternate(tasks, (t) => t.difficulty >= 4);
      if (r.pairTimeShort) tasks = interleaveTimeShort(tasks);
      tasks = assignTimes(tasks);
      return { name, tasks, total: tasks.reduce((s, t) => s + t.duration, 0) };
    })
    .filter((d) => d.tasks.length > 0);
}

// Interleave: heavy/time-intensive task, then a quick one, alternating.
function interleaveTimeShort(tasks) {
  const heavy = tasks.filter((t) => t.cat === "heavy" || t.duration >= 60);
  const quick = tasks.filter((t) => !(t.cat === "heavy" || t.duration >= 60));
  const out = []; let i = 0, j = 0;
  while (i < heavy.length || j < quick.length) {
    if (i < heavy.length) out.push(heavy[i++]);
    if (j < quick.length) out.push(quick[j++]);
  }
  return out;
}

// Alternate predicate-true and predicate-false items (hard vs easy).
function alternate(tasks, isHard) {
  const hard = tasks.filter(isHard), easy = tasks.filter((t) => !isHard(t));
  const out = []; let i = 0, j = 0;
  while (i < hard.length || j < easy.length) {
    if (i < hard.length) out.push(hard[i++]);
    if (j < easy.length) out.push(easy[j++]);
  }
  return out;
}

// Assign clock times from 9:00, stacking by duration. Adds startLabel + start.
function assignTimes(tasks) {
  let minutes = 9 * 60;
  return tasks.map((t) => {
    const h = Math.floor(minutes / 60), m = minutes % 60;
    const startLabel = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const out = { ...t, startMin: minutes, startLabel };
    minutes += t.duration;
    return out;
  });
}

// ─── ICS export ──────────────────────────────────────────────────────────────
// Builds a valid iCalendar string. Each task becomes a VEVENT on the upcoming
// instance of its weekday, at its assigned start time, lasting its duration.
function buildICS(days, categories) {
  const pad = (n) => String(n).padStart(2, "0");
  const dayOffset = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 0 };

  // Find the date of the next occurrence of each weekday from today.
  function nextDateFor(dayName) {
    const today = new Date();
    const todayDow = today.getDay(); // 0=Sun..6=Sat
    const target = dayOffset[dayName];
    let delta = (target - todayDow + 7) % 7;
    if (delta === 0) delta = 7; // schedule for next week's instance, not today
    const d = new Date(today);
    d.setDate(today.getDate() + delta);
    return d;
  }
  function fmt(date, minutes) {
    const d = new Date(date);
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  }
  function esc(s) { return s.replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n"); }

  const stamp = fmt(new Date(), new Date().getHours() * 60 + new Date().getMinutes());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TaskRanker//EN", "CALSCALE:GREGORIAN"];

  days.forEach((day) => {
    const date = nextDateFor(day.name);
    day.tasks.forEach((t) => {
      const start = fmt(date, t.startMin);
      const end = fmt(date, t.startMin + t.duration);
      const uid = `${t.id}-${day.name}@taskranker`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${esc(t.name)}`,
        `DESCRIPTION:${esc(`${categories[t.cat]?.label || t.cat} · ${diffLabel(t.difficulty)}`)}`,
        "END:VEVENT"
      );
    });
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// ─── Bottom navigation ───────────────────────────────────────────────────────
function BottomNav({ screen, hasData, hasRanked, onNav }) {
  const items = [
    { id: "dump", label: "Dump", icon: "≡", need: "always" },
    { id: "sort", label: "Sort", icon: "▦", need: "data" },
    { id: "battle", label: "Battle", icon: "⚔", need: "data" },
    { id: "rank", label: "Rank", icon: "▤", need: "ranked" },
    { id: "config", label: "Rules", icon: "⚙", need: "ranked" },
    { id: "week", label: "Week", icon: "▥", need: "ranked" },
  ];
  return (
    <nav style={{ display: "flex", justifyContent: "space-around", padding: "10px 0 14px", borderTop: `0.5px solid ${COLORS.border}`, background: COLORS.navy, position: "sticky", bottom: 0 }}>
      {items.map((it) => {
        const enabled = it.need === "always" || (it.need === "data" && hasData) || (it.need === "ranked" && hasRanked);
        const active = screen === it.id;
        return (
          <button key={it.id} onClick={() => enabled && onNav(it.id)} disabled={!enabled}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", padding: "4px 8px", cursor: enabled ? "pointer" : "not-allowed", color: active ? COLORS.amber : COLORS.muted, opacity: enabled ? 1 : 0.4, fontSize: 10 }}>
            <span style={{ fontSize: 17, lineHeight: 1 }}>{it.icon}</span>{it.label}
          </button>
        );
      })}
    </nav>
  );
}
