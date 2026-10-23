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

  const verdictCls = (decision) => (decision.verdict === "Go" ? "go" : decision.verdict === "No-Go" ? "nogo" : "review");

  function verdictBadge(decision) {
    return `<span class="verdict ${verdictCls(decision)}">${esc(decision.verdict)}</span>`;
  }

  /** 목록용 판단 지표: 점수 막대 + 숫자 */
  function scoreCell(decision) {
    const cls = verdictCls(decision);
    return `<span class="score" title="${esc(decision.verdict)} · 판단 지표 ${decision.score}점">
      <span class="verdict ${cls}">${esc(decision.verdict)}</span>
      <span class="bar" aria-hidden="true"><i class="${cls}" style="width:${decision.score}%"></i></span>
      <span class="n ${cls}">${decision.score}</span>
    </span>`;
  }

  const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;

  const LEVEL_LABEL = { high: "높음", medium: "중간", low: "낮음" };

  /** 분석 결과 블록 (상세 패널과 RFP 분석 화면 공용) */
  function renderAnalysis(r) {
    const d = r.decision;
    const color = d.verdict === "Go" ? "var(--low)" : d.verdict === "No-Go" ? "var(--high)" : "var(--mid)";
    const count = (lv) => r.risks.filter((x) => x.level === lv).length;
    const high = count("high");
    const mid = count("medium");
    const low = count("low");
    const why = r.risks.length
      ? `리스크 ${r.risks.length}건 (높음 ${high} · 중간 ${mid})` + (r.capability.keywords.length ? ` · 역량 키워드 ${r.capability.matched.length}/${r.capability.keywords.length} 일치` : "")
      : "검증 규칙에 걸린 리스크가 없습니다.";
    const mix = r.risks.length
      ? `<div class="risk-mix" aria-hidden="true">${[["high", high], ["medium", mid], ["low", low]]
          .filter(([, n]) => n)
          .map(([lv, n]) => `<i class="${lv}" style="flex:${n}"></i>`)
          .join("")}</div>`
      : "";

    const deadline = r.dates.find((x) => x.kind === "deadline");
    const facts = [
      ["사업 예산", r.budget ? r.budget.label : null, r.budget && r.budget.evidence],
      ["사업 기간", r.period ? r.period.label : null, r.period && r.period.evidence],
      ["제출 마감", deadline ? `${deadline.dateLabel} (${dday(deadline.date).text})` : null, deadline && deadline.evidence],
      ["평가 배점", r.evaluation ? r.evaluation.label || "-" : null, r.evaluation && r.evaluation.method],
    ];

    const otherDates = r.dates.filter((x) => x.kind !== "deadline");
    const listBlock = (title, items) =>
      items.length
        ? `<div class="section-title">${title} <span class="cnt">${items.length}</span></div><div class="card list-card"><ul class="plain">${items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>`
        : "";

    return `
      <div class="card decision">
        <div class="gauge" style="--p:${d.score};--gc:${color}"><span>${d.score}</span></div>
        <div style="min-width:0;flex:1">
          <div class="ai-tag">${icon("spark")}참여 판단 지표</div>
          <div>${verdictBadge(d)}</div>
          <div class="why">${esc(why)}</div>
          ${mix}
          <div class="note" style="margin-top:8px">규칙 기반 참고값 · 항목 추출 ${r.coverage.found}/${r.coverage.total}</div>
        </div>
      </div>

      <div class="section-title">핵심 항목</div>
      <div class="facts">
        ${facts
          .map(
            ([k, v, e]) =>
              `<div class="card fact ${v ? "" : "missing"}"><div class="k">${esc(k)}</div><div class="v">${esc(v || "찾지 못함")}</div>${e ? `<div class="e">${esc(e)}</div>` : ""}</div>`
          )
          .join("")}
      </div>

      ${
        otherDates.length
          ? `<div class="section-title">주요 일정</div><div class="card timeline">${otherDates
              .map((x) => `<div class="tl"><b>${esc(x.dateLabel)}</b><span>${esc(x.label)}</span></div>`)
              .join("")}</div>`
          : ""
      }

      ${listBlock("사업 범위", r.scope)}
      ${listBlock("참가 자격", r.qualifications)}

      <div class="section-title">리스크 검증 <span class="cnt">${r.risks.length}건</span></div>
      <div class="risks">
        ${
          r.risks.length
            ? r.risks
                .map(
                  (x) =>
                    `<div class="card risk ${x.level}"><span class="lv ${x.level}">${LEVEL_LABEL[x.level]}</span><div class="t">${esc(x.title)}</div><div class="d">${esc(x.detail)}</div>${x.evidence ? `<div class="ev">${esc(x.evidence)}</div>` : ""}</div>`
                )
                .join("")
            : `<div class="card empty">걸린 리스크가 없습니다.</div>`
        }
      </div>

      ${
        r.capability.keywords.length
          ? `<div class="section-title">역량 키워드 매칭 <span class="cnt">${r.capability.matched.length}/${r.capability.keywords.length}</span></div><div class="tags">${r.capability.keywords
              .map((k) => `<span class="tag-k ${r.capability.matched.includes(k) ? "on" : ""}">${r.capability.matched.includes(k) ? "✓ " : ""}${esc(k)}</span>`)
              .join("")}</div>`
          : ""
      }
    `;
  }

  const PLACEHOLDER = `<div class="card placeholder">
      <div class="ph-ic">${"<svg aria-hidden=\"true\"><use href=\"#i-spark\"/></svg>"}</div>
      <strong>분석 결과가 여기에 표시됩니다</strong>
      ‘샘플 RFP 불러오기’를 누르면 바로 체험해볼 수 있어요.
      <div class="ph-steps"><span>① 핵심 항목 추출</span><span>② 리스크 12종 검증</span><span>③ Go / No-Go 판단</span></div>
    </div>`;

  /* ---------- 1. 공고 모니터링 ---------- */

  const state = { group: "all", type: "all", q: "", sort: "deadline" };

  function renderKpis() {
    const all = D.NOTICES;
    const fresh = all.filter((n) => A.daysBetween(n.postedAt, TODAY) === 0).length;
    const re = all.filter((n) => n.type === "재공고").length;
    const soonList = all
      .filter((n) => {
        const l = A.daysBetween(TODAY, n.deadlineAt);
        return l >= 0 && l <= 7;
      })
      .sort((a, b) => a.deadlineAt - b.deadlineAt);
    const by = { go: 0, review: 0, nogo: 0 };
    for (const n of all) by[verdictCls(n.analysis.decision)]++;
    const pub = all.filter((n) => n.group === "public").length;
    const total = all.reduce((s, n) => s + n.budgetWon, 0);

    $("#kpis").innerHTML = `
      <div class="card kpi kpi-main">
        <div class="k">모니터링 공고</div>
        <div class="v">${all.length}<small>건</small></div>
        <div class="s">공공 금융기관 ${pub} · 시중은행 ${all.length - pub} · 총 예산 ${A.formatWon(total)}</div>
        <div class="dist" role="img" aria-label="판단 지표 분포: Go ${by.go}건, 검토 필요 ${by.review}건, No-Go ${by.nogo}건">
          <i class="go" style="flex:${by.go}"></i><i class="review" style="flex:${by.review}"></i><i class="nogo" style="flex:${by.nogo}"></i>
        </div>
        <div class="dist-legend">
          <span><i style="background:var(--low)"></i>Go <b>${by.go}</b></span>
          <span><i style="background:var(--mid)"></i>검토 필요 <b>${by.review}</b></span>
          <span><i style="background:var(--high)"></i>No-Go <b>${by.nogo}</b></span>
        </div>
      </div>
      <div class="card kpi"><div class="k">오늘 신규 게시</div><div class="v">${fresh}<small>건</small></div><div class="s">오늘 새로 올라온 공고</div></div>
      <div class="card kpi"><div class="k">재공고</div><div class="v">${re}<small>건</small></div><div class="s">유찰 후 다시 나온 공고</div></div>
      <div class="card kpi alert" style="grid-column:span 2">
        <div class="k"><span class="dot"></span>7일 내 마감</div>
        <div class="v">${soonList.length}<small>건</small></div>
        <div class="kpi-list">${soonList
          .slice(0, 3)
          .map((n) => `<button type="button" data-id="${n.id}"><span>${esc(n.org)} · ${esc(n.title)}</span><b>${dday(n.deadlineAt).text}</b></button>`)
          .join("")}</div>
      </div>`;

    const navN = $("#nav-count-notices");
    if (navN) navN.textContent = all.length;
    const navC = $("#nav-count-calendar");
    if (navC) navC.textContent = soonList.length || "";
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
        const flag = dd.cls === "urgent" ? "is-urgent" : dd.cls === "soon" ? "is-soon" : "";
        return `<button type="button" class="row ${flag}" role="listitem" data-id="${n.id}" aria-label="${esc(n.org + " " + n.title)} 상세 보기">
          <span class="c-type"><span class="chip t-${n.type}">${n.type}</span></span>
          <span class="org">${esc(n.org)}${n.group === "bank" ? '<span class="chip bank">시중은행</span>' : ""}</span>
          <span class="title">${esc(n.title)}</span>
          <span class="num c-budget">${A.formatWon(n.budgetWon)}</span>
          <span class="c-dday"><span class="dday ${dd.cls}">${dd.text}</span><span class="num">${A.formatDate(n.deadlineAt).slice(5)} 마감</span></span>
          <span class="c-verdict">${scoreCell(n.analysis.decision)}</span>
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
    $("#kpis").addEventListener("click", (e) => {
      const b = e.target.closest("[data-id]");
      if (b) openNotice(b.dataset.id);
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
        <div style="flex:1;min-width:0">
          <div class="meta">
            <span class="chip t-${n.type}">${n.type}</span>
            <span class="note">${esc(n.org)} · 공고 ${A.formatDate(n.postedAt)} · ${n.id} · 가상 샘플</span>
          </div>
          <h2 id="drawer-title">${esc(n.title)}</h2>
        </div>
        <button type="button" class="icon-btn" id="drawer-close" aria-label="닫기">${icon("x")}</button>
      </div>
      ${renderAnalysis(n.analysis)}
      <div class="actions">
        <button type="button" class="btn primary" data-act="analyze">${icon("scan")}RFP 분석 화면에서 열기</button>
        <button type="button" class="btn" data-act="calendar">${icon("cal")}캘린더에서 보기</button>
      </div>`;
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
    const out = $("#analyze-result");
    const btn = $("#btn-analyze");
    // 분석은 즉시 끝나지만, 결과가 바뀌었음을 알 수 있도록 짧은 로딩 상태를 보여준다
    out.innerHTML = `<div class="skeleton" aria-hidden="true"><div class="sk"></div><div class="sk s"></div><div class="sk s"></div></div>`;
    btn.disabled = true;
    setStatus("분석 중…");
    setTimeout(() => {
      out.innerHTML = `${r.title ? `<h2 class="result-title">${esc(r.title)}</h2>` : ""}${renderAnalysis(r)}`;
      btn.disabled = false;
      setStatus(msg || `${r.stats.sentences}개 문장을 ${ms}ms 만에 분석했습니다.`);
      if (window.matchMedia("(max-width: 1024px)").matches) out.scrollIntoView({ behavior: "smooth" });
    }, REDUCED_MOTION ? 0 : 380);
  }

  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    $("#analyze-result").innerHTML = PLACEHOLDER;
    $("#btn-analyze").addEventListener("click", () => runAnalyze());
    $("#btn-sample").addEventListener("click", () => {
      $("#rfp-text").value = D.SAMPLE_RFP;
      runAnalyze("가상 샘플 RFP를 분석했습니다.");
    });
    $("#btn-clear").addEventListener("click", () => {
      $("#rfp-text").value = "";
      $("#analyze-result").innerHTML = PLACEHOLDER;
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
        .map((e) => `<button type="button" class="ev ${e.kind}" data-id="${e.n.id}" title="${esc(`${EV_LABEL[e.kind]} · ${e.n.org} ${e.n.title}`)}" aria-label="${esc(`${EV_LABEL[e.kind]} ${e.n.org}`)}"><span>${EV_LABEL[e.kind]} ${esc(e.n.org)}</span></button>`)
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
              <span class="when ${e.kind}">${e.left === 0 ? "오늘" : `D-${e.left}`}</span>
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
  const VIEW_NAME = { notices: "공고 모니터링", analyze: "RFP 분석", calendar: "일정 캘린더", about: "서비스 소개" };
  let currentView = null;

  function applyRoute() {
    const name = (location.hash || "#notices").slice(1);
    const view = VIEWS.includes(name) ? name : "notices";
    for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
    $$("[data-nav]").forEach((a) => (a.dataset.nav === view ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    if (view === "calendar") renderCalendar();
    $("#crumb-current").textContent = VIEW_NAME[view];
    document.title = VIEW_NAME[view] + " · RFP Insight AI";
    if (view !== currentView) window.scrollTo(0, 0);
    currentView = view;
  }

  function route() {
    // 지원하는 브라우저에서는 View Transitions API로 화면을 부드럽게 전환한다
    if (document.startViewTransition && currentView && !REDUCED_MOTION) document.startViewTransition(applyRoute);
    else applyRoute();
  }

  /* ---------- 테마 (라이트 · 시스템 · 다크) ---------- */

  function setTheme(mode, save) {
    if (mode === "light" || mode === "dark") document.documentElement.dataset.theme = mode;
    else delete document.documentElement.dataset.theme;
    $$("[data-theme-set]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.themeSet === mode)));
    if (save) {
      try {
        if (mode === "system") localStorage.removeItem("rfp-theme");
        else localStorage.setItem("rfp-theme", mode);
      } catch (e) {
        /* 저장소를 쓸 수 없으면 이번 방문에만 적용 */
      }
    }
  }

  function bindTheme() {
    setTheme(document.documentElement.dataset.theme || "system", false);
    $(".theme-seg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-theme-set]");
      if (b) setTheme(b.dataset.themeSet, true);
    });
  }

  /* ---------- 커맨드 팔레트 (⌘K / Ctrl+K) ---------- */

  const palette = { items: [], active: 0, lastFocus: null };

  function paletteItems(q) {
    q = q.trim().toLowerCase();
    const menus = VIEWS.map((v) => ({
      group: "메뉴",
      icon: { notices: "radar", analyze: "scan", calendar: "cal", about: "info" }[v],
      label: VIEW_NAME[v],
      sub: "",
      run: () => (location.hash = "#" + v),
    }));
    const actions = [
      { group: "빠른 실행", icon: "spark", label: "샘플 RFP 분석하기", sub: "가상 샘플 RFP로 분석을 체험합니다", run: () => { location.hash = "#analyze"; $("#btn-sample").click(); } },
    ];
    const notices = D.NOTICES.slice()
      .sort((a, b) => a.deadlineAt - b.deadlineAt)
      .map((n) => ({
        group: "공고",
        icon: "scan",
        label: n.org,
        sub: `${n.title} · ${dday(n.deadlineAt).text} · ${n.analysis.decision.verdict}`,
        hay: `${n.org} ${n.title} ${n.type}`,
        run: () => openNotice(n.id),
      }));
    const match = (x) => !q || (x.hay || x.label + " " + x.sub).toLowerCase().includes(q);
    return [...menus, ...actions, ...notices].filter(match);
  }

  function renderPalette() {
    const items = (palette.items = paletteItems($("#cmdk-q").value));
    if (palette.active >= items.length) palette.active = Math.max(0, items.length - 1);
    let group = null;
    $("#cmdk-list").innerHTML = items.length
      ? items
          .map((x, i) => {
            const head = x.group !== group ? `<div class="cmdk-group">${x.group}</div>` : "";
            group = x.group;
            return `${head}<button type="button" class="cmdk-item" role="option" id="cmdk-${i}" data-i="${i}" aria-selected="${i === palette.active}">
              ${icon(x.icon)}<span class="m"><b>${esc(x.label)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</span></button>`;
          })
          .join("")
      : `<div class="cmdk-empty">검색 결과가 없습니다.</div>`;
    $("#cmdk-q").setAttribute("aria-activedescendant", items.length ? `cmdk-${palette.active}` : "");
    const act = $(`#cmdk-${palette.active}`);
    if (act) act.scrollIntoView({ block: "nearest" });
  }

  function openPalette() {
    if (!$("#drawer").hidden) closeNotice();
    palette.lastFocus = document.activeElement;
    palette.active = 0;
    $("#cmdk-q").value = "";
    $("#cmdk").hidden = false;
    $("#cmdk-bg").hidden = false;
    renderPalette();
    $("#cmdk-q").focus();
  }

  function closePalette(restore = true) {
    $("#cmdk").hidden = true;
    $("#cmdk-bg").hidden = true;
    if (restore && palette.lastFocus && palette.lastFocus.focus) palette.lastFocus.focus();
  }

  function runPalette(i) {
    const item = palette.items[i];
    if (!item) return;
    closePalette(false);
    item.run();
  }

  function bindPalette() {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    $("#cmdk-kbd").textContent = isMac ? "⌘K" : "Ctrl K";
    $("#cmdk-open").addEventListener("click", openPalette);
    $("#cmdk-bg").addEventListener("click", () => closePalette());
    $("#cmdk-q").addEventListener("input", () => {
      palette.active = 0;
      renderPalette();
    });
    $("#cmdk-q").addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = palette.items.length;
        if (!n) return;
        palette.active = (palette.active + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
        renderPalette();
      } else if (e.key === "Enter") {
        e.preventDefault();
        runPalette(palette.active);
      }
    });
    $("#cmdk-list").addEventListener("click", (e) => {
      const b = e.target.closest("[data-i]");
      if (b) runPalette(Number(b.dataset.i));
    });
    $("#cmdk-list").addEventListener("mousemove", (e) => {
      const b = e.target.closest("[data-i]");
      if (b && Number(b.dataset.i) !== palette.active) {
        palette.active = Number(b.dataset.i);
        $$(".cmdk-item", $("#cmdk-list")).forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      }
    });
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        $("#cmdk").hidden ? openPalette() : closePalette();
      } else if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $("#cmdk").hidden) {
        e.preventDefault();
        openPalette();
      }
    });
  }

  /* ---------- 시작 ---------- */

  function init() {
    bindAnalyze(); // 역량 키워드 기본값을 먼저 채운다
    analyzeNotices();
    const DOW = ["일", "월", "화", "수", "목", "금", "토"][TODAY.getDay()];
    $("#today-label").textContent = `${A.formatDate(TODAY)} (${DOW}) 기준`;
    $("#sync-label").textContent = `${A.formatDate(TODAY)} · 가상 샘플 데이터`;
    renderKpis();
    renderNotices();
    bindFilters();
    bindCalendar();
    bindTheme();
    bindPalette();
    $("#drawer-bg").addEventListener("click", closeNotice);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("#cmdk").hidden) closePalette();
      else if (!$("#drawer").hidden) closeNotice();
    });
    window.addEventListener("hashchange", route);
    route();
  }

  init();
})();
