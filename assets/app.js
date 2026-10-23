/* RFP Insight AI — 화면 로직 (해시 라우팅 · 공고 모니터링 · RFP 분석 · 일정 캘린더) */
(function () {
  "use strict";

  const A = window.RFPAnalyzer;
  const D = window.RFPData;
  const TODAY = D.today;

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- 공통 ---------- */

  function capabilities() {
    const raw = $("#caps").value;
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }

  // 공고마다 분석 결과를 미리 계산해 목록·정렬·캘린더에서 함께 쓴다
  function analyzeNotices() {
    const caps = capabilities();
    for (const n of D.NOTICES) n.analysis = A.analyze(n.rfpText, { today: TODAY, capabilities: caps });
  }

  function dday(date) {
    const left = A.daysBetween(TODAY, date);
    if (left < 0) return { text: "마감", cls: "past", left };
    if (left === 0) return { text: "D-Day", cls: "urgent", left };
    return { text: `D-${left}`, cls: left <= 7 ? "urgent" : left <= 14 ? "soon" : "", left };
  }

  function verdictBadge(decision) {
    const cls = decision.verdict === "Go" ? "go" : decision.verdict === "No-Go" ? "nogo" : "review";
    return `<span class="verdict ${cls}">${esc(decision.verdict)} · ${decision.score}</span>`;
  }

  const LEVEL_LABEL = { high: "높음", medium: "중간", low: "낮음" };

  /** 분석 결과 블록 (상세 패널과 RFP 분석 화면 공용) */
  function renderAnalysis(r) {
    const d = r.decision;
    const color = d.verdict === "Go" ? "var(--low)" : d.verdict === "No-Go" ? "var(--high)" : "var(--mid)";
    const high = r.risks.filter((x) => x.level === "high").length;
    const mid = r.risks.filter((x) => x.level === "medium").length;
    const why = r.risks.length
      ? `리스크 ${r.risks.length}건 (높음 ${high} · 중간 ${mid})` + (r.capability.keywords.length ? ` · 역량 키워드 ${r.capability.matched.length}/${r.capability.keywords.length} 일치` : "")
      : "검증 규칙에 걸린 리스크가 없습니다.";

    const deadline = r.dates.find((x) => x.kind === "deadline");
    const facts = [
      ["사업 예산", r.budget ? r.budget.label : "찾지 못함", r.budget && r.budget.evidence],
      ["사업 기간", r.period ? r.period.label : "찾지 못함", r.period && r.period.evidence],
      ["제출 마감", deadline ? `${deadline.dateLabel} (${dday(deadline.date).text})` : "찾지 못함", deadline && deadline.evidence],
      ["평가 배점", r.evaluation ? r.evaluation.label || "-" : "찾지 못함", r.evaluation && r.evaluation.method],
    ];

    const otherDates = r.dates.filter((x) => x.kind !== "deadline");

    return `
      <div class="card decision">
        <div class="gauge" style="--p:${d.score};--gc:${color}"><span>${d.score}</span></div>
        <div>
          <div>${verdictBadge(d)}</div>
          <div class="why">${esc(why)}</div>
          <div class="note">참여 판단 참고 지표 · 항목 추출 ${r.coverage.found}/${r.coverage.total}</div>
        </div>
      </div>

      <div class="section-title">핵심 항목</div>
      <div class="facts">
        ${facts
          .map(
            ([k, v, e]) => `<div class="card fact"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>${e ? `<div class="e">${esc(e)}</div>` : ""}</div>`
          )
          .join("")}
      </div>

      ${otherDates.length ? `<div class="section-title">주요 일정</div><div class="card" style="padding:12px 16px"><ul class="plain">${otherDates.map((x) => `<li><b>${esc(x.label)}</b> ${esc(x.dateLabel)}</li>`).join("")}</ul></div>` : ""}

      ${r.scope.length ? `<div class="section-title">사업 범위</div><div class="card" style="padding:12px 16px"><ul class="plain">${r.scope.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>` : ""}

      ${r.qualifications.length ? `<div class="section-title">참가 자격</div><div class="card" style="padding:12px 16px"><ul class="plain">${r.qualifications.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>` : ""}

      <div class="section-title">리스크 검증 (${r.risks.length}건)</div>
      <div class="card">
        ${
          r.risks.length
            ? r.risks
                .map(
                  (x) => `<div class="risk"><span class="lv ${x.level}">${LEVEL_LABEL[x.level]}</span><div class="t">${esc(x.title)}</div><div class="d">${esc(x.detail)}</div>${x.evidence ? `<div class="ev">근거: ${esc(x.evidence)}</div>` : ""}</div>`
                )
                .join("")
            : `<div class="empty">걸린 리스크가 없습니다.</div>`
        }
      </div>

      ${
        r.capability.keywords.length
          ? `<div class="section-title">역량 키워드 매칭</div><div class="tags">${r.capability.keywords
              .map((k) => `<span class="tag-k ${r.capability.matched.includes(k) ? "on" : ""}">${r.capability.matched.includes(k) ? "✓ " : ""}${esc(k)}</span>`)
              .join("")}</div>`
          : ""
      }
    `;
  }

  /* ---------- 1. 공고 모니터링 ---------- */

  const state = { group: "all", type: "all", q: "", sort: "deadline" };

  function renderKpis() {
    const all = D.NOTICES;
    const fresh = all.filter((n) => A.daysBetween(n.postedAt, TODAY) === 0).length;
    const re = all.filter((n) => n.type === "재공고").length;
    const soon = all.filter((n) => {
      const l = A.daysBetween(TODAY, n.deadlineAt);
      return l >= 0 && l <= 7;
    }).length;
    $("#kpis").innerHTML = [
      ["모니터링 공고", all.length, "건"],
      ["오늘 신규 게시", fresh, "건"],
      ["재공고", re, "건"],
      ["7일 내 마감", soon, "건"],
    ]
      .map(([k, v, u]) => `<div class="card kpi"><div class="k">${k}</div><div class="v">${v}<small>${u}</small></div></div>`)
      .join("");
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    let list = D.NOTICES.filter(
      (n) =>
        (state.group === "all" || n.group === state.group) &&
        (state.type === "all" || n.type === state.type) &&
        (!q || (n.org + " " + n.title).toLowerCase().includes(q))
    );
    const by = {
      deadline: (a, b) => a.deadlineAt - b.deadlineAt,
      posted: (a, b) => b.postedAt - a.postedAt,
      budget: (a, b) => b.budgetWon - a.budgetWon,
      score: (a, b) => b.analysis.decision.score - a.analysis.decision.score,
    }[state.sort];
    return list.sort(by);
  }

  function renderNotices() {
    const list = filtered();
    const head = `<div class="row head" role="presentation"><span>유형</span><span>기관</span><span>사업명</span><span>예산</span><span>제출 마감</span><span>판단 지표</span></div>`;
    const rows = list
      .map((n) => {
        const dd = dday(n.deadlineAt);
        return `<button type="button" class="row" role="listitem" data-id="${n.id}" aria-label="${esc(n.org + " " + n.title)} 상세 보기">
          <span class="c-type"><span class="chip t-${n.type}">${n.type}</span></span>
          <span class="org">${esc(n.org)}${n.group === "bank" ? '<span class="chip bank">시중은행</span>' : ""}</span>
          <span class="title">${esc(n.title)}</span>
          <span class="num c-budget">${A.formatWon(n.budgetWon)}</span>
          <span class="c-dday"><span class="dday ${dd.cls}">${dd.text}</span> <span class="num">${A.formatDate(n.deadlineAt).slice(5)}</span></span>
          <span class="c-verdict">${verdictBadge(n.analysis.decision)}</span>
        </button>`;
      })
      .join("");
    $("#notice-list").innerHTML = head + (rows || `<div class="empty">조건에 맞는 공고가 없습니다.</div>`);
  }

  function bindFilters() {
    for (const [id, key] of [["#f-group", "group"], ["#f-type", "type"]]) {
      $(id).addEventListener("click", (e) => {
        const b = e.target.closest("button[data-v]");
        if (!b) return;
        state[key] = b.dataset.v;
        $$("button", $(id)).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        renderNotices();
      });
    }
    $("#f-q").addEventListener("input", (e) => {
      state.q = e.target.value;
      renderNotices();
    });
    $("#f-sort").addEventListener("change", (e) => {
      state.sort = e.target.value;
      renderNotices();
    });
    $("#notice-list").addEventListener("click", (e) => {
      const row = e.target.closest(".row[data-id]");
      if (row) openNotice(row.dataset.id);
    });
  }

  /* ---------- 공고 상세 패널 ---------- */

  let lastFocus = null;

  function openNotice(id) {
    const n = D.NOTICES.find((x) => x.id === id);
    if (!n) return;
    lastFocus = document.activeElement;
    const drawer = $("#drawer");
    drawer.innerHTML = `
      <div class="drawer-top">
        <div style="flex:1">
          <span class="chip t-${n.type}">${n.type}</span>
          <span class="note" style="margin-left:6px">${esc(n.org)} · 공고 ${A.formatDate(n.postedAt)} · ${n.id}</span>
          <h2 id="drawer-title">${esc(n.title)}</h2>
        </div>
        <button type="button" class="icon-btn" id="drawer-close" aria-label="닫기">×</button>
      </div>
      ${renderAnalysis(n.analysis)}
      <div class="actions">
        <button type="button" class="btn primary" data-act="analyze">RFP 분석 화면에서 열기</button>
        <button type="button" class="btn" data-act="calendar">캘린더에서 보기</button>
      </div>
      <p class="note" style="margin-top:14px">가상 샘플 공고입니다.</p>`;
    drawer.hidden = false;
    $("#drawer-bg").hidden = false;
    document.body.style.overflow = "hidden";
    $("#drawer-close").focus();

    drawer.onclick = (e) => {
      const act = e.target.closest("[data-act]");
      if (e.target.closest("#drawer-close")) return closeNotice();
      if (!act) return;
      closeNotice();
      if (act.dataset.act === "analyze") {
        $("#rfp-text").value = n.rfpText;
        location.hash = "#analyze";
        runAnalyze(`${n.org} 공고의 RFP 요약본을 분석했습니다.`);
      } else {
        cal.year = n.deadlineAt.getFullYear();
        cal.month = n.deadlineAt.getMonth();
        location.hash = "#calendar";
        renderCalendar();
      }
    };
  }

  function closeNotice() {
    $("#drawer").hidden = true;
    $("#drawer-bg").hidden = true;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- 2. RFP 분석 ---------- */

  function setStatus(msg) {
    $("#analyze-status").textContent = msg || "";
  }

  function runAnalyze(msg) {
    const text = $("#rfp-text").value;
    if (!text.trim()) {
      setStatus("분석할 RFP 본문을 붙여넣거나 파일을 올려주세요.");
      $("#rfp-text").focus();
      return;
    }
    const t0 = performance.now();
    const r = A.analyze(text, { today: TODAY, capabilities: capabilities() });
    const ms = Math.max(1, Math.round(performance.now() - t0));
    $("#analyze-result").innerHTML = `${r.title ? `<h2 style="font-size:20px;margin:0 0 12px">${esc(r.title)}</h2>` : ""}${renderAnalysis(r)}`;
    setStatus(msg || `${r.stats.sentences}개 문장을 ${ms}ms 만에 분석했습니다.`);
    if (window.matchMedia("(max-width: 900px)").matches) $("#analyze-result").scrollIntoView({ behavior: "smooth" });
  }

  let pdfjsPromise = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfjsPromise) {
      pdfjsPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        s.onload = () => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          resolve(window.pdfjsLib);
        };
        s.onerror = () => reject(new Error("PDF 처리 모듈을 불러오지 못했습니다."));
        document.head.appendChild(s);
      });
    }
    return pdfjsPromise;
  }

  async function readFile(file) {
    if (!file) return;
    setStatus(`${file.name} 읽는 중…`);
    try {
      let text = "";
      if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
        const pdfjs = await loadPdfJs();
        const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        const pages = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          let line = "";
          let lastY = null;
          const out = [];
          for (const it of content.items) {
            const y = it.transform ? Math.round(it.transform[5]) : null;
            if (lastY !== null && y !== lastY) {
              out.push(line);
              line = "";
            }
            line += it.str;
            lastY = y;
          }
          out.push(line);
          pages.push(out.join("\n"));
        }
        text = pages.join("\n");
        if (!text.trim()) throw new Error("텍스트가 없는 PDF(스캔본)입니다. 텍스트를 붙여넣어 주세요.");
      } else {
        text = await file.text();
      }
      $("#rfp-text").value = text;
      runAnalyze(`${file.name}을(를) 분석했습니다.`);
    } catch (err) {
      setStatus(err.message || "파일을 읽지 못했습니다.");
    }
  }

  function bindAnalyze() {
    $("#caps").value = D.DEFAULT_CAPABILITIES.join(", ");
    $("#btn-analyze").addEventListener("click", () => runAnalyze());
    $("#btn-sample").addEventListener("click", () => {
      $("#rfp-text").value = D.SAMPLE_RFP;
      runAnalyze("가상 샘플 RFP를 분석했습니다.");
    });
    $("#btn-clear").addEventListener("click", () => {
      $("#rfp-text").value = "";
      $("#analyze-result").innerHTML = `<div class="card placeholder"><strong>분석 결과가 여기에 표시됩니다</strong>‘샘플 RFP 불러오기’를 누르면 바로 체험해볼 수 있어요.</div>`;
      setStatus("");
    });
    $("#caps").addEventListener("change", () => {
      analyzeNotices();
      renderNotices();
      if ($("#rfp-text").value.trim() && $("#analyze-result .decision")) runAnalyze();
    });
    $("#file").addEventListener("change", (e) => readFile(e.target.files[0]));
    const drop = $("#drop");
    ["dragenter", "dragover"].forEach((t) =>
      drop.addEventListener(t, (e) => {
        e.preventDefault();
        drop.classList.add("over");
      })
    );
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      readFile(e.dataTransfer.files[0]);
    });
  }

  /* ---------- 3. 일정 캘린더 ---------- */

  const cal = { year: TODAY.getFullYear(), month: TODAY.getMonth() };
  const EV_LABEL = { deadline: "마감", briefing: "설명회", posted: "공고" };

  function events() {
    const out = [];
    for (const n of D.NOTICES) {
      out.push({ kind: "deadline", date: n.deadlineAt, n });
      if (n.briefingAt) out.push({ kind: "briefing", date: n.briefingAt, n });
      out.push({ kind: "posted", date: n.postedAt, n });
    }
    return out;
  }

  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  function renderCalendar() {
    $("#cal-title").textContent = `${cal.year}년 ${cal.month + 1}월`;
    const first = new Date(cal.year, cal.month, 1);
    const start = new Date(cal.year, cal.month, 1 - first.getDay());
    const evs = events();
    const order = { deadline: 0, briefing: 1, posted: 2 };
    let html = ["일", "월", "화", "수", "목", "금", "토"].map((d) => `<div class="cal-dow">${d}</div>`).join("");
    for (let i = 0; i < 42; i++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (i >= 35 && day.getMonth() !== cal.month) break;
      const todays = evs.filter((e) => sameDay(e.date, day)).sort((a, b) => order[a.kind] - order[b.kind]);
      const cls = ["cal-cell", day.getMonth() !== cal.month ? "out" : "", sameDay(day, TODAY) ? "today" : ""].join(" ");
      html += `<div class="${cls}"><span class="d">${day.getDate()}</span>${todays
        .map((e) => `<button type="button" class="ev ${e.kind}" data-id="${e.n.id}" title="${esc(`${EV_LABEL[e.kind]} · ${e.n.org} ${e.n.title}`)}">${EV_LABEL[e.kind]} ${esc(e.n.org)}</button>`)
        .join("")}</div>`;
    }
    $("#cal-grid").innerHTML = html;

    const upcoming = evs
      .filter((e) => e.kind !== "posted")
      .map((e) => ({ ...e, left: A.daysBetween(TODAY, e.date) }))
      .filter((e) => e.left >= 0 && e.left <= 14)
      .sort((a, b) => a.date - b.date);
    $("#upcoming").innerHTML = upcoming.length
      ? upcoming
          .map(
            (e) => `<button type="button" class="up-item" data-id="${e.n.id}">
              <span class="when ${e.kind === "deadline" ? "dday urgent" : ""}">${e.left === 0 ? "오늘" : `D-${e.left}`}</span>
              <span class="what">${EV_LABEL[e.kind]} · ${esc(e.n.org)}<small>${esc(e.n.title)} · ${A.formatDate(e.date)}</small></span>
            </button>`
          )
          .join("")
      : `<div class="empty">14일 안에 예정된 일정이 없습니다.</div>`;
  }

  function bindCalendar() {
    const shift = (d) => {
      const dt = new Date(cal.year, cal.month + d, 1);
      cal.year = dt.getFullYear();
      cal.month = dt.getMonth();
      renderCalendar();
    };
    $("#cal-prev").addEventListener("click", () => shift(-1));
    $("#cal-next").addEventListener("click", () => shift(1));
    $("#cal-today").addEventListener("click", () => {
      cal.year = TODAY.getFullYear();
      cal.month = TODAY.getMonth();
      renderCalendar();
    });
    for (const id of ["#cal-grid", "#upcoming"]) {
      $(id).addEventListener("click", (e) => {
        const b = e.target.closest("[data-id]");
        if (b) openNotice(b.dataset.id);
      });
    }
  }

  /* ---------- 라우팅 ---------- */

  const VIEWS = ["notices", "analyze", "calendar", "about"];

  function route() {
    const name = (location.hash || "#notices").slice(1);
    const view = VIEWS.includes(name) ? name : "notices";
    for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
    $$("[data-nav]").forEach((a) => (a.dataset.nav === view ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    if (view === "calendar") renderCalendar();
    document.title = { notices: "공고 모니터링", analyze: "RFP 분석", calendar: "일정 캘린더", about: "서비스 소개" }[view] + " · RFP Insight AI";
    window.scrollTo(0, 0);
  }

  /* ---------- 시작 ---------- */

  function init() {
    bindAnalyze(); // 역량 키워드 기본값을 먼저 채운다
    analyzeNotices();
    $("#today-label").textContent = `${A.formatDate(TODAY)} 기준 · 금융기관 IT 사업 공고를 매일 모아 신규·재공고·정정을 구분합니다.`;
    renderKpis();
    renderNotices();
    bindFilters();
    bindCalendar();
    $("#drawer-bg").addEventListener("click", closeNotice);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#drawer").hidden) closeNotice();
    });
    window.addEventListener("hashchange", route);
    route();
  }

  init();
})();
