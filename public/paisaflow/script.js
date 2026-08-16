/* PaisaFlow — Personal Finance Manager (offline, vanilla JS) */
(() => {
  "use strict";

  /* ============ Storage ============
   The "mf_" key prefix is intentionally kept from earlier versions: renaming
   the keys would orphan data users already have saved in their browser. */
  const LS = {
    tx: "mf_transactions",
    budgets: "mf_budgets",
    goals: "mf_goals",
    settings: "mf_settings",
    cats: "mf_categories",
    meta: "mf_meta",
    alerts: "mf_budget_alerts",
  };
  const DATA_VERSION = 2;

  const mkId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  function load(k, d) {
    try {
      const raw = localStorage.getItem(k);
      if (raw == null || raw === "undefined" || raw === "null" || raw === "") return d;
      const v = JSON.parse(raw);
      return v == null ? d : v;
    } catch {
      return d;
    }
  }
  let storageWarned = false;
  function save(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch {
      if (!storageWarned) {
        storageWarned = true;
        setTimeout(
          () =>
            toast(
              "Could not save data",
              "Browser storage is full or unavailable. Export a backup to keep your records.",
              "danger",
            ),
          0,
        );
      }
      return false;
    }
  }

  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const isValidTx = (t) =>
    !!t &&
    typeof t === "object" &&
    Number.isFinite(Number(t.amount)) &&
    !isNaN(new Date(t.date).getTime());

  function sanitizeTx(t) {
    const d = new Date(t.date);
    return {
      ...t,
      id: t.id || mkId(),
      type: t.type === "income" ? "income" : "expense",
      amount: Math.abs(num(t.amount)),
      title: String(t.title || "Untitled").slice(0, 80),
      category: String(t.category || "Others").slice(0, 24),
      method: String(t.method || "Cash").slice(0, 24),
      date: d.toISOString(),
      tags: Array.isArray(t.tags) ? t.tags.map((x) => String(x).slice(0, 24)).slice(0, 10) : [],
      description: String(t.description || "").slice(0, 500),
      recur: ["weekly", "monthly", "yearly", "daily", "custom"].includes(t.recur)
        ? t.recur
        : "none",
    };
  }
  const sanitizeTxList = (arr) => (Array.isArray(arr) ? arr : []).filter(isValidTx).map(sanitizeTx);

  let state = {
    transactions: sanitizeTxList(load(LS.tx, [])).filter((t) => !t.generated),
    budgets: (load(LS.budgets, []) || [])
      .filter((b) => b && b.category && Number.isFinite(Number(b.amount)))
      .map((b) => ({
        id: b.id || mkId(),
        category: String(b.category).slice(0, 24),
        amount: Math.abs(num(b.amount)),
        demo: !!b.demo,
      })),
    goals: (load(LS.goals, []) || [])
      .filter((g) => g && g.name)
      .map((g) => ({
        id: g.id || mkId(),
        name: String(g.name).slice(0, 60),
        target: Math.abs(num(g.target)),
        saved: Math.abs(num(g.saved)),
        date: g.date || null,
        demo: !!g.demo,
      })),
    settings: { currency: "Rs.", dateFmt: "DMY", theme: "light", ...(load(LS.settings, {}) || {}) },
    range: "month",
    view: "dashboard",
    txPage: 1,
    txPerPage: 10,
    calCursor: new Date(),
    calSelected: null,
    customFrom: null,
    customTo: null,
  };
  if (state.settings.theme !== "dark") state.settings.theme = "light";

  /* ============ Constants ============ */
  const DEFAULT_CATS = {
    income: ["Salary", "Freelance", "Business", "Bonus", "Gift", "Interest"],
    expense: [
      "Food",
      "Shopping",
      "Rent",
      "Bills",
      "Fuel",
      "Transport",
      "Education",
      "Medical",
      "Entertainment",
      "Travel",
      "Others",
    ],
  };
  const CATS = { income: [], expense: [] };
  const METHODS = ["Cash", "Bank", "Card", "eSewa", "Khalti", "IME Pay"];
  const CAT_ICONS = {
    Food: "🍽️",
    Shopping: "🛍️",
    Rent: "🏠",
    Bills: "💡",
    Fuel: "⛽",
    Transport: "🚌",
    Education: "🎓",
    Medical: "🩺",
    Entertainment: "🎬",
    Travel: "✈️",
    Investment: "📈",
    Others: "📦",
    Salary: "💼",
    Freelance: "🧑‍💻",
    Business: "🏢",
    Bonus: "🎁",
    Gift: "🎀",
    Interest: "🏦",
  };
  const METHOD_ICONS = {
    Cash: "💵",
    Bank: "🏦",
    Card: "💳",
    eSewa: "📱",
    Khalti: "📲",
    "IME Pay": "📶",
  };
  const CAT_COLORS = {
    Food: "#f59e0b",
    Shopping: "#ec4899",
    Rent: "#6366f1",
    Bills: "#0ea5e9",
    Fuel: "#f97316",
    Transport: "#14b8a6",
    Education: "#8b5cf6",
    Medical: "#ef4444",
    Entertainment: "#a855f7",
    Travel: "#22d3ee",
    Investment: "#10b981",
    Others: "#64748b",
    Salary: "#10b981",
    Freelance: "#22d3ee",
    Business: "#6366f1",
    Bonus: "#f59e0b",
    Gift: "#ec4899",
    Interest: "#8b5cf6",
  };
  const PALETTE = [
    "#6366f1",
    "#0ea5e9",
    "#f59e0b",
    "#ec4899",
    "#14b8a6",
    "#a855f7",
    "#ef4444",
    "#10b981",
    "#f97316",
    "#22d3ee",
  ];

  function ensureCatMeta(name) {
    if (!CAT_COLORS[name]) {
      let h = 0;
      for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 9973;
      CAT_COLORS[name] = PALETTE[h % PALETTE.length];
    }
    if (!CAT_ICONS[name]) CAT_ICONS[name] = "🏷️";
  }
  function loadCategories() {
    const stored = load(LS.cats, null);
    const clean = (arr, fb) => {
      const out = [];
      (Array.isArray(arr) ? arr : fb).forEach((v) => {
        const n = String(v || "")
          .trim()
          .slice(0, 24);
        if (n && !out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n);
      });
      return out.length ? out : fb.slice();
    };
    CATS.income = clean(stored && stored.income, DEFAULT_CATS.income);
    CATS.expense = clean(stored && stored.expense, DEFAULT_CATS.expense);
    state.transactions.forEach((t) => {
      const list = CATS[t.type === "income" ? "income" : "expense"];
      if (t.category && !list.includes(t.category)) list.push(String(t.category).slice(0, 24));
    });
    [...CATS.income, ...CATS.expense].forEach(ensureCatMeta);
  }

  /* ============ Utilities ============ */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = mkId;

  function fmtMoney(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    const abs = Math.abs(v);
    return (
      (state.settings.currency || "Rs.") +
      " " +
      abs.toLocaleString(undefined, {
        maximumFractionDigits: 2,
        minimumFractionDigits: abs % 1 ? 2 : 0,
      })
    );
  }
  function fmtSigned(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    return (v < 0 ? "−" : "") + fmtMoney(v);
  }
  function fmtPct(n, digits = 1) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    return v.toFixed(digits) + "%";
  }
  const fmtQty = (n) =>
    Number.isFinite(Number(n))
      ? Number(n).toLocaleString(undefined, { maximumFractionDigits: 6 })
      : "—";
  const fmtDate = (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return "—";
    const dd = String(dt.getDate()).padStart(2, "0"),
      mm = String(dt.getMonth() + 1).padStart(2, "0"),
      yy = dt.getFullYear();
    if (state.settings.dateFmt === "MDY") return `${mm}/${dd}/${yy}`;
    if (state.settings.dateFmt === "YMD") return `${yy}-${mm}-${dd}`;
    return `${dd}/${mm}/${yy}`;
  };
  const startOfDay = (d = new Date()) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOfDay = (d = new Date()) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };
  const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = (d = new Date()) =>
    new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  const startOfWeek = (d = new Date()) => {
    const x = startOfDay(d);
    x.setDate(x.getDate() - x.getDay());
    return x;
  };
  const startOfYear = (d = new Date()) => new Date(d.getFullYear(), 0, 1);
  const sameDay = (a, b) => {
    const x = new Date(a),
      y = new Date(b);
    return (
      x.getFullYear() === y.getFullYear() &&
      x.getMonth() === y.getMonth() &&
      x.getDate() === y.getDate()
    );
  };
  const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const isoDay = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  const parseDayInput = (s) => {
    if (!s) return null;
    const d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  };
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  }

  /* ============ Toasts ============ */
  const TOAST_ICONS = {
    success: "✓",
    danger: "✕",
    error: "✕",
    warn: "⚠",
    warning: "⚠",
    info: "ℹ",
    "": "ℹ",
  };
  let toastSeq = 0;
  function toast(title, msg = "", type = "", action = null) {
    const kind = type === "error" ? "danger" : type === "warning" ? "warn" : type;
    const host = $("#toasts");
    if (!host) return () => {};
    const t = document.createElement("div");
    t.className = "toast " + kind;
    t.id = "pf-toast-" + ++toastSeq;
    t.tabIndex = 0;
    t.setAttribute("role", kind === "danger" ? "alert" : "status");

    const ico = document.createElement("span");
    ico.className = "toast-ico";
    ico.setAttribute("aria-hidden", "true");
    ico.textContent = TOAST_ICONS[kind] || TOAST_ICONS[""];

    const main = document.createElement("div");
    main.className = "toast-main";
    const strong = document.createElement("strong");
    strong.textContent = String(title);
    main.appendChild(strong);
    if (msg) {
      const d = document.createElement("div");
      d.textContent = String(msg);
      main.appendChild(d);
    }
    if (action) {
      const b = document.createElement("button");
      b.className = "toast-action";
      b.type = "button";
      b.textContent = action.label;
      b.addEventListener("click", () => {
        try {
          action.onClick();
        } catch (_) {}
        dismiss();
      });
      main.appendChild(b);
    }

    const close = document.createElement("button");
    close.className = "toast-close";
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss notification");
    close.textContent = "✕";
    close.addEventListener("click", () => dismiss());

    t.append(ico, main, close);
    host.appendChild(t);
    while (host.children.length > 4) host.firstElementChild.remove();

    // Auto-dismiss that pauses on hover/focus and resumes with the time left.
    const total = action ? 8000 : 4200;
    let remaining = total,
      startedAt = Date.now(),
      timer = null,
      done = false;
    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const start = () => {
      clear();
      startedAt = Date.now();
      timer = setTimeout(dismiss, remaining);
    };
    const pause = () => {
      if (!timer) return;
      remaining = Math.max(1200, remaining - (Date.now() - startedAt));
      clear();
    };
    function dismiss() {
      if (done) return;
      done = true;
      clear();
      t.classList.add("leaving");
      setTimeout(() => t.remove(), 260);
    }
    ["mouseenter", "focusin", "touchstart"].forEach((ev) =>
      t.addEventListener(ev, pause, { passive: true }),
    );
    ["mouseleave", "focusout"].forEach((ev) => t.addEventListener(ev, start));
    start();
    return dismiss;
  }
  const notify = {
    success: (title, msg = "") => toast(title, msg, "success"),
    error: (title, msg = "") => toast(title, msg, "danger"),
    warning: (title, msg = "") => toast(title, msg, "warn"),
    info: (title, msg = "") => toast(title, msg, "info"),
  };

  /* ============ Dialog service (queued; replaces alert/confirm/prompt) ============ */
  const DIALOG_ICONS = { danger: "⚠️", warn: "⚠️", success: "✓", info: "ℹ", primary: "ℹ" };
  const dialogQueue = [];
  let dialogActive = null;
  let dialogPrevFocus = null;
  let dialogAllowEsc = true;

  function openDialog(opts) {
    return new Promise((resolve) => {
      dialogQueue.push({ opts: opts || {}, resolve });
      if (!dialogActive) pumpDialog();
    });
  }
  function pumpDialog() {
    const next = dialogQueue.shift();
    if (!next) {
      dialogActive = null;
      return;
    }
    dialogActive = next;
    paintDialog(next.opts);
  }
  function paintDialog(opts) {
    const {
      title = "Are you sure?",
      subtitle = "",
      message = "",
      items = [],
      confirmText = "Confirm",
      cancelText = "Cancel",
      variant = "primary",
      showCancel = true,
      input = null,
      dismissible = true,
    } = opts;

    const m = $("#appDialog");
    m.className = "modal dialog " + variant;
    $("#appDialogIco").textContent = DIALOG_ICONS[variant] || DIALOG_ICONS.info;
    $("#appDialogTitleText").textContent = title;
    const sub = $("#appDialogSub");
    sub.textContent = subtitle;
    sub.classList.toggle("hidden", !subtitle);
    $("#appDialogMsg").textContent = message;

    const list = $("#appDialogList");
    list.innerHTML = "";
    list.classList.toggle("hidden", !items.length);
    items.forEach((it) => {
      const li = document.createElement("li");
      li.textContent = it;
      list.appendChild(li);
    });

    const inputWrap = $("#appDialogInputWrap");
    const inputEl = $("#appDialogInput");
    inputWrap.classList.toggle("hidden", !input);
    if (input) {
      $("#appDialogInputLabel").textContent = input.label || "Value";
      inputEl.type = input.type || "text";
      inputEl.placeholder = input.placeholder || "";
      inputEl.value = input.value != null ? String(input.value) : "";
      if (input.type === "number") {
        inputEl.step = input.step || "0.01";
        inputEl.min = input.min != null ? input.min : "0";
      } else {
        inputEl.removeAttribute("step");
        inputEl.removeAttribute("min");
      }
    }

    const confirmBtn = $("#appDialogConfirm");
    confirmBtn.textContent = confirmText;
    confirmBtn.className = "btn " + (variant === "danger" ? "danger" : "primary");
    const cancelBtn = $("#appDialogCancel");
    cancelBtn.textContent = cancelText;
    cancelBtn.classList.toggle("hidden", !showCancel);
    $("#appDialogClose").classList.toggle("hidden", !dismissible);
    dialogAllowEsc = dismissible;

    if (!dialogPrevFocus) dialogPrevFocus = document.activeElement;
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    setTimeout(() => {
      (input ? inputEl : variant === "danger" && showCancel ? cancelBtn : confirmBtn).focus();
    }, 40);
  }
  function closeDialog(result) {
    const m = $("#appDialog");
    if (!m.classList.contains("open")) return;
    const current = dialogActive;
    dialogActive = null;
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    if (!$(".modal.open")) document.body.classList.remove("modal-open");
    if (current) {
      try {
        current.resolve(result);
      } catch (_) {}
    }
    if (dialogQueue.length) {
      // Show the next queued dialog only after this one has visually closed.
      setTimeout(pumpDialog, 140);
    } else {
      if (dialogPrevFocus && document.contains(dialogPrevFocus)) dialogPrevFocus.focus();
      dialogPrevFocus = null;
    }
  }
  const dialogIsOpen = () => $("#appDialog").classList.contains("open");

  const showConfirm = (opts = {}) =>
    openDialog({ confirmText: "Confirm", ...opts }).then((v) => v === true);
  const showAlert = (opts = {}) =>
    openDialog({ confirmText: "OK", showCancel: false, variant: "info", ...opts }).then(
      () => undefined,
    );
  function showPrompt(opts = {}) {
    const { input = {}, ...rest } = opts;
    return openDialog({ confirmText: "Save", ...rest, input: { label: "Value", ...input } }).then(
      (v) => (typeof v === "string" ? v : null),
    );
  }
  function initDialog() {
    const m = $("#appDialog");
    const inputEl = $("#appDialogInput");
    $("#appDialogConfirm").addEventListener("click", () => {
      const wantsInput = !$("#appDialogInputWrap").classList.contains("hidden");
      closeDialog(wantsInput ? inputEl.value : true);
    });
    $("#appDialogCancel").addEventListener("click", () => closeDialog(false));
    $("#appDialogClose").addEventListener("click", () => closeDialog(false));
    m.addEventListener("mousedown", (e) => {
      if (e.target === m && dialogAllowEsc) closeDialog(false);
    });
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        closeDialog(inputEl.value);
      }
    });
  }

  /* ============ Loading modal ============ */
  let loadingDepth = 0;
  function showLoading(text = "Working…") {
    loadingDepth++;
    const m = $("#loadingModal");
    if (!m) return;
    $("#loadingText").textContent = text;
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }
  function hideLoading(force = false) {
    loadingDepth = force ? 0 : Math.max(0, loadingDepth - 1);
    if (loadingDepth > 0) return;
    const m = $("#loadingModal");
    if (!m) return;
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    if (!$(".modal.open")) document.body.classList.remove("modal-open");
  }
  /** Runs an async task behind the loading modal; always cleans up. */
  async function withLoading(text, fn) {
    showLoading(text);
    try {
      return await fn();
    } finally {
      hideLoading();
    }
  }

  /* ============ Theme ============ */
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.settings.theme);
    const icon = state.settings.theme === "dark" ? "☀️" : "🌙";
    const tt = $("#themeToggle");
    const ttIco = tt.querySelector(".tt-ico");
    if (ttIco) ttIco.textContent = icon;
    else tt.textContent = icon;
    tt.setAttribute("aria-pressed", String(state.settings.theme === "dark"));
    $("#setTheme").value = state.settings.theme;
    // Destroy live charts BEFORE clearing the registry so no stale Chart stays
    // bound to a canvas (that would make the canvas grow on every toggle).
    Object.values(charts).forEach((c) => {
      try {
        c && c.destroy();
      } catch (_) {}
    });
    charts = {};
    renderCurrentView();
  }

  /* ============ Actual vs projected ============
   Future-dated entries (including generated recurring occurrences) are
   projections. They never contribute to balances, totals or the health score. */
  const isUpcoming = (t) => new Date(t.date) > endOfDay(new Date());
  const actualTx = () => state.transactions.filter((t) => !isUpcoming(t));
  const upcomingTx = () => state.transactions.filter(isUpcoming);

  /* ============ Filters/Ranges ============ */
  function rangeBounds(range = state.range) {
    const now = new Date();
    if (range === "week") return { from: startOfWeek(now), to: endOfDay(now) };
    if (range === "month") return { from: startOfMonth(now), to: endOfDay(now) };
    if (range === "lastmonth")
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
    if (range === "year") return { from: startOfYear(now), to: endOfDay(now) };
    if (range === "custom") {
      const f = parseDayInput(state.customFrom);
      const t = parseDayInput(state.customTo);
      return { from: f || new Date(0), to: t ? endOfDay(t) : endOfDay(now) };
    }
    return { from: new Date(0), to: endOfDay(now) };
  }
  function inRange(tx, range = state.range) {
    const { from, to } = rangeBounds(range);
    const d = new Date(tx.date);
    return d >= from && d <= to;
  }
  function rangeLabel(range = state.range) {
    return (
      {
        week: "this week",
        month: "this month",
        lastmonth: "last month",
        year: "this year",
        custom: "the selected range",
        all: "all time",
      }[range] || "this period"
    );
  }
  function topCategory(list) {
    const cat = {};
    list
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        cat[t.category] = (cat[t.category] || 0) + num(t.amount);
      });
    const keys = Object.keys(cat).sort((a, b) => cat[b] - cat[a]);
    return keys.length ? { name: keys[0], amount: cat[keys[0]] } : null;
  }

  /* ============ Single source of truth: stats ============ */
  function computeStats(list) {
    const src = Array.isArray(list) ? list : actualTx();
    const totals = { income: 0, expense: 0 };
    for (const t of src) totals[t.type === "income" ? "income" : "expense"] += num(t.amount);
    const savings = totals.income - totals.expense;
    const rate = totals.income > 0 ? (savings / totals.income) * 100 : null;
    return { ...totals, savings, rate, count: src.length };
  }
  /** Cash balance from every actual (non-future) transaction. */
  function cashBalance() {
    return actualTx().reduce(
      (a, t) => a + (t.type === "income" ? num(t.amount) : -num(t.amount)),
      0,
    );
  }
  function categoryTotals(list, type = "expense") {
    const out = {};
    list
      .filter((t) => t.type === type)
      .forEach((t) => {
        out[t.category] = (out[t.category] || 0) + num(t.amount);
      });
    return out;
  }
  function spentInMonth(category, ref = new Date()) {
    const from = startOfMonth(ref),
      to = endOfMonth(ref),
      now = endOfDay(new Date());
    return state.transactions
      .filter((t) => t.type === "expense" && t.category === category)
      .filter((t) => {
        const d = new Date(t.date);
        return d >= from && d <= to && d <= now;
      })
      .reduce((a, t) => a + num(t.amount), 0);
  }

  /* ============ Financial health (data-driven; null when unknown) ============ */
  function computeHealth() {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 90);
    const list = actualTx().filter((t) => new Date(t.date) >= windowStart);
    const s = computeStats(list);
    const factors = [];

    if (!list.length || (s.income <= 0 && s.expense <= 0)) {
      return {
        score: null,
        label: "No data yet",
        note: "Add transactions to calculate your financial health score.",
        factors,
      };
    }
    if (s.income <= 0) {
      return {
        score: null,
        label: "Not enough data",
        note: "Record some income to score your cash flow — expenses alone cannot be judged.",
        factors,
      };
    }

    // 1) Savings rate — up to 45 points.
    const rate = s.rate == null ? 0 : s.rate;
    const savingsPts = Math.max(0, Math.min(45, (rate / 30) * 45));
    factors.push(`Savings rate → ${fmtPct(rate)} • ${savingsPts.toFixed(0)}/45`);

    // 2) Expense-to-income ratio — up to 20 points.
    const ratio = s.expense / s.income;
    const ratioPts = Math.max(0, Math.min(20, (1.1 - ratio) * 20));
    factors.push(
      `Expense control → ${fmtPct(ratio * 100, 0)} of income • ${ratioPts.toFixed(0)}/20`,
    );

    // 3) Budget adherence — up to 20 points (neutral 10 when no budgets exist).
    let budgetPts = 10;
    if (state.budgets.length) {
      const ok = state.budgets.filter(
        (b) => b.amount > 0 && spentInMonth(b.category) <= b.amount,
      ).length;
      budgetPts = (ok / state.budgets.length) * 20;
      factors.push(
        `Budget adherence → ${ok}/${state.budgets.length} respected • ${budgetPts.toFixed(0)}/20`,
      );
    } else {
      factors.push("Budget adherence → no budgets set • 10/20");
    }

    // 4) Income consistency across the last 3 months — up to 15 points.
    let months = 0;
    for (let i = 0; i < 3; i++) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      if (
        actualTx().some(
          (t) => t.type === "income" && new Date(t.date) >= m && new Date(t.date) < next,
        )
      )
        months++;
    }
    const consistencyPts = (months / 3) * 15;
    factors.push(
      `Income consistency → ${months}/3 recent months • ${consistencyPts.toFixed(0)}/15`,
    );

    let score = Math.round(savingsPts + ratioPts + budgetPts + consistencyPts);
    score = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));

    let label, note;
    if (score >= 85) {
      label = "Excellent";
      note = "Strong savings and controlled spending over the last 90 days.";
    } else if (score >= 70) {
      label = "Good";
      note = "Solid habits — keep budgets tight to push higher.";
    } else if (score >= 50) {
      label = "Fair";
      note = "Room to grow: aim for a higher savings rate.";
    } else {
      label = "Needs care";
      note = "Spending is close to (or above) income. Trim non-essentials.";
    }
    return { score, label, note, factors };
  }

  /* ============ Counter animation ============ */
  function animateCount(el, to) {
    if (!el) return;
    if (!Number.isFinite(Number(to))) {
      el.textContent = "—";
      el.dataset.current = "0";
      return;
    }
    const from = Number(el.dataset.current || 0);
    const dur = 600,
      start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtSigned(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(step);
      else el.dataset.current = to;
    };
    requestAnimationFrame(step);
  }

  /* ============ Charts ============ */
  let charts = {};
  const themeColors = () => {
    const dark = state.settings.theme === "dark";
    return {
      grid: dark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.06)",
      text: dark ? "#9aa0b8" : "#5b6079",
    };
  };
  const isSmallScreen = () => window.innerWidth < 640;
  const chartHasData = (cfg) =>
    (cfg.data?.datasets || []).some((ds) => (ds.data || []).some((v) => Number(v) > 0));

  function simpleChartHtml(cfg) {
    const labels = cfg.data.labels || [];
    const sets = cfg.data.datasets || [];
    const rows = labels
      .map((label, i) => {
        const parts = sets.map((ds) => {
          const raw = ds.backgroundColor ?? ds.borderColor ?? "#6366f1";
          const color = Array.isArray(raw) ? raw[i] || "#6366f1" : raw;
          return { label: ds.label || "", value: Math.max(0, Number(ds.data?.[i]) || 0), color };
        });
        return { label: String(label), parts, total: parts.reduce((a, p) => a + p.value, 0) };
      })
      .filter((r) => r.total > 0);
    const max = Math.max(...rows.map((r) => r.total), 1);
    const legend = [
      ...new Map(
        sets
          .filter((ds) => ds.label)
          .map((ds) => {
            const raw = ds.backgroundColor ?? ds.borderColor ?? "#6366f1";
            return [
              ds.label,
              { label: ds.label, color: Array.isArray(raw) ? raw[0] || "#6366f1" : raw },
            ];
          }),
      ).values(),
    ];
    return `<div class="simple-chart">
    ${rows
      .map(
        (r) => `
    <div class="sc-row">
      <div class="sc-label">${escapeHtml(r.label)}</div>
      <div class="sc-track">${r.parts
        .filter((p) => p.value > 0)
        .map(
          (p) =>
            `<button type="button" class="sc-seg" data-label="${escapeHtml(p.label || r.label)}" data-value="${escapeHtml(fmtMoney(p.value))}" aria-label="${escapeHtml((p.label || r.label) + ": " + fmtMoney(p.value))}" style="width:${(p.value / max) * 100}%;background:${p.color}"></button>`,
        )
        .join("")}</div>
      <div class="sc-val">${fmtMoney(r.total)}</div>
    </div>`,
      )
      .join("")}
    ${legend.length > 1 ? `<div class="sc-legend">${legend.map((l) => `<span class="sc-key"><i style="background:${l.color}"></i>${escapeHtml(l.label)}</span>`).join("")}</div>` : ""}
  </div>`;
  }

  function withTouchOpts(cfg) {
    const narrow = window.innerWidth < 900;
    const o = (cfg.options = cfg.options || {});
    o.interaction = { mode: "nearest", intersect: false, axis: "x", ...(o.interaction || {}) };
    o.plugins = o.plugins || {};
    o.plugins.tooltip = {
      enabled: true,
      position: "nearest",
      displayColors: true,
      padding: narrow ? 12 : 10,
      caretSize: 7,
      cornerRadius: 10,
      titleFont: { family: "Inter", size: narrow ? 13 : 12 },
      bodyFont: { family: "Inter", size: narrow ? 13 : 12 },
      ...(o.plugins.tooltip || {}),
    };
    const lg = (o.plugins.legend = o.plugins.legend || {});
    lg.labels = {
      boxWidth: narrow ? 10 : 12,
      padding: narrow ? 10 : 14,
      font: { family: "Inter", size: narrow ? 11 : 12 },
      ...(lg.labels || {}),
    };
    if (narrow) {
      lg.position = "bottom";
      lg.align = "start";
      lg.maxHeight = 72;
    }
    o.elements = o.elements || {};
    o.elements.point = { radius: 3, hitRadius: 18, hoverRadius: 6, ...(o.elements.point || {}) };
    return cfg;
  }

  function mkChart(
    id,
    cfg,
    emptyTitle = "No data yet",
    emptyMsg = "Add a transaction to see this chart come to life.",
  ) {
    if (charts[id]) {
      try {
        charts[id].destroy();
      } catch (_) {}
      delete charts[id];
    }
    if (window.Chart && Chart.getChart) {
      const stale = Chart.getChart(id);
      if (stale) {
        try {
          stale.destroy();
        } catch (_) {}
      }
    }
    const ctx = document.getElementById(id);
    if (!ctx) return;
    const wrap = ctx.parentElement;
    wrap.querySelectorAll(".chart-fallback").forEach((n) => n.remove());
    if (!chartHasData(cfg)) {
      ctx.style.display = "none";
      wrap.insertAdjacentHTML(
        "beforeend",
        `
      <div class="chart-fallback">
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">📊</div>
          <h4>${escapeHtml(emptyTitle)}</h4>
          <p>${escapeHtml(emptyMsg)}</p>
          <button type="button" class="btn primary" data-open-tx>＋ Add Transaction</button>
        </div>
      </div>
    `,
      );
      return;
    }
    if (isSmallScreen()) {
      ctx.style.display = "none";
      wrap.insertAdjacentHTML(
        "beforeend",
        `<div class="chart-fallback">${simpleChartHtml(cfg)}</div>`,
      );
      return;
    }
    ctx.style.display = "";
    if (!window.Chart) return;
    charts[id] = new Chart(ctx, withTouchOpts(cfg));
  }

  function renderCharts() {
    const c = themeColors();
    const commonAxis = {
      grid: { color: c.grid },
      ticks: { color: c.text, font: { family: "Inter" } },
    };
    const commonOpts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: c.text, font: { family: "Inter" } } } },
      scales: { x: commonAxis, y: commonAxis },
      animation: { duration: 600, easing: "easeOutCubic" },
    };
    const actual = actualTx();

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      months.push(d);
    }
    const sumIn = (m, type) => {
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      return actual
        .filter((t) => t.type === type && new Date(t.date) >= m && new Date(t.date) < next)
        .reduce((a, t) => a + num(t.amount), 0);
    };
    mkChart("chartIE", {
      type: "bar",
      data: {
        labels: months.map((m) => m.toLocaleString("default", { month: "short" })),
        datasets: [
          {
            label: "Income",
            data: months.map((m) => sumIn(m, "income")),
            backgroundColor: "rgba(16,185,129,.85)",
            borderRadius: 8,
            maxBarThickness: 26,
          },
          {
            label: "Expense",
            data: months.map((m) => sumIn(m, "expense")),
            backgroundColor: "rgba(239,68,68,.85)",
            borderRadius: 8,
            maxBarThickness: 26,
          },
        ],
      },
      options: commonOpts,
    });

    const catTotals = categoryTotals(actual);
    const catLabels = Object.keys(catTotals);
    mkChart(
      "chartPie",
      {
        type: "doughnut",
        data: {
          labels: catLabels,
          datasets: [
            {
              data: catLabels.map((k) => catTotals[k]),
              backgroundColor: catLabels.map((k) => CAT_COLORS[k] || "#6366f1"),
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "65%",
          plugins: {
            legend: {
              position: "right",
              labels: { color: c.text, font: { family: "Inter" }, boxWidth: 10 },
            },
          },
          animation: { duration: 700 },
        },
      },
      "No spending data yet",
      "Expenses you record will appear here by category.",
    );

    const t12 = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      t12.push(d);
    }
    const savingsData = t12.map((m) => {
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      return computeStats(actual.filter((t) => new Date(t.date) >= m && new Date(t.date) < next))
        .savings;
    });
    mkChart("chartTrend", {
      type: "line",
      data: {
        labels: t12.map((m) => m.toLocaleString("default", { month: "short" })),
        datasets: [
          {
            label: "Net (Savings)",
            data: savingsData,
            borderColor: "#6366f1",
            backgroundColor: "rgba(99,102,241,.15)",
            borderWidth: 3,
            tension: 0.4,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: "#6366f1",
          },
        ],
      },
      options: commonOpts,
    });

    const days7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = startOfDay();
      d.setDate(d.getDate() - i);
      days7.push(d);
    }
    const wk = days7.map((d) => {
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      return actual
        .filter((t) => t.type === "expense" && new Date(t.date) >= d && new Date(t.date) < next)
        .reduce((a, t) => a + num(t.amount), 0);
    });
    mkChart("chartWeek", {
      type: "bar",
      data: {
        labels: days7.map((d) => d.toLocaleDateString("default", { weekday: "short" })),
        datasets: [
          {
            label: "Spent",
            data: wk,
            backgroundColor: "rgba(139,92,246,.85)",
            borderRadius: 8,
            maxBarThickness: 28,
          },
        ],
      },
      options: commonOpts,
    });
  }

  /* ============ Dashboard ============ */
  function renderDashboard() {
    const actual = actualTx();
    const list = actual.filter((t) => inRange(t));
    const s = computeStats(list);
    const balance = cashBalance();
    const hasAny = state.transactions.length > 0;

    $("#welcomeCard").classList.toggle("hidden", hasAny);
    const demoOn = hasDemoData();
    $("#demoBanner").classList.toggle("hidden", !demoOn);

    animateCount($("#statBalance"), hasAny ? balance : NaN);
    animateCount($("#statIncome"), s.income);
    animateCount($("#statExpense"), s.expense);
    animateCount($("#statSavings"), s.savings);
    $("#statSavingsRate").textContent = s.rate == null ? "—" : fmtPct(s.rate);

    const top = topCategory(list);
    $("#statBalanceSub").textContent = hasAny
      ? `${actual.length} actual entr${actual.length === 1 ? "y" : "ies"}`
      : "Add your first transaction";
    $("#statIncomeSub").textContent =
      `${list.filter((t) => t.type === "income").length} income entries ${rangeLabel()}`;
    $("#statExpenseSub").textContent = top
      ? `Top: ${top.name} · ${fmtMoney(top.amount)}`
      : `${list.filter((t) => t.type === "expense").length} expense entries`;

    // Today / month
    const today = new Date();
    const todayExp = actual
      .filter((t) => t.type === "expense" && sameDay(t.date, today))
      .reduce((a, t) => a + num(t.amount), 0);
    const monthList = actual.filter((t) => new Date(t.date) >= startOfMonth(today));
    const monthExp = monthList
      .filter((t) => t.type === "expense")
      .reduce((a, t) => a + num(t.amount), 0);
    $("#todayExpense").textContent = fmtMoney(todayExp);
    $("#monthExpense").textContent = fmtMoney(monthExp);
    $("#avgDay").textContent = fmtMoney(monthExp / Math.max(1, today.getDate()));
    $("#txCount").textContent = String(actual.length);
    const up = upcomingTx();
    $("#upcomingNote").textContent = up.length
      ? `${up.length} upcoming entr${up.length === 1 ? "y is" : "ies are"} scheduled — excluded from the totals above.`
      : "";

    renderHealth();
    renderCharts();
    renderBudgetAlerts();
    renderInsights();
    renderRecent();
  }

  function renderHealth() {
    const h = computeHealth();
    const ring = $("#healthRing");
    const circ = 2 * Math.PI * 52;
    const pct = h.score == null ? 0 : h.score;
    ring.style.strokeDasharray = String(circ);
    ring.style.strokeDashoffset = String(circ * (1 - pct / 100));
    ring.setAttribute(
      "stroke",
      h.score == null
        ? "rgba(120,120,140,.35)"
        : pct >= 70
          ? "#10b981"
          : pct >= 50
            ? "#f59e0b"
            : "#ef4444",
    );
    $("#healthScore").textContent = h.score == null ? "—" : String(h.score);
    $("#healthLabel").textContent = h.label;
    $("#healthNote").textContent = h.note;
    $("#healthFactors").innerHTML = (h.factors || [])
      .map((f) => {
        const [label, value] = String(f).split("→");
        const left = (label || "Metric").trim();
        const right = (value || "").trim() || label || "Metric";
        return `<li><span>${escapeHtml(left)}</span><strong>${escapeHtml(right)}</strong></li>`;
      })
      .join("");
    $("#sidebarHealth").textContent = (h.score == null ? "—" : h.score) + " / 100";
    $("#sidebarHealthBar").style.width = pct + "%";
  }

  function renderRecent() {
    const box = $("#recentTx");
    const list = [...state.transactions]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 6);
    if (!list.length) {
      box.innerHTML =
        emptyState(
          "No transactions yet",
          "Add your first transaction to start tracking your finances.",
        ) +
        `<div class="empty-cta"><button class="btn primary" data-open-tx>Add Transaction</button></div>`;
      return;
    }
    box.innerHTML = list
      .map((t) => {
        const color = CAT_COLORS[t.category] || "#6366f1";
        return `<div class="recent-item">
      <div class="recent-icon" style="background:${color}22;color:${color}">${escapeHtml((t.title || "?")[0].toUpperCase())}</div>
      <div class="recent-body">
        <div class="recent-title">${escapeHtml(t.title)}${isUpcoming(t) ? '<span class="tag">upcoming</span>' : ""}${t.demo ? '<span class="tag demo">demo</span>' : ""}</div>
        <div class="recent-meta">${escapeHtml(t.category)} • ${escapeHtml(t.method)} • ${fmtDate(t.date)}</div>
      </div>
      <div class="recent-amt ${t.type === "income" ? "amt-in" : "amt-out"}">${t.type === "income" ? "+" : "−"} ${fmtMoney(t.amount)}</div>
    </div>`;
      })
      .join("");
  }

  /* ============ Budget threshold alerts ============ */
  const BUDGET_THRESHOLDS = [50, 80, 100];
  const thresholdLevel = (pct) => BUDGET_THRESHOLDS.reduce((hit, th) => (pct >= th ? th : hit), 0);

  function renderBudgetAlerts() {
    const box = $("#budgetAlerts");
    if (!state.budgets.length) {
      box.innerHTML = `<div class="muted small">No budgets created yet. Create one to get 50/80/100% alerts.</div>
      <div class="empty-cta"><button class="btn" data-jump="budgets">Create a budget</button></div>`;
      return;
    }
    box.innerHTML = state.budgets
      .map((b) => {
        const spent = spentInMonth(b.category);
        const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
        const level = thresholdLevel(pct);
        let cls = "ok",
          msg = `On track — ${pct}% used`;
        if (level === 100) {
          cls = "danger";
          msg = `Overspent by ${fmtMoney(spent - b.amount)}`;
        } else if (level === 80) {
          cls = "warn";
          msg = `80% threshold reached (${pct}%)`;
        } else if (level === 50) {
          cls = "warn";
          msg = `Halfway there (${pct}%)`;
        }
        const marks = BUDGET_THRESHOLDS.map(
          (th) =>
            `<span class="th-mark${pct >= th ? " hit" : ""}" style="left:${Math.min(th, 100)}%" title="${th}% threshold"></span>`,
        ).join("");
        const chips = BUDGET_THRESHOLDS.map(
          (th) =>
            `<span class="th-chip${pct >= th ? (th === 100 ? " danger" : " warn") : ""}">${th}%</span>`,
        ).join("");
        return `<div class="alert-item ${cls}">
      <span class="dot" aria-hidden="true"></span>
      <div class="alert-body">
        <div class="alert-top"><strong>${escapeHtml(b.category)}</strong><span class="th-chips">${chips}</span></div>
        <div class="muted small">${escapeHtml(msg)} — ${fmtMoney(spent)} / ${fmtMoney(b.amount)}</div>
        <div class="th-track"><div class="th-fill ${cls}" style="width:${Math.min(100, pct)}%"></div>${marks}</div>
      </div>
    </div>`;
      })
      .join("");
  }

  let budgetAlertShown = load(LS.alerts, {}) || {};
  function checkBudgetThresholds(category) {
    const b = state.budgets.find((x) => x.category === category);
    if (!b || !(b.amount > 0)) return;
    const spent = spentInMonth(category);
    const pct = Math.round((spent / b.amount) * 100);
    const level = thresholdLevel(pct);
    if (!level) return;
    const d = new Date();
    const key = `${d.getFullYear()}-${d.getMonth()}|${category}|${level}`;
    if (budgetAlertShown[key]) return;
    budgetAlertShown[key] = true;
    save(LS.alerts, budgetAlertShown);
    toast(
      level === 100 ? `${category} budget exceeded` : `${category} at ${level}% of budget`,
      `${fmtMoney(spent)} of ${fmtMoney(b.amount)} used this month`,
      level === 100 ? "danger" : "warn",
      { label: "Dismiss", onClick: () => {} },
    );
  }

  /* ============ Insights ============ */
  const INSIGHT_ICONS = { up: "📈", down: "📉", tip: "💡", good: "✅", warn: "⚠️", info: "ℹ️" };
  function insightCard(it) {
    return `<article class="insight-card ${it.tone || "info"}">
    <span class="ic-ico" aria-hidden="true">${INSIGHT_ICONS[it.icon] || INSIGHT_ICONS.info}</span>
    <div class="ic-body">
      <div class="ic-head"><h4>${escapeHtml(it.title)}</h4>${it.badge ? `<span class="ic-badge">${escapeHtml(it.badge)}</span>` : ""}</div>
      <p class="ic-text">${it.text}</p>
    </div>
  </article>`;
  }
  const pctBadge = (n) => (n > 0 ? "+" : "") + n.toFixed(0) + "%";

  function renderInsights() {
    const box = $("#insights");
    const insights = [];
    const now = new Date();
    const actual = actualTx();
    const thisMonth = actual.filter((t) => new Date(t.date) >= startOfMonth(now));
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = actual.filter((t) => {
      const d = new Date(t.date);
      return d >= prevStart && d < startOfMonth(now);
    });

    if (!actual.length) {
      box.innerHTML = insightCard({
        tone: "info",
        icon: "tip",
        title: "No insights yet",
        text: "Insights appear once you have recorded transactions — nothing is invented from empty data.",
      });
      return;
    }

    const catNow = categoryTotals(thisMonth),
      catPrev = categoryTotals(prevMonth);
    Object.keys(catNow).forEach((k) => {
      const prev = catPrev[k] || 0;
      if (prev <= 0) return;
      const diff = ((catNow[k] - prev) / prev) * 100;
      if (Math.abs(diff) < 15) return;
      insights.push({
        tone: diff > 0 ? "warn" : "good",
        icon: diff > 0 ? "up" : "down",
        title: `${CAT_ICONS[k] || ""} ${k}`.trim(),
        badge: `${pctBadge(diff)} vs last month`,
        text: `You ${diff > 0 ? "spent" : "saved"} <strong>${escapeHtml(fmtMoney(Math.abs(catNow[k] - prev)))}</strong> ${diff > 0 ? "more" : "less"} than last month (${escapeHtml(fmtMoney(catNow[k]))} vs ${escapeHtml(fmtMoney(prev))}).`,
      });
    });

    const biggest = Object.keys(catNow).sort((a, b) => catNow[b] - catNow[a])[0];
    if (biggest)
      insights.push({
        tone: "info",
        icon: "info",
        title: "Largest category",
        badge: fmtMoney(catNow[biggest]),
        text: `<strong>${escapeHtml(biggest)}</strong> tops your spending this month.`,
      });

    const s = computeStats(thisMonth);
    if (s.income > 0 && s.rate != null) {
      if (s.rate >= 20)
        insights.push({
          tone: "good",
          icon: "good",
          title: "Healthy savings rate",
          badge: pctBadge(s.rate),
          text: `You’re saving <strong>${escapeHtml(fmtMoney(s.savings))}</strong> of ${escapeHtml(fmtMoney(s.income))} income this month.`,
        });
      else if (s.rate < 10)
        insights.push({
          tone: "warn",
          icon: "tip",
          title: "Savings rate is low",
          badge: pctBadge(s.rate),
          text: `A 20% target would be about <strong>${escapeHtml(fmtMoney(s.income * 0.2))}</strong> per month.`,
        });
    }

    const days = now.getDate();
    if (s.income > 0 && s.expense > 0 && days >= 5) {
      const avg = s.expense / days;
      const forecastExp = s.expense + avg * (daysInMonth(now) - days);
      const leftover = s.income - forecastExp;
      insights.push({
        tone: leftover >= 0 ? "good" : "danger",
        icon: leftover >= 0 ? "good" : "warn",
        title: "Month-end forecast",
        badge: (leftover < 0 ? "−" : "+") + fmtMoney(leftover),
        text: `At your current pace you’ll finish with about <strong>${escapeHtml(fmtSigned(leftover))}</strong> ${leftover >= 0 ? "left over" : "over budget"}.`,
      });
    }

    const up = upcomingTx();
    if (up.length) {
      const total = up.reduce(
        (a, t) => a + (t.type === "income" ? num(t.amount) : -num(t.amount)),
        0,
      );
      insights.push({
        tone: "info",
        icon: "info",
        title: "Upcoming (projected)",
        badge: `${up.length} entries`,
        text: `Scheduled entries add up to <strong>${escapeHtml(fmtSigned(total))}</strong>. They are excluded from your current balance until their date.`,
      });
    }

    if (!insights.length)
      insights.push({
        tone: "info",
        icon: "tip",
        title: "Not enough data yet",
        text: "Add a few more transactions and trends will appear here.",
      });
    box.innerHTML = insights.map(insightCard).join("");
  }

  /* ============ Predictions (analytics) ============ */
  function renderPredictions() {
    const box = $("#predictions");
    const items = [];
    const now = new Date();
    const thisMonth = actualTx().filter((t) => new Date(t.date) >= startOfMonth(now));
    const days = now.getDate();

    state.budgets.forEach((b) => {
      const spent = thisMonth
        .filter((t) => t.type === "expense" && t.category === b.category)
        .reduce((a, t) => a + num(t.amount), 0);
      if (spent <= 0 || !(b.amount > 0)) return;
      const rate = spent / Math.max(1, days);
      const daysLeftInBudget = rate > 0 ? (b.amount - spent) / rate : Infinity;
      const title = `${CAT_ICONS[b.category] || ""} ${b.category}`.trim();
      if (daysLeftInBudget <= 0)
        items.push({
          tone: "danger",
          icon: "warn",
          title,
          badge: "Over budget",
          text: `Spent <strong>${escapeHtml(fmtMoney(spent))}</strong> of ${escapeHtml(fmtMoney(b.amount))} — overspent by ${escapeHtml(fmtMoney(spent - b.amount))}.`,
        });
      else if (daysLeftInBudget < daysInMonth(now) - days)
        items.push({
          tone: "warn",
          icon: "up",
          title,
          badge: `~${Math.ceil(daysLeftInBudget)} days left`,
          text: "At this pace you may exceed this budget before month end.",
        });
      else
        items.push({
          tone: "good",
          icon: "down",
          title,
          badge: "On track",
          text: `Projected to end at <strong>${escapeHtml(fmtMoney(rate * daysInMonth(now)))}</strong> of ${escapeHtml(fmtMoney(b.amount))}.`,
        });
    });

    const monthlySave = computeStats(thisMonth).savings;
    state.goals.forEach((g) => {
      const remaining = num(g.target) - num(g.saved);
      if (monthlySave > 0 && remaining > 0) {
        const months = Math.ceil(remaining / monthlySave);
        const eta = new Date(now.getFullYear(), now.getMonth() + months, 1);
        items.push({
          tone: "info",
          icon: "tip",
          title: `🎯 ${g.name}`,
          badge: eta.toLocaleString("default", { month: "short", year: "numeric" }),
          text: `At ${escapeHtml(fmtMoney(monthlySave))}/month you’ll reach this goal in <strong>${months} month${months > 1 ? "s" : ""}</strong>.`,
        });
      }
    });

    if (!items.length)
      items.push({
        tone: "info",
        icon: "tip",
        title: "No predictions yet",
        text: "Set budgets and savings goals, and record some spending, to unlock forecasts.",
      });
    box.innerHTML = items.map(insightCard).join("");
  }

  /* ============ Transactions view ============ */
  function populateSelects() {
    const all = [...CATS.income, ...CATS.expense];
    const opt = (v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`;
    const catOpt = (v) =>
      `<option value="${escapeHtml(v)}">${CAT_ICONS[v] || "•"}  ${escapeHtml(v)}</option>`;
    const methOpt = (v) =>
      `<option value="${escapeHtml(v)}">${METHOD_ICONS[v] || "•"}  ${escapeHtml(v)}</option>`;
    $("#txCategory").innerHTML = '<option value="">All categories</option>' + all.map(opt).join("");
    $("#txMethod").innerHTML = '<option value="">All methods</option>' + METHODS.map(opt).join("");
    $("#fMethod").innerHTML = METHODS.map(methOpt).join("");
    $("#bCategory").innerHTML = CATS.expense.map(catOpt).join("");
    refreshCategoryOptions();
  }
  function refreshCategoryOptions() {
    const t = $("#fType").value === "income" ? "income" : "expense";
    $("#fCategory").innerHTML = CATS[t]
      .map(
        (v) => `<option value="${escapeHtml(v)}">${CAT_ICONS[v] || "•"}  ${escapeHtml(v)}</option>`,
      )
      .join("");
  }

  function applyDatePreset(preset) {
    const now = new Date();
    const from = $("#txFrom"),
      to = $("#txTo");
    if (!from || !to) return;
    if (!preset) {
      from.value = "";
      to.value = "";
      return;
    }
    if (preset === "today") {
      from.value = isoDay(now);
      to.value = isoDay(now);
    } else if (preset === "week") {
      from.value = isoDay(startOfWeek(now));
      to.value = isoDay(now);
    } else if (preset === "month") {
      from.value = isoDay(startOfMonth(now));
      to.value = isoDay(now);
    } else if (preset === "lastmonth") {
      from.value = isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      to.value = isoDay(new Date(now.getFullYear(), now.getMonth(), 0));
    } else if (preset === "year") {
      from.value = isoDay(startOfYear(now));
      to.value = isoDay(now);
    } else {
      const days = Math.max(1, +preset || 7);
      const s = new Date(now);
      s.setDate(s.getDate() - (days - 1));
      from.value = isoDay(s);
      to.value = isoDay(now);
    }
  }

  function getFiltered() {
    const val = (id) => {
      const el = document.getElementById(id);
      return el ? el.value : "";
    };
    const q = val("txSearch").trim().replace(/\s+/g, " ").toLowerCase();
    const type = val("txType"),
      cat = val("txCategory"),
      met = val("txMethod");
    const from = parseDayInput(val("txFrom"));
    const toDay = parseDayInput(val("txTo"));
    const to = toDay ? endOfDay(toDay) : null;
    const sort = val("txSort") || "newest";
    const minRaw = parseFloat(val("txMin")),
      maxRaw = parseFloat(val("txMax"));
    const min = Number.isFinite(minRaw) ? minRaw : null;
    const max = Number.isFinite(maxRaw) ? maxRaw : null;
    const rec = val("txRecur");
    const when = val("txWhen");

    const list = state.transactions.filter((t) => {
      if (type && t.type !== type) return false;
      if (cat && t.category !== cat) return false;
      if (met && t.method !== met) return false;
      const d = new Date(t.date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      const amt = Math.abs(num(t.amount));
      if (min !== null && amt < min) return false;
      if (max !== null && amt > max) return false;
      const isRec = !!(t.recur && t.recur !== "none") || !!t.generated;
      if (rec === "only" && !isRec) return false;
      if (rec === "none" && isRec) return false;
      if (when === "actual" && isUpcoming(t)) return false;
      if (when === "upcoming" && !isUpcoming(t)) return false;
      if (q) {
        const hay = [t.title, t.description, t.category, t.method, ...(t.tags || [])]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sort === "newest") list.sort((a, b) => new Date(b.date) - new Date(a.date));
    if (sort === "oldest") list.sort((a, b) => new Date(a.date) - new Date(b.date));
    if (sort === "high") list.sort((a, b) => num(b.amount) - num(a.amount));
    if (sort === "low") list.sort((a, b) => num(a.amount) - num(b.amount));

    const box = $("#txFilterSummary");
    if (box) {
      const s = computeStats(list.filter((t) => !isUpcoming(t)));
      const parts = [];
      if (q) parts.push(`“${q}”`);
      if (type) parts.push(type);
      if (cat) parts.push(cat);
      if (met) parts.push(met);
      if (min !== null || max !== null)
        parts.push(`${min !== null ? fmtMoney(min) : "0"}–${max !== null ? fmtMoney(max) : "∞"}`);
      if (from || to)
        parts.push(`${from ? fmtDate(from) : "start"} → ${to ? fmtDate(to) : "today"}`);
      if (rec === "only") parts.push("recurring only");
      if (rec === "none") parts.push("one-off only");
      if (when) parts.push(when === "actual" ? "actual only" : "upcoming only");
      box.textContent = `${list.length} match${list.length === 1 ? "" : "es"}${parts.length ? " • " + parts.join(" • ") : ""} • Actual in ${fmtMoney(s.income)} / out ${fmtMoney(s.expense)} • Net ${fmtSigned(s.savings)}`;
    }
    return list;
  }

  function renderTransactions() {
    const list = getFiltered();
    const per = state.txPerPage;
    const pages = Math.max(1, Math.ceil(list.length / per));
    if (state.txPage > pages) state.txPage = pages;
    const page = list.slice((state.txPage - 1) * per, state.txPage * per);
    const tbody = $("#txTbody");
    const cards = $("#txCards");
    const rowActions = (t) => `<div class="row-actions">
    <button type="button" title="Duplicate" aria-label="Duplicate ${escapeHtml(t.title)}" data-act="dup" data-id="${escapeHtml(t.id)}">⎘</button>
    <button type="button" title="Edit" aria-label="Edit ${escapeHtml(t.title)}" data-act="edit" data-id="${escapeHtml(t.id)}">✎</button>
    <button type="button" title="Delete" aria-label="Delete ${escapeHtml(t.title)}" class="del" data-act="del" data-id="${escapeHtml(t.id)}">🗑</button>
  </div>`;

    if (!list.length) {
      const hasAny = state.transactions.length > 0;
      const empty = hasAny
        ? emptyState("No transactions found", "Try adjusting or resetting your filters.")
        : emptyState(
            "No transactions yet",
            "Add your first transaction to start tracking your finances.",
          ) +
          `<div class="empty-cta"><button class="btn primary" data-open-tx>Add Transaction</button></div>`;
      tbody.innerHTML = `<tr><td colspan="7">${empty}</td></tr>`;
      if (cards) cards.innerHTML = empty;
      $("#pager").innerHTML = "";
      return;
    }

    const tags = (t) =>
      `${t.recur && t.recur !== "none" ? `<span class="tag recur-tag" title="Recurring ${escapeHtml(t.recur)}">↻ ${escapeHtml(t.recur)}</span>` : ""}${isUpcoming(t) ? '<span class="tag upcoming">upcoming</span>' : ""}${t.demo ? '<span class="tag demo">demo</span>' : ""}`;
    // Status tags above already cover recurring/upcoming/demo — don't repeat them in the user tag list.
    const userTags = (t) =>
      (t.tags || []).filter(
        (x) => !["demo", "upcoming", "recurring"].includes(String(x).toLowerCase()),
      );

    tbody.innerHTML = page
      .map((t) => {
        const col = CAT_COLORS[t.category] || "#6366f1";
        return `<tr class="${isUpcoming(t) ? "row-upcoming" : ""}">
      <td>${fmtDate(t.date)}</td>
      <td><div style="font-weight:600">${escapeHtml(t.title)}${tags(t)}</div>${t.description ? `<div class="muted small">${escapeHtml(t.description)}</div>` : ""}</td>
      <td><span class="cat-badge" style="background:${col}1f;color:${col}"><span class="cd"></span>${escapeHtml(t.category)}</span></td>
      <td>${escapeHtml(t.method)}</td>
      <td>${userTags(t)
        .map((x) => `<span class="tag">${escapeHtml(x)}</span>`)
        .join("")}</td>
      <td class="ta-right ${t.type === "income" ? "amt-in" : "amt-out"}">${t.type === "income" ? "+" : "−"} ${fmtMoney(t.amount)}</td>
      <td>${rowActions(t)}</td>
    </tr>`;
      })
      .join("");

    if (cards)
      cards.innerHTML = page
        .map((t) => {
          const col = CAT_COLORS[t.category] || "#6366f1";
          return `<article class="tx-card">
      <div class="txc-main">
        <div class="txc-title">${escapeHtml(t.title)}${tags(t)}</div>
        <div class="txc-amt ${t.type === "income" ? "amt-in" : "amt-out"}">${t.type === "income" ? "+" : "−"} ${fmtMoney(t.amount)}</div>
      </div>
      <div class="txc-meta">
        <span class="cat-badge" style="background:${col}1f;color:${col}"><span class="cd"></span>${escapeHtml(t.category)}</span>
        <span class="muted small">${escapeHtml(t.method)}</span>
        <span class="muted small">${fmtDate(t.date)}</span>
      </div>
      ${
        userTags(t).length
          ? `<div class="txc-tags">${userTags(t)
              .map((x) => `<span class="tag">${escapeHtml(x)}</span>`)
              .join("")}</div>`
          : ""
      }
      ${t.description ? `<p class="muted small txc-desc">${escapeHtml(t.description)}</p>` : ""}
      <div class="txc-actions">${rowActions(t)}</div>
    </article>`;
        })
        .join("");

    const pager = $("#pager");
    if (pages <= 1) {
      pager.innerHTML = "";
      return;
    }
    let html = `<button ${state.txPage === 1 ? "disabled" : ""} data-p="prev" aria-label="Previous page">‹</button>`;
    for (let i = 1; i <= pages; i++)
      html += `<button class="${i === state.txPage ? "active" : ""}" data-p="${i}" aria-label="Page ${i}" ${i === state.txPage ? 'aria-current="page"' : ""}>${i}</button>`;
    html += `<button ${state.txPage === pages ? "disabled" : ""} data-p="next" aria-label="Next page">›</button>`;
    pager.innerHTML = html;
  }

  /* ============ Budgets/Goals ============ */
  function renderBudgets() {
    const box = $("#budgetsGrid");
    if (!state.budgets.length) {
      box.innerHTML = `<div class="card glass">${emptyState("No budgets created yet", "Create a budget to keep spending in check and get 50/80/100% alerts.")}<div class="empty-cta"><button class="btn primary" id="budgetsEmptyAdd">Create budget</button></div></div>`;
      const b = $("#budgetsEmptyAdd");
      if (b) b.addEventListener("click", () => openModal("budgetModal"));
      return;
    }
    const now = new Date();
    const monthStart = startOfMonth(now),
      monthEnd = endOfMonth(now);
    const monthTx = state.transactions.filter(
      (t) => t.type === "expense" && new Date(t.date) >= monthStart && new Date(t.date) <= monthEnd,
    );
    box.innerHTML = state.budgets
      .map((b) => {
        const catTx = monthTx.filter((t) => t.category === b.category);
        const spent = catTx.filter((t) => !isUpcoming(t)).reduce((a, t) => a + num(t.amount), 0);
        const scheduled = catTx.filter((t) => isUpcoming(t)).reduce((a, t) => a + num(t.amount), 0);
        const projected = spent + scheduled;
        const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
        const projPct = b.amount > 0 ? Math.round((projected / b.amount) * 100) : 0;
        const cls = pct >= 100 ? "danger" : pct >= 80 ? "warn" : "";
        const col = CAT_COLORS[b.category] || "#6366f1";
        const over = spent - b.amount;
        return `<div class="card glass budget-card reveal">
      <div class="card-head">
        <h3><span class="cat-badge" style="background:${col}1f;color:${col}"><span class="cd"></span>${escapeHtml(b.category)}</span></h3>
        <button class="icon-btn" data-del-budget="${escapeHtml(b.id)}" title="Delete budget" aria-label="Delete ${escapeHtml(b.category)} budget">✕</button>
      </div>
      <div class="stat-value" style="font-size:22px">${fmtMoney(spent)} <span class="muted small" style="font-size:12px;font-family:Inter">/ ${fmtMoney(b.amount)}</span></div>
      <div class="bar-wrap"><div class="bar-fill ${cls}" style="width:${Math.min(100, pct)}%"></div></div>
      <div class="muted small">${pct}% used • ${over > 0 ? `<span class="amt-out">Overspent by ${escapeHtml(fmtMoney(over))}</span>` : `${escapeHtml(fmtMoney(Math.max(0, b.amount - spent)))} remaining`}</div>
      ${scheduled > 0 ? `<div class="muted small budget-proj">🔁 ${escapeHtml(fmtMoney(scheduled))} scheduled later this month → projected ${escapeHtml(fmtMoney(projected))} (${projPct}%)</div>` : ""}
    </div>`;
      })
      .join("");
  }

  function renderGoals() {
    const box = $("#goalsGrid");
    if (!state.goals.length) {
      box.innerHTML = `<div class="card glass">${emptyState("No savings goals yet", "Turn a plan into a target and track your progress.")}<div class="empty-cta"><button class="btn primary" id="goalsEmptyAdd">Create goal</button></div></div>`;
      const b = $("#goalsEmptyAdd");
      if (b) b.addEventListener("click", () => openModal("goalModal"));
      return;
    }
    box.innerHTML = state.goals
      .map((g) => {
        const target = num(g.target),
          saved = num(g.saved);
        const pct = target > 0 ? Math.round((saved / target) * 100) : null;
        const eta = g.date
          ? new Date(g.date).toLocaleString("default", { month: "long", year: "numeric" })
          : "—";
        const done = target > 0 && saved >= target;
        return `<div class="card glass goal-card reveal">
      <div class="card-head">
        <h3>${escapeHtml(g.name)}${done ? ' <span class="tag">✓ complete</span>' : ""}${g.demo ? ' <span class="tag demo">demo</span>' : ""}</h3>
        <div class="btn-row">
          <button class="icon-btn" data-add-save="${escapeHtml(g.id)}" title="Add saving" aria-label="Add saving to ${escapeHtml(g.name)}">＋</button>
          <button class="icon-btn" data-del-goal="${escapeHtml(g.id)}" title="Delete goal" aria-label="Delete ${escapeHtml(g.name)}">✕</button>
        </div>
      </div>
      <div class="stat-value" style="font-size:22px">${fmtMoney(saved)} <span class="muted small" style="font-size:12px;font-family:Inter">/ ${target > 0 ? fmtMoney(target) : "no target"}</span></div>
      <div class="bar-wrap"><div class="bar-fill" style="width:${pct == null ? 0 : Math.min(100, pct)}%"></div></div>
      <div class="muted small">${pct == null ? "Set a target above 0 to track progress" : `${pct}%${pct > 100 ? " (target exceeded)" : ""}`} • Target date: ${escapeHtml(eta)}</div>
    </div>`;
      })
      .join("");
  }

  /* ============ Calendar ============ */
  function renderCalendar() {
    const cursor = state.calCursor;
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startDay = first.getDay();
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    $("#calTitle").textContent = cursor.toLocaleString("default", {
      month: "long",
      year: "numeric",
    });
    const cells = [];
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((h) =>
      cells.push(`<div class="cal-head">${h}</div>`),
    );
    const prevLast = new Date(cursor.getFullYear(), cursor.getMonth(), 0).getDate();
    for (let i = startDay - 1; i >= 0; i--)
      cells.push(`<div class="cal-day other"><div class="cd-num">${prevLast - i}</div></div>`);
    const today = new Date();
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      const dayTx = state.transactions.filter((t) => sameDay(t.date, date));
      const exp = dayTx.filter((t) => t.type === "expense").reduce((a, t) => a + num(t.amount), 0);
      const inc = dayTx.filter((t) => t.type === "income").reduce((a, t) => a + num(t.amount), 0);
      const has = dayTx.length ? "has" : "";
      const isToday = sameDay(date, today) ? "today" : "";
      const sel = state.calSelected && sameDay(date, state.calSelected) ? "selected" : "";
      cells.push(`<div class="cal-day ${has} ${isToday} ${sel}" role="button" tabindex="0" aria-label="${fmtDate(date)}${dayTx.length ? `, ${dayTx.length} transactions` : ""}" aria-pressed="${sel ? "true" : "false"}" data-date="${date.toISOString()}">
      <div class="cd-num">${d}</div>
      ${exp ? `<div class="cd-amt amt-out">−${fmtMoney(exp)}</div>` : ""}
      ${inc ? `<div class="cd-amt amt-in">+${fmtMoney(inc)}</div>` : ""}
      ${has ? '<div class="dot-cluster"><i></i></div>' : ""}
    </div>`);
    }
    const total = cells.length - 7;
    const trailing = (7 - (total % 7)) % 7;
    for (let i = 1; i <= trailing; i++)
      cells.push(`<div class="cal-day other"><div class="cd-num">${i}</div></div>`);
    const grid = $("#calGrid");
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", "Transaction calendar");
    grid.innerHTML = cells.join("");

    const box = $("#calDetail");
    if (state.calSelected) {
      const list = state.transactions.filter((t) => sameDay(t.date, state.calSelected));
      const inc = list.filter((t) => t.type === "income").reduce((a, t) => a + num(t.amount), 0);
      const exp = list.filter((t) => t.type === "expense").reduce((a, t) => a + num(t.amount), 0);
      box.innerHTML = `
      <div class="card-head"><h3>${escapeHtml(fmtDate(state.calSelected))}</h3></div>
      <div class="mini-stats" style="grid-template-columns:1fr 1fr 1fr">
        <div><div class="ms-label muted small">Income</div><div class="ms-val amt-in">${fmtMoney(inc)}</div></div>
        <div><div class="ms-label muted small">Expense</div><div class="ms-val amt-out">${fmtMoney(exp)}</div></div>
        <div><div class="ms-label muted small">Net</div><div class="ms-val">${fmtSigned(inc - exp)}</div></div>
      </div>
      <div style="margin-top:14px">${
        list.length
          ? list
              .map(
                (t) => `
        <div class="recent-item"><div class="recent-icon">${escapeHtml((t.title || "?")[0].toUpperCase())}</div>
        <div class="recent-body"><div class="recent-title">${escapeHtml(t.title)}${isUpcoming(t) ? '<span class="tag upcoming">upcoming</span>' : ""}</div><div class="recent-meta">${escapeHtml(t.category)} • ${escapeHtml(t.method)}</div></div>
        <div class="recent-amt ${t.type === "income" ? "amt-in" : "amt-out"}">${t.type === "income" ? "+" : "−"} ${fmtMoney(t.amount)}</div></div>
      `,
              )
              .join("")
          : `<div class="muted small">No transactions on this day.</div>`
      }</div>`;
    } else {
      box.innerHTML = `<div class="card-head"><h3>Select a date</h3></div><p class="muted">Click a day to see its transactions.</p>`;
    }
  }

  /* ============ Analytics summary ============ */
  function renderAnalyticsSummary() {
    const actual = actualTx();
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 29);
    const list = actual.filter((t) => new Date(t.date) >= startOfDay(from));
    const s = computeStats(list);
    $("#anNet").textContent = list.length ? fmtSigned(s.savings) : "—";
    $("#anNetSub").textContent = list.length
      ? `In ${fmtMoney(s.income)} · Out ${fmtMoney(s.expense)}`
      : "No spending data yet";
    const top = topCategory(list);
    $("#anTopCat").textContent = top ? top.name : "—";
    $("#anTopCatSub").textContent = top
      ? `${fmtMoney(top.amount)} · ${s.expense > 0 ? Math.round((top.amount / s.expense) * 100) : 0}% of expenses`
      : "No expenses recorded";
    $("#anAvgDay").textContent = list.length ? fmtMoney(s.expense / 30) : "—";
    $("#anCount").textContent = String(list.length);
    $("#anRangeSub").textContent = "Last 30 days (actual)";
  }

  function renderAnalyticsCharts() {
    const c = themeColors();
    const commonAxis = { grid: { color: c.grid }, ticks: { color: c.text } };
    const commonOpts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: c.text } } },
      scales: { x: commonAxis, y: commonAxis },
    };
    const actual = actualTx();

    const d30 = [];
    for (let i = 29; i >= 0; i--) {
      const d = startOfDay();
      d.setDate(d.getDate() - i);
      d30.push(d);
    }
    const daily = d30.map((d) => {
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      return actual
        .filter((t) => t.type === "expense" && new Date(t.date) >= d && new Date(t.date) < next)
        .reduce((a, t) => a + num(t.amount), 0);
    });
    mkChart(
      "chartDaily",
      {
        type: "line",
        data: {
          labels: d30.map((d) => d.getDate()),
          datasets: [
            {
              label: "Daily expense",
              data: daily,
              borderColor: "#ef4444",
              backgroundColor: "rgba(239,68,68,.15)",
              fill: true,
              tension: 0.35,
              pointRadius: 2,
              borderWidth: 2,
            },
          ],
        },
        options: commonOpts,
      },
      "No spending data yet",
      "Record expenses to see your daily pattern.",
    );

    const catTotals = categoryTotals(actual);
    const labels = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);
    mkChart(
      "chartCatBar",
      {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Total",
              data: labels.map((k) => catTotals[k]),
              backgroundColor: labels.map((k) => CAT_COLORS[k] || "#6366f1"),
              borderRadius: 8,
            },
          ],
        },
        options: { ...commonOpts, indexAxis: "y" },
      },
      "No spending data yet",
      "Category totals appear once you add expenses.",
    );
  }
  function renderAnalytics() {
    renderAnalyticsSummary();
    renderAnalyticsCharts();
    renderPredictions();
  }

  /* ============ Report ============ */
  function deltaStr(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return "—";
    const d = ((a - b) / Math.abs(b)) * 100;
    return `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}%`;
  }
  function renderReport() {
    const now = new Date();
    const actual = actualTx();
    const monthList = actual.filter((t) => new Date(t.date) >= startOfMonth(now));
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevList = actual.filter((t) => {
      const d = new Date(t.date);
      return d >= prevStart && d < startOfMonth(now);
    });
    const s = computeStats(monthList),
      p = computeStats(prevList);
    const catTotals = categoryTotals(monthList);
    const topCat = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a])[0];
    const largest = monthList
      .filter((t) => t.type === "expense")
      .sort((a, b) => num(b.amount) - num(a.amount))[0];
    const dayTotals = {};
    monthList
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const d = isoDay(t.date);
        dayTotals[d] = (dayTotals[d] || 0) + num(t.amount);
      });
    const activeDay = Object.keys(dayTotals).sort((a, b) => dayTotals[b] - dayTotals[a])[0];

    let reco = "Add more transactions to receive data-driven suggestions.";
    if (monthList.length) {
      const diffExp = p.expense > 0 ? ((s.expense - p.expense) / p.expense) * 100 : null;
      if (s.rate != null && s.rate >= 20)
        reco = `You saved ${fmtPct(s.rate)} of your income this month.`;
      else if (diffExp != null && diffExp > 10)
        reco = `Expenses rose ${diffExp.toFixed(0)}% vs last month. ${topCat ? `${topCat} is your largest category.` : ""}`;
      else reco = `Steady month.${topCat ? ` Consider a budget for ${topCat}.` : ""}`;
    }

    $("#monthlyReport").innerHTML = `
    <div class="card-head"><h3>${now.toLocaleString("default", { month: "long", year: "numeric" })} Cash Flow Report</h3><span class="muted small">Actual transactions only</span></div>
    <div class="grid-3">
      <div><div class="muted small">Income</div><div class="ms-val amt-in">${fmtMoney(s.income)}</div></div>
      <div><div class="muted small">Expenses</div><div class="ms-val amt-out">${fmtMoney(s.expense)}</div></div>
      <div><div class="muted small">Savings</div><div class="ms-val">${fmtSigned(s.savings)} <span class="muted small">(${s.rate == null ? "—" : fmtPct(s.rate)})</span></div></div>
    </div>
    <div class="grid-3" style="margin-top:14px">
      <div><div class="muted small">Largest expense</div><div class="ms-val">${largest ? escapeHtml(largest.title) + " — " + escapeHtml(fmtMoney(largest.amount)) : "—"}</div></div>
      <div><div class="muted small">Top category</div><div class="ms-val">${topCat ? escapeHtml(topCat) : "—"}</div></div>
      <div><div class="muted small">Most active spending day</div><div class="ms-val">${activeDay ? escapeHtml(fmtDate(activeDay)) : "—"}</div></div>
    </div>
    <div class="insight-item" style="margin-top:14px"><span class="dot"></span><div class="alert-body"><strong>vs last month</strong>Income ${deltaStr(s.income, p.income)}, Expense ${deltaStr(s.expense, p.expense)}, Savings ${deltaStr(s.savings, p.savings)}.</div></div>
    <div class="insight-item"><span class="dot"></span><div class="alert-body"><strong>Observation</strong>${escapeHtml(reco)}</div></div>`;
  }

  /* ============ Printable / PDF monthly report ============ */
  function buildReportDoc() {
    const now = new Date();
    const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });
    const monthStart = startOfMonth(now);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const actual = actualTx();
    const monthList = actual.filter((t) => new Date(t.date) >= monthStart);
    const prevList = actual.filter((t) => {
      const d = new Date(t.date);
      return d >= prevStart && d < monthStart;
    });
    const s = computeStats(monthList),
      p = computeStats(prevList);
    const catTotals = categoryTotals(monthList);
    const cats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    const pctOf = (v) => (s.expense > 0 ? Math.round((v / s.expense) * 100) : 0);
    const rows = monthList
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(
        (t) => `
    <tr>
      <td>${escapeHtml(fmtDate(t.date))}</td>
      <td>${escapeHtml(t.title)}${t.recur && t.recur !== "none" ? ' <span class="tag">recurring</span>' : ""}</td>
      <td>${escapeHtml(t.category)}</td>
      <td>${escapeHtml(t.method || "")}</td>
      <td class="r ${t.type === "income" ? "in" : "out"}">${t.type === "income" ? "+" : "−"} ${escapeHtml(fmtMoney(t.amount))}</td>
    </tr>`,
      )
      .join("");
    const budgetRows = state.budgets
      .map((b) => {
        const spent = monthList
          .filter((t) => t.type === "expense" && t.category === b.category)
          .reduce((a, t) => a + num(t.amount), 0);
        const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
        return `<tr><td>${escapeHtml(b.category)}</td><td class="r">${escapeHtml(fmtMoney(spent))}</td><td class="r">${escapeHtml(fmtMoney(b.amount))}</td><td class="r">${pct}%</td></tr>`;
      })
      .join("");
    return `<!doctype html><html><head><meta charset="utf-8" />
  <title>PaisaFlow Report — ${escapeHtml(monthLabel)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { font: 12px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color:#111827; margin:0; }
    h1 { font-size: 22px; margin:0 0 2px; }
    h2 { font-size: 14px; margin: 22px 0 8px; border-bottom:1px solid #e5e7eb; padding-bottom:4px; }
    .sub { color:#6b7280; margin-bottom:18px; }
    .kpis { display:flex; gap:10px; }
    .kpi { flex:1; border:1px solid #e5e7eb; border-radius:8px; padding:10px; }
    .kpi .l { color:#6b7280; font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
    .kpi .v { font-size:16px; font-weight:700; margin-top:3px; }
    table { width:100%; border-collapse:collapse; }
    th, td { text-align:left; padding:6px 8px; border-bottom:1px solid #eef0f3; }
    th { background:#f8fafc; font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:#6b7280; }
    .r { text-align:right; } .in { color:#059669; } .out { color:#dc2626; }
    .tag { font-size:9px; background:#eef2ff; color:#4338ca; border-radius:999px; padding:1px 6px; }
    .bar { height:6px; background:#eef0f3; border-radius:4px; overflow:hidden; }
    .bar > i { display:block; height:100%; background:#4f46e5; }
    tr { break-inside: avoid; }
    footer { margin-top:24px; color:#9ca3af; font-size:10px; }
  </style></head><body>
    <h1>PaisaFlow — ${escapeHtml(monthLabel)} Report</h1>
    <div class="sub">Generated ${escapeHtml(now.toLocaleString())} • ${monthList.length} actual transaction${monthList.length === 1 ? "" : "s"}</div>
    <div class="kpis">
      <div class="kpi"><div class="l">Income</div><div class="v in">${escapeHtml(fmtMoney(s.income))}</div></div>
      <div class="kpi"><div class="l">Expenses</div><div class="v out">${escapeHtml(fmtMoney(s.expense))}</div></div>
      <div class="kpi"><div class="l">Net savings</div><div class="v">${escapeHtml(fmtSigned(s.savings))}</div></div>
      <div class="kpi"><div class="l">Savings rate</div><div class="v">${s.rate == null ? "—" : escapeHtml(fmtPct(s.rate))}</div></div>
    </div>
    <h2>Compared to last month</h2>
    <table><thead><tr><th></th><th class="r">Last month</th><th class="r">This month</th></tr></thead><tbody>
      <tr><td>Income</td><td class="r">${escapeHtml(fmtMoney(p.income))}</td><td class="r">${escapeHtml(fmtMoney(s.income))}</td></tr>
      <tr><td>Expenses</td><td class="r">${escapeHtml(fmtMoney(p.expense))}</td><td class="r">${escapeHtml(fmtMoney(s.expense))}</td></tr>
      <tr><td>Net</td><td class="r">${escapeHtml(fmtSigned(p.savings))}</td><td class="r">${escapeHtml(fmtSigned(s.savings))}</td></tr>
    </tbody></table>
    <h2>Spending by category</h2>
    ${
      cats.length
        ? `<table><thead><tr><th>Category</th><th>Share</th><th class="r">Amount</th></tr></thead><tbody>
      ${cats.map(([c, v]) => `<tr><td>${escapeHtml(c)}</td><td><div class="bar"><i style="width:${pctOf(v)}%"></i></div></td><td class="r">${escapeHtml(fmtMoney(v))} (${pctOf(v)}%)</td></tr>`).join("")}
    </tbody></table>`
        : `<div class="sub">No expenses recorded this month.</div>`
    }
    ${budgetRows ? `<h2>Budgets</h2><table><thead><tr><th>Category</th><th class="r">Spent</th><th class="r">Limit</th><th class="r">Used</th></tr></thead><tbody>${budgetRows}</tbody></table>` : ""}
    <h2>Transactions</h2>
    ${rows ? `<table><thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Method</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="sub">No transactions this month.</div>`}
    <footer>PaisaFlow — Personal Finance Manager • Informational only, not financial advice.</footer>
  </body></html>`;
  }
  function downloadReportPdf() {
    const html = buildReportDoc();
    const w = window.open("", "_blank");
    if (!w) {
      toast("Popup blocked", "Allow popups for this site to save the PDF report.", "warn");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      try {
        w.print();
      } catch (_) {}
    }, 400);
    toast("Report ready", "Choose “Save as PDF” in the print dialog.", "success");
  }

  /* ============ Helpers ============ */
  function emptyState(title, msg) {
    return `<div class="empty"><div class="emoji" aria-hidden="true">🌤️</div><h4>${escapeHtml(title)}</h4><div>${escapeHtml(msg)}</div></div>`;
  }

  /* ============ Modals (accessible) ============ */
  let lastFocused = null;
  const FOCUSABLE =
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function openModal(id) {
    lastFocused = document.activeElement;
    const m = $("#" + id);
    if (!m) return;
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    const first = $$(FOCUSABLE, m).filter((el) => el.offsetParent !== null)[0];
    if (first) setTimeout(() => first.focus(), 30);
  }
  function closeModals() {
    let had = false;
    $$(".modal").forEach((m) => {
      if (m.id === "appDialog" || m.id === "loadingModal") return;
      if (m.classList.contains("open")) had = true;
      m.classList.remove("open");
      m.setAttribute("aria-hidden", "true");
    });
    if (!$(".modal.open")) document.body.classList.remove("modal-open");
    if (had && lastFocused && document.contains(lastFocused)) lastFocused.focus();
  }
  function trapFocus(e) {
    if (e.key !== "Tab") return;
    const open = $$(".modal.open");
    const m = open[open.length - 1];
    if (!m) return;
    const items = $$(FOCUSABLE, m).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0],
      last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function syncRecurFields() {
    const v = $("#fRecur").value;
    $("#fRecurEveryWrap").classList.toggle("hidden", v !== "custom");
    $("#fRecurUntilWrap").classList.toggle("hidden", v === "none");
  }

  function openTxModal(tx = null) {
    $("#txModalTitle").textContent = tx ? "Edit Transaction" : "Add Transaction";
    $("#txForm").dataset.editing = tx ? tx.id : "";
    $("#fType").value = tx?.type || "expense";
    refreshCategoryOptions();
    $("#fAmount").value = tx?.amount ?? "";
    $("#fTitle").value = tx?.title || "";
    $("#fCategory").value =
      tx?.category || ($("#fCategory").options[0] ? $("#fCategory").options[0].value : "");
    $("#fMethod").value = tx?.method || "Cash";
    $("#fDate").value = isoDay(tx?.date || new Date());
    $("#fTags").value = (tx?.tags || []).join(", ");
    $("#fDesc").value = tx?.description || "";
    $("#fRecur").value = tx?.recur || "none";
    $("#fRecurEvery").value = tx?.recurEvery || 14;
    $("#fRecurUntil").value = tx?.recurUntil || "";
    syncRecurFields();
    setReceiptPreview(tx?.receipt || null, tx?.receiptName || "");
    $$(".form-error", $("#txForm")).forEach((el) => el.remove());
    validateTxForm();
    openModal("txModal");
  }

  /* ============ Receipt dropzone ============ */
  let receiptData = null;
  function setReceiptPreview(dataUrl, name = "Receipt", size) {
    receiptData = dataUrl || null;
    const inner = $("#fDzInner"),
      prev = $("#fDzPreview");
    if (!inner || !prev) return;
    if (dataUrl) {
      $("#fDzThumb").src = dataUrl;
      $("#fDzName").textContent = name || "Receipt";
      $("#fDzSize").textContent = size ? (size / 1024).toFixed(0) + " KB" : "";
      inner.classList.add("hidden");
      prev.classList.remove("hidden");
    } else {
      $("#fDzThumb").removeAttribute("src");
      inner.classList.remove("hidden");
      prev.classList.add("hidden");
      const inp = $("#fReceipt");
      if (inp) inp.value = "";
    }
  }
  function handleReceiptFile(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) {
      toast("Unsupported file", "Please choose an image file.", "warn");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast("File too large", "Receipts must be under 2MB.", "warn");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => toast("Could not read file", "Please try a different image.", "danger");
    reader.onload = () => setReceiptPreview(reader.result, file.name, file.size);
    reader.readAsDataURL(file);
  }
  function initDropzone() {
    const dz = $("#fDropzone");
    if (!dz) return;
    const input = $("#fReceipt");
    dz.addEventListener("click", (e) => {
      if (e.target.closest("#fDzClear")) return;
      input.click();
    });
    dz.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });
    input.addEventListener("change", () => handleReceiptFile(input.files[0]));
    ["dragenter", "dragover"].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.add("drag");
      }),
    );
    ["dragleave", "drop"].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.remove("drag");
      }),
    );
    dz.addEventListener("drop", (e) => handleReceiptFile(e.dataTransfer?.files?.[0]));
    $("#fDzClear").addEventListener("click", (e) => {
      e.stopPropagation();
      setReceiptPreview(null);
    });
  }

  /* ============ Live form validation ============ */
  const MAX_AMOUNT = 1e12;
  function validateTxForm() {
    const amountEl = $("#fAmount"),
      titleEl = $("#fTitle"),
      catEl = $("#fCategory"),
      save = $("#txSave");
    if (!save) return true;
    const amount = parseFloat(amountEl.value);
    const okAmount = Number.isFinite(amount) && amount > 0 && amount < MAX_AMOUNT;
    const okTitle = titleEl.value.trim().length > 0;
    const okCat = !!catEl.value;
    amountEl.parentElement.classList.toggle("field-error", amountEl.value !== "" && !okAmount);
    titleEl.parentElement.classList.toggle(
      "field-error",
      titleEl.dataset.touched === "1" && !okTitle,
    );
    save.disabled = !(okAmount && okTitle && okCat);
    return okAmount && okTitle && okCat;
  }
  function initTxValidation() {
    ["#fAmount", "#fTitle", "#fCategory", "#fType"].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      el.addEventListener("input", validateTxForm);
      el.addEventListener("change", validateTxForm);
      el.addEventListener("blur", () => {
        el.dataset.touched = "1";
        validateTxForm();
      });
    });
  }

  /* ============ Recurring transactions (projection only) ============
   Generated occurrences are derived from their parent rule on every refresh,
   never persisted, and always dated in the future. */
  const RECUR_HORIZON_DAYS = 183;
  function nextOccurrence(date, tx) {
    const d = new Date(date);
    if (tx.recur === "daily") d.setDate(d.getDate() + 1);
    else if (tx.recur === "weekly") d.setDate(d.getDate() + 7);
    else if (tx.recur === "monthly") {
      const day = new Date(tx.date).getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      d.setDate(Math.min(day, daysInMonth(d)));
    } else if (tx.recur === "yearly") {
      d.setFullYear(d.getFullYear() + 1);
    } else if (tx.recur === "custom")
      d.setDate(d.getDate() + Math.max(1, parseInt(tx.recurEvery, 10) || 1));
    else return null;
    return d;
  }
  function syncRecurring() {
    state.transactions = state.transactions.filter((t) => !t.generated);
    const horizon = endOfDay(new Date());
    horizon.setDate(horizon.getDate() + RECUR_HORIZON_DAYS);
    const parents = state.transactions.filter((t) => t.recur && t.recur !== "none");
    const generated = [];
    parents.forEach((p) => {
      const untilDay = parseDayInput(p.recurUntil);
      const until = untilDay ? endOfDay(untilDay) : null;
      let cur = nextOccurrence(p.date, p);
      let guard = 0;
      while (cur && cur <= horizon && (!until || cur <= until) && guard++ < 800) {
        generated.push({
          ...p,
          id: p.id + "::" + isoDay(cur),
          date: new Date(cur).toISOString(),
          generated: true,
          parentId: p.id,
          receipt: null,
        });
        cur = nextOccurrence(cur, p);
      }
    });
    state.transactions = state.transactions.concat(generated);
  }

  /* ============ Categories management ============ */
  function renderCategories() {
    ["expense", "income"].forEach((type) => {
      const list = CATS[type];
      const used = (c) => state.transactions.filter((t) => t.category === c && !t.generated).length;
      const key = type[0].toUpperCase() + type.slice(1);
      $("#catCount" + key).textContent = `${list.length} categor${list.length === 1 ? "y" : "ies"}`;
      const box = $("#catList" + key);
      box.innerHTML =
        list
          .map((c, i) => {
            const col = CAT_COLORS[c] || "#6366f1";
            return `<li class="cat-row" data-cat="${escapeHtml(c)}" data-type="${type}">
        <span class="cat-badge" style="background:${col}1f;color:${col}"><span class="cd"></span>${escapeHtml(CAT_ICONS[c] || "🏷️")} ${escapeHtml(c)}</span>
        <span class="muted small cat-used">${used(c)} tx</span>
        <span class="cat-actions">
          <button type="button" data-cat-act="up" ${i === 0 ? "disabled" : ""} aria-label="Move ${escapeHtml(c)} up">↑</button>
          <button type="button" data-cat-act="down" ${i === list.length - 1 ? "disabled" : ""} aria-label="Move ${escapeHtml(c)} down">↓</button>
          <button type="button" data-cat-act="rename" aria-label="Rename ${escapeHtml(c)}">✎</button>
          <button type="button" class="del" data-cat-act="del" aria-label="Delete ${escapeHtml(c)}">🗑</button>
        </span>
      </li>`;
          })
          .join("") || emptyState("No categories yet", "Add your first one above.");
    });
  }
  const catExists = (name) =>
    [...CATS.income, ...CATS.expense].some((c) => c.toLowerCase() === String(name).toLowerCase());
  function addCategory(type, raw) {
    const name = String(raw || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 24);
    if (!name) {
      toast("Name required", "Enter a category name.", "warn");
      return false;
    }
    if (catExists(name)) {
      toast("Already exists", `"${name}" is already a category.`, "warn");
      return false;
    }
    CATS[type].push(name);
    ensureCatMeta(name);
    afterCategoryChange("Category added", name);
    return true;
  }
  async function renameCategory(type, oldName) {
    const next = await showPrompt({
      title: "Rename category",
      subtitle: "Transactions and budgets follow the new name",
      message: `Choose a new name for "${oldName}".`,
      input: { label: "Category name", value: oldName, placeholder: "Category name" },
      confirmText: "Rename",
    });
    if (next === null) return;
    const name = String(next).trim().replace(/\s+/g, " ").slice(0, 24);
    if (!name || name === oldName) return;
    if (catExists(name)) {
      toast("Already exists", `"${name}" is already a category.`, "warn");
      return;
    }
    CATS[type] = CATS[type].map((c) => (c === oldName ? name : c));
    ensureCatMeta(name);
    state.transactions.forEach((t) => {
      if (t.category === oldName) t.category = name;
    });
    state.budgets.forEach((b) => {
      if (b.category === oldName) b.category = name;
    });
    afterCategoryChange("Category renamed", `${oldName} → ${name}`);
  }
  function moveCategory(type, name, dir) {
    const i = CATS[type].indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= CATS[type].length) return;
    [CATS[type][i], CATS[type][j]] = [CATS[type][j], CATS[type][i]];
    afterCategoryChange("Order updated", "");
  }
  async function deleteCategory(type, name) {
    if (CATS[type].length <= 1) {
      toast("Cannot delete", "Keep at least one category.", "warn");
      return;
    }
    const used = state.transactions.filter((t) => t.category === name && !t.generated).length;
    if (used) {
      const ok = await showConfirm({
        title: `Delete "${name}"?`,
        subtitle: "This category is in use",
        message: `${used} transaction(s) use this category. They will be moved to another category.`,
        confirmText: "Delete category",
        variant: "danger",
      });
      if (!ok) return;
    }
    const remaining = CATS[type].filter((c) => c !== name);
    const target = remaining.includes("Others") ? "Others" : remaining[0];
    CATS[type] = remaining;
    state.transactions.forEach((t) => {
      if (t.category === name) t.category = target;
    });
    state.budgets = state.budgets.filter((b) => b.category !== name);
    afterCategoryChange("Category deleted", name);
  }
  function afterCategoryChange(title, msg) {
    save(LS.cats, { income: CATS.income, expense: CATS.expense });
    populateSelects();
    refreshAll();
    renderCategories();
    if (title) toast(title, msg, "success");
  }

  /* ============ CSV ============ */
  function parseCsv(text) {
    const rows = [];
    let row = [],
      cell = "",
      q = false;
    const src = String(text)
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n");
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (q) {
        if (ch === '"') {
          if (src[i + 1] === '"') {
            cell += '"';
            i++;
          } else q = false;
        } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else cell += ch;
    }
    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  }
  /** Quotes a CSV cell and neutralises spreadsheet formula injection. */
  function csvCell(value) {
    let s = String(value == null ? "" : value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  }
  const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const txSignature = (t) =>
    [isoDay(t.date), t.type, String(t.title).toLowerCase().trim(), num(t.amount), t.category].join(
      "|",
    );

  async function importTransactionsCsv(text, mode = "merge") {
    const rows = parseCsv(text);
    if (rows.length < 2) {
      toast("Nothing imported", "That CSV has no data rows.", "warn");
      return;
    }
    const head = rows[0].map((h) => String(h).trim().toLowerCase());
    const idx = (...names) => {
      for (const n of names) {
        const i = head.indexOf(n);
        if (i > -1) return i;
      }
      return -1;
    };
    const iDate = idx("date"),
      iType = idx("type"),
      iTitle = idx("title", "description", "note"),
      iCat = idx("category"),
      iMethod = idx("method", "payment method"),
      iAmt = idx("amount"),
      iTags = idx("tags"),
      iDesc = idx("description", "note");
    if (iDate < 0 || iAmt < 0) {
      toast("Import failed", 'CSV needs at least "Date" and "Amount" columns.', "danger");
      return;
    }

    const existing = new Set(state.transactions.filter((t) => !t.generated).map(txSignature));
    const parsed = [];
    let skipped = 0,
      dupes = 0;
    const reasons = new Set();
    for (const r of rows.slice(1)) {
      const rawAmt = String(r[iAmt] ?? "").replace(/[^0-9.\-]/g, "");
      const signed = parseFloat(rawAmt);
      const amount = Math.abs(signed);
      const d = new Date(String(r[iDate] ?? "").trim());
      if (!Number.isFinite(amount) || amount <= 0 || amount >= MAX_AMOUNT) {
        skipped++;
        reasons.add("invalid amount");
        continue;
      }
      if (isNaN(d.getTime())) {
        skipped++;
        reasons.add("invalid date");
        continue;
      }
      let type = String(r[iType] ?? "")
        .trim()
        .toLowerCase();
      if (type !== "income" && type !== "expense")
        type =
          signed < 0
            ? "expense"
            : String(r[iType] ?? "")
                  .toLowerCase()
                  .includes("credit")
              ? "income"
              : "expense";
      let category = String(r[iCat] ?? "")
        .trim()
        .slice(0, 24);
      if (!category) category = type === "income" ? CATS.income[0] || "Salary" : "Others";
      if (!CATS[type].includes(category)) {
        CATS[type].push(category);
        ensureCatMeta(category);
      }
      let method = String(r[iMethod] ?? "").trim();
      if (!METHODS.includes(method)) method = "Cash";
      const tx = sanitizeTx({
        id: uid(),
        type,
        amount,
        title: String(r[iTitle] ?? "").trim() || category,
        category,
        method,
        date: d.toISOString(),
        tags: String(r[iTags] ?? "")
          .split(/[|,]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 10),
        description: String(iDesc > -1 && iDesc !== iTitle ? (r[iDesc] ?? "") : "").trim(),
        recur: "none",
      });
      const sig = txSignature(tx);
      if (mode === "merge" && existing.has(sig)) {
        dupes++;
        continue;
      }
      existing.add(sig);
      parsed.push(tx);
    }

    if (!parsed.length) {
      toast(
        "Nothing imported",
        dupes
          ? `${dupes} duplicate row(s) skipped.`
          : `${skipped} row(s) were invalid (${[...reasons].join(", ") || "unreadable"}).`,
        "warn",
      );
      return;
    }
    if (mode === "replace") {
      const real = state.transactions.filter((t) => !t.generated).length;
      const ok = await showConfirm({
        title: "Replace all transactions?",
        subtitle: "Import mode: replace",
        message: `All ${real} existing transaction(s) will be replaced with ${parsed.length} imported row(s).`,
        confirmText: "Replace all",
        variant: "danger",
      });
      if (!ok) return;
    }
    const snapshot = JSON.parse(JSON.stringify(state.transactions.filter((t) => !t.generated)));
    state.transactions =
      mode === "replace" ? parsed : state.transactions.filter((t) => !t.generated).concat(parsed);
    save(LS.cats, { income: CATS.income, expense: CATS.expense });
    populateSelects();
    refreshAll();
    toast(
      "Import complete",
      `${parsed.length} added${dupes ? ` · ${dupes} duplicates skipped` : ""}${skipped ? ` · ${skipped} invalid` : ""}`,
      "success",
      {
        label: "Undo",
        onClick: () => {
          state.transactions = snapshot;
          refreshAll();
          toast("Import reverted", "", "warn");
        },
      },
    );
  }

  /* ============ Persistence + refresh ============ */
  function persist() {
    // Generated (projected) occurrences are never stored — they are derived.
    save(
      LS.tx,
      state.transactions.filter((t) => !t.generated),
    );
    save(LS.budgets, state.budgets);
    save(LS.goals, state.goals);
    save(LS.settings, state.settings);
    save(LS.cats, { income: CATS.income, expense: CATS.expense });
    save(LS.meta, { version: DATA_VERSION, updatedAt: new Date().toISOString() });
  }
  function renderCurrentView() {
    const v = state.view;
    if (v === "dashboard") renderDashboard();
    else if (v === "transactions") renderTransactions();
    else if (v === "budgets") renderBudgets();
    else if (v === "categories") renderCategories();
    else if (v === "goals") renderGoals();
    else if (v === "calendar") renderCalendar();
    else if (v === "reports") renderReport();
    else if (v === "analytics") renderAnalytics();
  }
  function refreshAll() {
    syncRecurring();
    persist();
    renderCurrentView();
    renderHealth();
    const demoOn = hasDemoData();
    const banner = $("#demoBanner");
    if (banner) banner.classList.toggle("hidden", !demoOn || state.view !== "dashboard");
  }

  /* ============ View switching ============ */
  function switchView(v) {
    const target = $("#view-" + v);
    if (!target) return;
    state.view = v;
    $$(".nav-item").forEach((b) => {
      const active = b.dataset.view === v;
      b.classList.toggle("active", active);
      b.setAttribute("aria-current", active ? "page" : "false");
    });
    $$(".view").forEach((s) => s.classList.add("hidden"));
    target.classList.remove("hidden");
    if (location.hash.slice(1) !== v) history.replaceState(null, "", "#" + v);
    refreshAll();
    $("#sidebar").classList.remove("open");
    $("#sidebarScrim").classList.remove("open");
  }

  /* ============ Export ============ */
  function exportCSV() {
    const list = state.view === "transactions" ? getFiltered() : state.transactions;
    if (!list.length) {
      toast("Nothing to export", "No transactions match the current filters.", "warn");
      return;
    }
    const rows = [
      [
        "Date",
        "Type",
        "Title",
        "Category",
        "Method",
        "Amount",
        "Tags",
        "Description",
        "Status",
        "Recurring",
      ],
    ];
    list.forEach((t) =>
      rows.push([
        isoDay(t.date),
        t.type,
        t.title,
        t.category,
        t.method,
        num(t.amount),
        (t.tags || []).join("|"),
        t.description || "",
        isUpcoming(t) ? "upcoming" : "actual",
        t.recur && t.recur !== "none" ? t.recur : "",
      ]),
    );
    downloadFile("paisaflow-transactions.csv", toCsv(rows), "text/csv;charset=utf-8");
    toast("CSV exported", `${list.length} row(s)`, "success");
  }
  function buildBackup() {
    return {
      app: "PaisaFlow",
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      transactions: state.transactions.filter((t) => !t.generated),
      budgets: state.budgets,
      goals: state.goals,
      settings: state.settings,
      categories: { income: CATS.income, expense: CATS.expense },
    };
  }
  function exportJSON() {
    downloadFile(
      "paisaflow-backup.json",
      JSON.stringify(buildBackup(), null, 2),
      "application/json",
    );
    toast("Backup created", "Keep this file somewhere safe.", "success");
  }
  function downloadFile(name, content, type) {
    try {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast("Download failed", "Your browser blocked the file download.", "danger");
    }
  }

  /* ============ Demo data (clearly labelled) ============ */
  function hasDemoData() {
    return (
      state.transactions.some((t) => t.demo) ||
      state.budgets.some((b) => b.demo) ||
      state.goals.some((g) => g.demo)
    );
  }
  function seedDemo() {
    const today = new Date();
    const rand = (min, max) => Math.round(min + Math.random() * (max - min));
    const tx = [];
    for (let i = 0; i < 45; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - rand(0, 60));
      const type = Math.random() < 0.25 ? "income" : "expense";
      const cat =
        type === "income"
          ? CATS.income[rand(0, CATS.income.length - 1)]
          : CATS.expense[rand(0, CATS.expense.length - 1)];
      tx.push(
        sanitizeTx({
          id: uid(),
          type,
          demo: true,
          title: (type === "income" ? `${cat} payment` : `${cat} purchase`) + " (demo)",
          amount: type === "income" ? rand(15000, 60000) : rand(200, 8000),
          category: cat,
          method: METHODS[rand(0, METHODS.length - 1)],
          date: d.toISOString(),
          tags: ["demo"],
          description: "Sample demo entry",
        }),
      );
    }
    tx.forEach((t) => {
      t.demo = true;
    });
    state.transactions = state.transactions.filter((t) => !t.demo && !t.generated).concat(tx);
    state.budgets = state.budgets
      .filter((b) => !b.demo)
      .concat([
        { id: uid(), category: "Food", amount: 15000, demo: true },
        { id: uid(), category: "Transport", amount: 6000, demo: true },
        { id: uid(), category: "Entertainment", amount: 4000, demo: true },
      ]);
    state.goals = state.goals
      .filter((g) => !g.demo)
      .concat([
        {
          id: uid(),
          name: "New Laptop (demo)",
          target: 120000,
          saved: 54000,
          date: null,
          demo: true,
        },
        {
          id: uid(),
          name: "Emergency Fund (demo)",
          target: 200000,
          saved: 80000,
          date: null,
          demo: true,
        },
      ]);
    refreshAll();
    toast(
      "Demo data loaded",
      "Sample entries are marked “demo” and can be removed any time.",
      "success",
    );
  }
  async function removeDemoData() {
    if (!hasDemoData()) {
      toast("No demo data", "There is nothing marked as demo.", "info");
      return;
    }
    const ok = await showConfirm({
      title: "Remove demo data?",
      message: "Only entries marked as demo will be deleted. Your own records stay untouched.",
      confirmText: "Remove demo data",
      variant: "warn",
    });
    if (!ok) return;
    state.transactions = state.transactions.filter((t) => !t.demo);
    state.budgets = state.budgets.filter((b) => !b.demo);
    state.goals = state.goals.filter((g) => !g.demo);
    refreshAll();
    notify.success("Demo data removed", "Your own records were kept.");
  }

  /* ============ Delete with undo ============ */
  function deleteTransaction(id) {
    const t = state.transactions.find((x) => x.id === id);
    if (!t) {
      toast("Already removed", "That transaction no longer exists.", "warn");
      refreshAll();
      return;
    }
    const series = t.recur && t.recur !== "none";
    state.transactions = state.transactions.filter((x) => x.id !== id && x.parentId !== id);
    refreshAll();
    toast(series ? "Recurring series deleted" : "Transaction deleted", t.title, "danger", {
      label: "Undo",
      onClick: () => {
        if (state.transactions.some((x) => x.id === t.id)) return;
        state.transactions.push(t);
        refreshAll();
        toast("Restored", t.title, "success");
      },
    });
  }

  /* ============ Events ============ */
  function bindEvents() {
    initDropzone();
    initTxValidation();

    $$(".nav-item").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
    document.addEventListener("click", (e) => {
      const jump = e.target.closest("[data-jump]");
      if (jump) switchView(jump.dataset.jump);
      if (e.target.closest("[data-open-tx]")) openTxModal();
    });

    // Range chips
    $$(".chips .chip").forEach((c) =>
      c.addEventListener("click", () => {
        $$(".chips .chip").forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
        state.range = c.dataset.range;
        $("#customRange").classList.toggle("hidden", state.range !== "custom");
        renderDashboard();
      }),
    );
    const onCustom = () => {
      state.customFrom = $("#rangeFrom").value || null;
      state.customTo = $("#rangeTo").value || null;
      if (
        state.customFrom &&
        state.customTo &&
        new Date(state.customFrom) > new Date(state.customTo)
      ) {
        toast("Check the dates", "The start date is after the end date.", "warn");
        return;
      }
      if (state.range === "custom") renderDashboard();
    };
    $("#rangeFrom").addEventListener("change", onCustom);
    $("#rangeTo").addEventListener("change", onCustom);

    // Theme
    $("#themeToggle").addEventListener("click", () => {
      state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
      persist();
      applyTheme();
      toast(
        "Theme updated",
        state.settings.theme === "dark" ? "Dark mode" : "Light mode",
        "success",
      );
    });

    // Sidebar (mobile drawer)
    const setDrawer = (open) => {
      $("#sidebar").classList.toggle("open", open);
      $("#sidebarScrim").classList.toggle("open", open);
      $("#menuBtn").setAttribute("aria-expanded", String(open));
    };
    $("#menuBtn").addEventListener("click", () =>
      setDrawer(!$("#sidebar").classList.contains("open")),
    );
    $("#sidebarScrim").addEventListener("click", () => setDrawer(false));

    const ft = $("#filtersToggle");
    if (ft)
      ft.addEventListener("click", () => {
        const open = $("#txFilters").classList.toggle("open");
        ft.setAttribute("aria-expanded", String(open));
      });

    // Quick add
    $("#quickAdd").addEventListener("click", () => openTxModal());
    $("#addTxBtn").addEventListener("click", () => openTxModal());
    $("#fabAdd").addEventListener("click", () => openTxModal());
    $("#welcomeAddTx").addEventListener("click", () => openTxModal());
    $("#welcomeDemo").addEventListener("click", seedDemo);
    $("#removeDemoTop").addEventListener("click", removeDemoData);

    document.addEventListener("click", (e) => {
      if (
        e.target.matches("[data-close]") ||
        (e.target.classList.contains("modal") &&
          !e.target.classList.contains("dialog") &&
          e.target.id !== "loadingModal")
      )
        closeModals();
    });

    // Transaction form
    $("#fType").addEventListener("change", refreshCategoryOptions);
    $("#fRecur").addEventListener("change", syncRecurFields);
    document.addEventListener("keydown", trapFocus);
    $("#txForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      $$(".field-error", form).forEach((el) => el.classList.remove("field-error"));
      $$(".form-error", form).forEach((el) => el.remove());
      const errors = [];
      const amount = parseFloat($("#fAmount").value);
      const title = $("#fTitle").value.trim();
      const category = $("#fCategory").value;
      const dateStr = $("#fDate").value;
      if (!title) {
        errors.push("Transaction name is required.");
        $("#fTitle").parentElement.classList.add("field-error");
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        errors.push(`Amount must be greater than ${fmtMoney(0)}.`);
        $("#fAmount").parentElement.classList.add("field-error");
      } else if (amount >= MAX_AMOUNT) {
        errors.push("That amount is too large.");
        $("#fAmount").parentElement.classList.add("field-error");
      }
      if (!category) {
        errors.push("Please select a category.");
        $("#fCategory").parentElement.classList.add("field-error");
      }
      const day = parseDayInput(dateStr);
      if (!day) {
        errors.push("Please select a valid date.");
        $("#fDate").parentElement.classList.add("field-error");
      }
      if (errors.length) {
        const err = document.createElement("div");
        err.className = "form-error";
        err.setAttribute("role", "alert");
        err.textContent = errors[0];
        form.insertBefore(err, form.firstChild);
        return;
      }
      const id = form.dataset.editing;
      const tx = sanitizeTx({
        id: id || uid(),
        type: $("#fType").value,
        title,
        amount: Math.abs(amount),
        category,
        method: $("#fMethod").value,
        date: day.toISOString(),
        tags: $("#fTags")
          .value.split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 10),
        description: $("#fDesc").value.trim(),
        recur: $("#fRecur").value,
        recurEvery: Math.max(1, Math.min(365, parseInt($("#fRecurEvery").value, 10) || 14)),
        recurUntil: $("#fRecurUntil").value || null,
        receipt: receiptData || null,
        receiptName: receiptData ? $("#fDzName").textContent || "Receipt" : null,
      });
      if (tx.recur === "none") {
        delete tx.recurEvery;
        delete tx.recurUntil;
      }
      if (id) {
        const exists = state.transactions.some((t) => t.id === id);
        if (!exists) {
          toast("Transaction no longer exists", "It may have been deleted.", "warn");
          closeModals();
          refreshAll();
          return;
        }
        state.transactions = state.transactions.filter((t) => t.parentId !== id);
        const j = state.transactions.findIndex((t) => t.id === id);
        const prev = state.transactions[j];
        tx.demo = prev.demo;
        state.transactions[j] = tx;
        toast(
          "Transaction updated",
          tx.recur !== "none" ? "Recurring series regenerated" : tx.title,
          "success",
        );
      } else {
        state.transactions.push(tx);
        toast("Transaction added", tx.title, "success");
      }
      closeModals();
      refreshAll();
      if (tx.type === "expense" && !isUpcoming(tx)) checkBudgetThresholds(tx.category);
    });

    // Tx actions (table + cards)
    const onTxAction = (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      let id = btn.dataset.id;
      let t = state.transactions.find((x) => x.id === id);
      if (!t) {
        toast("Already removed", "That transaction no longer exists.", "warn");
        refreshAll();
        return;
      }
      if (t.generated) {
        const parent = state.transactions.find((x) => x.id === t.parentId);
        if (!parent) {
          toast("Series missing", "The recurring rule was removed.", "warn");
          refreshAll();
          return;
        }
        t = parent;
        id = parent.id;
      }
      if (act === "del") deleteTransaction(id);
      if (act === "edit") openTxModal(t);
      if (act === "dup") {
        const c = { ...t, id: uid(), title: t.title + " (copy)" };
        delete c.generated;
        delete c.parentId;
        state.transactions.push(c);
        toast("Duplicated", t.title, "success");
        refreshAll();
      }
    };
    $("#txTbody").addEventListener("click", onTxAction);
    $("#txCards").addEventListener("click", onTxAction);

    // Filters
    [
      "txSearch",
      "txType",
      "txCategory",
      "txMethod",
      "txFrom",
      "txTo",
      "txSort",
      "txMin",
      "txMax",
      "txRecur",
      "txWhen",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const run = () => {
        state.txPage = 1;
        renderTransactions();
      };
      el.addEventListener("input", run);
      el.addEventListener("change", run);
    });
    const presetEl = $("#txPreset");
    presetEl.addEventListener("change", () => {
      applyDatePreset(presetEl.value);
      state.txPage = 1;
      renderTransactions();
    });
    $("#txResetFilters").addEventListener("click", () => {
      ["txSearch", "txFrom", "txTo", "txMin", "txMax"].forEach((id) => {
        const e2 = document.getElementById(id);
        if (e2) e2.value = "";
      });
      ["txType", "txCategory", "txMethod", "txRecur", "txPreset", "txWhen"].forEach((id) => {
        const e2 = document.getElementById(id);
        if (e2) e2.value = "";
      });
      $("#txSort").value = "newest";
      state.txPage = 1;
      renderTransactions();
    });

    $("#pager").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-p]");
      if (!b) return;
      const p = b.dataset.p;
      const pages = Math.max(1, Math.ceil(getFiltered().length / state.txPerPage));
      if (p === "prev") state.txPage = Math.max(1, state.txPage - 1);
      else if (p === "next") state.txPage = Math.min(pages, state.txPage + 1);
      else state.txPage = +p;
      renderTransactions();
    });

    // Global search
    $("#globalSearch").addEventListener("input", (e) => {
      if (state.view !== "transactions") switchView("transactions");
      $("#txSearch").value = e.target.value;
      state.txPage = 1;
      renderTransactions();
    });

    // Budgets
    $("#addBudgetBtn").addEventListener("click", () => openModal("budgetModal"));
    $("#budgetForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const cat = $("#bCategory").value;
      const amount = parseFloat($("#bAmount").value);
      if (!cat) {
        toast("Category required", "Choose a category for this budget.", "warn");
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0 || amount >= MAX_AMOUNT) {
        toast("Invalid limit", `Budget must be greater than ${fmtMoney(0)}.`, "warn");
        return;
      }
      const existing = state.budgets.find((b) => b.category === cat);
      if (existing) existing.amount = amount;
      else state.budgets.push({ id: uid(), category: cat, amount });
      closeModals();
      refreshAll();
      toast("Budget saved", `${cat} — ${fmtMoney(amount)}/month`, "success");
      e.target.reset();
    });
    $("#budgetsGrid").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-del-budget]");
      if (!b) return;
      const budget = state.budgets.find((x) => x.id === b.dataset.delBudget);
      if (!budget) return;
      const ok = await showConfirm({
        title: `Delete ${budget.category} budget?`,
        message: "Your transactions are not affected.",
        confirmText: "Delete budget",
        variant: "danger",
      });
      if (!ok) return;
      state.budgets = state.budgets.filter((x) => x.id !== budget.id);
      refreshAll();
      toast("Budget removed", budget.category, "warn");
    });

    // Goals
    $("#addGoalBtn").addEventListener("click", () => openModal("goalModal"));
    $("#goalForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#gName").value.trim();
      const target = parseFloat($("#gTarget").value);
      const saved = parseFloat($("#gSaved").value);
      if (!name) {
        toast("Name required", "Give your goal a name.", "warn");
        return;
      }
      if (!Number.isFinite(target) || target <= 0) {
        toast("Invalid target", `Target must be greater than ${fmtMoney(0)}.`, "warn");
        return;
      }
      state.goals.push({
        id: uid(),
        name: name.slice(0, 60),
        target,
        saved: Number.isFinite(saved) && saved > 0 ? saved : 0,
        date: $("#gDate").value || null,
      });
      closeModals();
      refreshAll();
      toast("Goal created", name, "success");
      e.target.reset();
    });
    async function addSavingToGoal(id) {
      const g = state.goals.find((x) => x.id === id);
      if (!g) return;
      const raw = await showPrompt({
        title: "Add saving",
        subtitle: g.name,
        message: "How much would you like to add to this goal?",
        input: { label: "Amount", type: "number", placeholder: "0.00", min: "0.01" },
        confirmText: "Add saving",
      });
      if (raw === null) return;
      const amt = parseFloat(raw);
      if (!Number.isFinite(amt) || amt <= 0) {
        toast("Invalid amount", `Enter an amount greater than ${fmtMoney(0)}.`, "warn");
        return;
      }
      g.saved = num(g.saved) + amt;
      refreshAll();
      if (g.target > 0 && g.saved >= g.target) toast("Goal complete! 🎉", g.name, "success");
      else toast("Saving added", `${fmtMoney(amt)} → ${g.name}`, "success");
    }
    $("#goalsGrid").addEventListener("click", async (e) => {
      const del = e.target.closest("[data-del-goal]");
      const add = e.target.closest("[data-add-save]");
      if (del) {
        const g = state.goals.find((x) => x.id === del.dataset.delGoal);
        if (!g) return;
        const ok = await showConfirm({
          title: `Delete "${g.name}"?`,
          message: "This savings goal will be removed.",
          confirmText: "Delete goal",
          variant: "danger",
        });
        if (!ok) return;
        state.goals = state.goals.filter((x) => x.id !== g.id);
        refreshAll();
        toast("Goal removed", g.name, "warn");
      }
      if (add) addSavingToGoal(add.dataset.addSave);
    });

    // Calendar
    $("#calPrev").addEventListener("click", () => {
      state.calCursor = new Date(state.calCursor.getFullYear(), state.calCursor.getMonth() - 1, 1);
      renderCalendar();
    });
    $("#calNext").addEventListener("click", () => {
      state.calCursor = new Date(state.calCursor.getFullYear(), state.calCursor.getMonth() + 1, 1);
      renderCalendar();
    });
    const pickDay = (el) => {
      state.calSelected = new Date(el.dataset.date);
      renderCalendar();
    };
    $("#calGrid").addEventListener("click", (e) => {
      const c = e.target.closest(".cal-day[data-date]");
      if (c) pickDay(c);
    });
    $("#calGrid").addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const c = e.target.closest(".cal-day[data-date]");
      if (!c) return;
      e.preventDefault();
      pickDay(c);
    });

    // Reports / exports
    $("#exportCSV").addEventListener("click", exportCSV);
    $("#exportFilteredCSV").addEventListener("click", exportCSV);
    $("#exportJSON").addEventListener("click", exportJSON);
    $("#printReport").addEventListener("click", () => window.print());
    $("#pdfReport").addEventListener("click", downloadReportPdf);

    // Settings
    $("#setCurrency").addEventListener("change", (e) => {
      state.settings.currency = e.target.value;
      persist();
      refreshAll();
      toast("Currency updated", e.target.value, "success");
    });
    $("#setDateFmt").addEventListener("change", (e) => {
      state.settings.dateFmt = e.target.value;
      persist();
      refreshAll();
    });
    $("#setTheme").addEventListener("change", (e) => {
      state.settings.theme = e.target.value === "dark" ? "dark" : "light";
      persist();
      applyTheme();
    });
    $("#backupBtn").addEventListener("click", exportJSON);
    $("#restoreBtn").addEventListener("click", () => $("#restoreFile").click());
    $("#restoreFile").addEventListener("change", (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      if (f.size > 20 * 1024 * 1024) {
        toast("File too large", "Backups above 20MB cannot be restored here.", "danger");
        return;
      }
      const r = new FileReader();
      r.onerror = () => {
        hideLoading(true);
        toast("Restore failed", "That file could not be read.", "danger");
      };
      r.onload = () => {
        restoreBackup(r.result);
      };
      showLoading("Restoring backup…");
      r.readAsText(f);
    });

    // CSV import
    $("#importCsvBtn").addEventListener("click", () => $("#importCsvFile").click());
    $("#importCsvFile").addEventListener("change", (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) {
        toast("File too large", "Please import a CSV under 5MB.", "danger");
        return;
      }
      const mode = $("#importMode").value;
      const r = new FileReader();
      r.onerror = () => {
        hideLoading(true);
        toast("Import failed", "Could not read that CSV file.", "danger");
      };
      r.onload = async () => {
        try {
          await importTransactionsCsv(r.result, mode);
        } catch {
          toast(
            "Import failed",
            "That CSV could not be processed. Your data is unchanged.",
            "danger",
          );
        } finally {
          hideLoading(true);
        }
      };
      showLoading("Importing transactions…");
      r.readAsText(f);
    });

    // Categories screen
    $$(".cat-add").forEach((form) =>
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = form.querySelector("input");
        if (addCategory(form.dataset.catType, input.value)) input.value = "";
      }),
    );
    ["#catListExpense", "#catListIncome"].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      el.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-cat-act]");
        if (!btn) return;
        const row = btn.closest(".cat-row");
        const name = row.dataset.cat,
          type = row.dataset.type,
          act = btn.dataset.catAct;
        if (act === "up") moveCategory(type, name, -1);
        else if (act === "down") moveCategory(type, name, 1);
        else if (act === "rename") renameCategory(type, name);
        else if (act === "del") deleteCategory(type, name);
      });
    });
    $("#resetCats").addEventListener("click", async () => {
      const ok = await showConfirm({
        title: "Reset categories?",
        subtitle: "Back to the PaisaFlow defaults",
        message:
          "Existing transaction categories are kept; custom categories are removed from the lists.",
        confirmText: "Reset categories",
        variant: "warn",
      });
      if (!ok) return;
      CATS.income = DEFAULT_CATS.income.slice();
      CATS.expense = DEFAULT_CATS.expense.slice();
      state.transactions.forEach((t) => {
        const list = CATS[t.type === "income" ? "income" : "expense"];
        if (t.category && !list.includes(t.category)) list.push(t.category);
      });
      afterCategoryChange("Categories reset", "");
    });

    $("#seedDemo").addEventListener("click", seedDemo);
    $("#removeDemo").addEventListener("click", removeDemoData);
    $("#clearAll").addEventListener("click", async () => {
      const ok = await showConfirm({
        title: "Clear all data?",
        subtitle: "This action cannot be undone",
        message: "This will permanently delete:",
        items: ["All transactions (including recurring rules)", "All budgets", "All savings goals"],
        confirmText: "Clear all data",
        cancelText: "Cancel",
        variant: "danger",
      });
      if (!ok) return;
      state.transactions = [];
      state.budgets = [];
      state.goals = [];
      budgetAlertShown = {};
      save(LS.alerts, budgetAlertShown);
      refreshAll();
      notify.success("All financial data has been cleared", "Your health score has been reset.");
    });

    // Tap-to-reveal values on simplified mobile charts
    document.addEventListener("click", (e) => {
      const seg = e.target.closest(".sc-seg");
      document.querySelectorAll(".sc-tip").forEach((n) => n.remove());
      if (!seg) return;
      const tip = document.createElement("span");
      tip.className = "sc-tip";
      tip.textContent = `${seg.dataset.label}: ${seg.dataset.value}`;
      seg.closest(".sc-row").appendChild(tip);
      setTimeout(() => tip.remove(), 2600);
    });

    // Keyboard shortcuts
    const SHORTCUT_VIEWS = {
      d: "dashboard",
      t: "transactions",
      a: "analytics",
      b: "budgets",
      c: "categories",
      g: "goals",
      r: "reports",
      s: "settings",
      1: "dashboard",
      2: "transactions",
      3: "analytics",
      4: "budgets",
      5: "goals",
    };
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        $("#globalSearch").focus();
        return;
      }
      if (e.key === "Escape") {
        if (dialogIsOpen()) {
          if (dialogAllowEsc) closeDialog(false);
        } else if ($(".modal.open") && !$("#loadingModal").classList.contains("open"))
          closeModals();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      if (el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName))) return;
      if ($(".modal.open")) return;
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        openTxModal();
        return;
      }
      if (SHORTCUT_VIEWS[k]) {
        e.preventDefault();
        switchView(SHORTCUT_VIEWS[k]);
      }
    });

    window.addEventListener("hashchange", () => {
      const v = location.hash.slice(1);
      if (v && v !== state.view && $("#view-" + v)) switchView(v);
    });

    // Re-render charts when crossing the mobile breakpoint
    let wasSmall = isSmallScreen(),
      rzT;
    window.addEventListener("resize", () => {
      clearTimeout(rzT);
      rzT = setTimeout(() => {
        const now = isSmallScreen();
        if (now !== wasSmall) {
          wasSmall = now;
          renderCurrentView();
        }
      }, 200);
    });

    window.addEventListener("error", () => {
      hideLoading(true);
    });
  }

  /* ============ Backup restore ============ */
  function restoreBackup(raw) {
    const snapshot = {
      transactions: JSON.parse(JSON.stringify(state.transactions.filter((t) => !t.generated))),
      budgets: JSON.parse(JSON.stringify(state.budgets)),
      goals: JSON.parse(JSON.stringify(state.goals)),
      cats: { income: CATS.income.slice(), expense: CATS.expense.slice() },
    };
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("structure");
      const looksLikeBackup = ["transactions", "budgets", "goals", "categories", "settings"].some(
        (k) => k in data,
      );
      if (!looksLikeBackup) throw new Error("structure");

      let added = 0,
        skipped = 0,
        dupes = 0;
      if (Array.isArray(data.transactions)) {
        const seen = new Set(state.transactions.filter((t) => !t.generated).map(txSignature));
        const ids = new Set(state.transactions.map((t) => t.id));
        data.transactions.forEach((t) => {
          if (!isValidTx(t)) {
            skipped++;
            return;
          }
          const tx = sanitizeTx({ ...t, id: ids.has(t.id) ? uid() : t.id || uid() });
          const sig = txSignature(tx);
          if (seen.has(sig)) {
            dupes++;
            return;
          }
          seen.add(sig);
          ids.add(tx.id);
          if (!CATS[tx.type].includes(tx.category)) {
            CATS[tx.type].push(tx.category);
            ensureCatMeta(tx.category);
          }
          state.transactions.push(tx);
          added++;
        });
      }
      if (Array.isArray(data.budgets))
        data.budgets.forEach((b) => {
          if (!b || !b.category || !Number.isFinite(Number(b.amount))) return;
          const ex = state.budgets.find((x) => x.category === b.category);
          if (ex) ex.amount = Math.abs(num(b.amount));
          else
            state.budgets.push({
              id: uid(),
              category: String(b.category).slice(0, 24),
              amount: Math.abs(num(b.amount)),
              demo: !!b.demo,
            });
        });
      if (Array.isArray(data.goals))
        data.goals.forEach((g) => {
          if (!g || !g.name) return;
          if (!state.goals.some((x) => x.name === g.name)) {
            state.goals.push({
              id: uid(),
              name: String(g.name).slice(0, 60),
              target: Math.abs(num(g.target)),
              saved: Math.abs(num(g.saved)),
              date: g.date || null,
              demo: !!g.demo,
            });
          }
        });
      if (data.settings && typeof data.settings === "object") {
        state.settings = { ...state.settings, ...data.settings };
        if (state.settings.theme !== "dark") state.settings.theme = "light";
      }
      if (data.categories && typeof data.categories === "object") {
        ["income", "expense"].forEach((k) =>
          (Array.isArray(data.categories[k]) ? data.categories[k] : []).forEach((c) => {
            const n = String(c).trim().slice(0, 24);
            if (n && !catExists(n)) {
              CATS[k].push(n);
              ensureCatMeta(n);
            }
          }),
        );
      }

      populateSelects();
      refreshAll();
      applyTheme();
      hideLoading(true);
      toast(
        "Backup restored",
        `${added} transaction(s) added${dupes ? ` · ${dupes} duplicates skipped` : ""}${skipped ? ` · ${skipped} invalid` : ""}`,
        "success",
        {
          label: "Undo",
          onClick: () => {
            state.transactions = snapshot.transactions;
            state.budgets = snapshot.budgets;
            state.goals = snapshot.goals;
            CATS.income = snapshot.cats.income;
            CATS.expense = snapshot.cats.expense;
            populateSelects();
            refreshAll();
            toast("Restore reverted", "Your previous data is back.", "warn");
          },
        },
      );
    } catch {
      hideLoading(true);
      toast(
        "Restore failed",
        "That file is not a valid PaisaFlow backup. Your existing data was not changed.",
        "danger",
      );
    }
  }

  /* ============ Public helpers ============ */
  const PF = {
    get state() {
      return state;
    },
    LS,
    DATA_VERSION,
    CATS,
    METHODS,
    $,
    $$,
    uid,
    load,
    save,
    num,
    fmtMoney,
    fmtSigned,
    fmtPct,
    fmtQty,
    fmtDate,
    isoDay,
    parseDayInput,
    escapeHtml,
    emptyState,
    toast,
    notify,
    showConfirm,
    showAlert,
    showPrompt,
    showLoading,
    hideLoading,
    withLoading,
    openModal,
    closeModals,
    mkChart,
    themeColors,
    isSmallScreen,
    downloadFile,
    toCsv,
    cashBalance,
    refreshAll,
    switchView,
  };
  window.PaisaFlow = PF;

  /* ============ Init ============ */
  function init() {
    try {
      $("#todayDate").textContent = new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      $("#searchKbd").textContent = isMac ? "⌘K" : "Ctrl K";

      const meta = load(LS.meta, null);
      if (!meta || meta.version !== DATA_VERSION)
        save(LS.meta, { version: DATA_VERSION, migratedAt: new Date().toISOString() });

      loadCategories();
      populateSelects();
      $("#setCurrency").value = state.settings.currency;
      $("#setDateFmt").value = state.settings.dateFmt;
      applyTheme();
      initDialog();
      bindEvents();

      const hash = location.hash.slice(1);
      if (hash && $("#view-" + hash)) switchView(hash);
      else refreshAll();
    } catch (err) {
      hideLoading(true);
      toast(
        "Something went wrong while starting",
        "Reload the page. Your saved data is safe.",
        "danger",
      );
    }
  }
  document.addEventListener("DOMContentLoaded", init);
})();
