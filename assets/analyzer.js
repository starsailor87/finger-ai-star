/**
 * RFP Insight AI — RFP 분석 엔진 (규칙 기반 MVP)
 *
 * 제안요청서(RFP) 텍스트에서 참여 판단에 필요한 항목을 뽑고,
 * 계약·일정·자격 조건의 리스크를 규칙으로 검증한 뒤 참고용 판단 지표를 계산한다.
 * LLM 연동 전 단계의 엔진으로, 브라우저와 Node 양쪽에서 동작한다.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RFPAnalyzer = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAY = 24 * 60 * 60 * 1000;

  /* ---------- 기본 유틸 ---------- */

  function normalize(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/[ ]{2,}/g, " ")
      .trim();
  }

  function lines(text) {
    return normalize(text)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  /** 문장 단위 분리 (줄바꿈 + 마침표 기준) */
  function sentences(text) {
    const out = [];
    for (const line of lines(text)) {
      for (const s of line.split(/(?<=[.。])\s+/)) {
        if (s.trim()) out.push(s.trim());
      }
    }
    return out;
  }

  /** 금액 문자열 → 원 단위 숫자 */
  function toWon(numStr, unit) {
    const n = parseFloat(String(numStr).replace(/,/g, ""));
    if (!isFinite(n)) return null;
    switch ((unit || "").replace(/\s/g, "")) {
      case "억원":
      case "억":
        return Math.round(n * 1e8);
      case "백만원":
        return Math.round(n * 1e6);
      case "천원":
        return Math.round(n * 1e3);
      case "만원":
        return Math.round(n * 1e4);
      default:
        return Math.round(n);
    }
  }

  function formatWon(won) {
    if (won == null) return "-";
    if (won >= 1e8) {
      const eok = won / 1e8;
      return (Number.isInteger(eok) ? eok : eok.toFixed(1)) + "억원";
    }
    if (won >= 1e4) return Math.round(won / 1e4).toLocaleString("ko-KR") + "만원";
    return won.toLocaleString("ko-KR") + "원";
  }

  function toDate(y, m, d) {
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return isNaN(dt.getTime()) ? null : dt;
  }

  function formatDate(dt) {
    if (!dt) return "-";
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}.${m}.${d}`;
  }

  function daysBetween(from, to) {
    const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b - a) / DAY);
  }

  function clip(s, max = 90) {
    s = String(s).trim();
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  /* ---------- 항목 추출 ---------- */

  const MONEY_RE = /([\d,]+(?:\.\d+)?)\s*(억\s*원|억|백만\s*원|천\s*원|만\s*원|원)/g;
  const BUDGET_KEYS = /(사업\s*예산|추정\s*가격|추정\s*금액|기초\s*금액|사업\s*금액|배정\s*예산|소요\s*예산|예산)/;

  /** 사업 예산: 예산 키워드가 있는 문장의 금액 중 최댓값 */
  function extractBudget(text) {
    let best = null;
    for (const s of sentences(text)) {
      if (!BUDGET_KEYS.test(s)) continue;
      MONEY_RE.lastIndex = 0;
      let m;
      while ((m = MONEY_RE.exec(s))) {
        const won = toWon(m[1], m[2]);
        if (won && won >= 1e6 && (!best || won > best.won)) {
          best = { won, label: formatWon(won), evidence: clip(s) };
        }
      }
    }
    return best;
  }

  const DATE_RE = /(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/g;
  const DATE_KINDS = [
    { kind: "deadline", label: "제안서 제출 마감", re: /(제안서|입찰서)?\s*(제출|접수)\s*(마감|기한|일시|기간)|마감/ },
    { kind: "briefing", label: "제안 설명회", re: /설명회/ },
    { kind: "presentation", label: "제안 발표", re: /발표\s*(평가|일)|제안\s*발표/ },
    { kind: "opening", label: "개찰", re: /개찰/ },
    { kind: "posted", label: "공고일", re: /공고\s*(일|일자|게시)/ },
  ];

  /** 주요 일정: 날짜가 들어간 문장을 일정 종류로 분류 */
  function extractDates(text) {
    const found = [];
    const seen = new Set();
    for (const s of sentences(text)) {
      DATE_RE.lastIndex = 0;
      const m = DATE_RE.exec(s);
      if (!m) continue;
      const date = toDate(m[1], m[2], m[3]);
      if (!date) continue;
      const kind = DATE_KINDS.find((k) => k.re.test(s));
      if (!kind || seen.has(kind.kind)) continue;
      seen.add(kind.kind);
      found.push({ kind: kind.kind, label: kind.label, date, dateLabel: formatDate(date), evidence: clip(s) });
    }
    return found;
  }

  /** 사업 기간(개월) */
  function extractPeriod(text) {
    for (const s of sentences(text)) {
      if (!/(사업|계약|수행)\s*기간|착수일|계약일/.test(s)) continue;
      const m = s.match(/(\d{1,2})\s*개월/);
      if (m) return { months: Number(m[1]), label: `${m[1]}개월`, evidence: clip(s) };
      const y = s.match(/(\d)\s*년(?!\s*\d)/);
      if (y && !/20\d{2}\s*년/.test(y[0])) return { months: Number(y[1]) * 12, label: `${y[1]}년`, evidence: clip(s) };
    }
    return null;
  }

  /** 평가 배점: 기술 / 가격 */
  function extractEvaluation(text) {
    const t = normalize(text);
    const tech = t.match(/기술\s*(?:능력\s*)?(?:평가|점수)?\s*[:：]?\s*(\d{2})\s*(?:점|%)/);
    const price = t.match(/가격\s*(?:평가|점수)?\s*[:：]?\s*(\d{1,2})\s*(?:점|%)/);
    if (!tech && !price) return null;
    const techN = tech ? Number(tech[1]) : null;
    const priceN = price ? Number(price[1]) : null;
    const method = /협상에\s*의한\s*계약/.test(t) ? "협상에 의한 계약" : /적격\s*심사/.test(t) ? "적격심사" : /최저가/.test(t) ? "최저가" : null;
    return {
      tech: techN,
      price: priceN,
      method,
      label: [techN != null ? `기술 ${techN}` : null, priceN != null ? `가격 ${priceN}` : null].filter(Boolean).join(" : "),
    };
  }

  // '인증 체계 고도화' 같은 과업 문장이 섞이지 않도록 자격 표현만 좁게 잡는다
  const QUAL_RE = /(참가\s*자격|자격\s*요건|소프트웨어\s*사업자|직접\s*생산|중소기업자|실적이\s*있어야|ISMS|ISO\s*\d+|(GS|CC)\s*인증|인증을?\s*(보유|획득)|면허를?\s*보유|등록된\s*업체|공동\s*수급)/;

  /** 참가 자격 요건 */
  function extractQualifications(text) {
    return sentences(text)
      .filter((s) => QUAL_RE.test(s) && s.length > 8)
      .slice(0, 6)
      .map((s) => clip(s, 110));
  }

  const SCOPE_RE = /(구축|개발|고도화|전환|재구축|통합|도입|개선|유지\s*관리|운영)/;

  /** 사업 범위: '사업 범위/과업' 구간 우선, 없으면 범위 키워드 문장 */
  function extractScope(text) {
    const ls = lines(text);
    const start = ls.findIndex((l) => /(사업\s*범위|과업\s*(내용|범위)|주요\s*과업|사업\s*내용)/.test(l));
    let pool = [];
    if (start >= 0) {
      for (let i = start + 1; i < ls.length && pool.length < 6; i++) {
        if (/^(\d+[.)]|[ⅠⅡⅢⅣⅤ]|#{1,3}\s)/.test(ls[i]) && !/^[-•·○▪]/.test(ls[i]) && pool.length) break;
        pool.push(ls[i]);
      }
    }
    if (!pool.length) pool = sentences(text).filter((s) => SCOPE_RE.test(s));
    return pool
      .map((s) => s.replace(/^[-•·○▪\d.)\s]+/, ""))
      .filter((s) => s.length > 4)
      .slice(0, 5)
      .map((s) => clip(s, 100));
  }

  function extractTitle(text) {
    const ls = lines(text);
    const named = ls.find((l) => /(사업\s*명|사업명)\s*[:：]/.test(l));
    if (named) return clip(named.split(/[:：]/).slice(1).join(":").trim(), 80);
    const first = ls.find((l) => /(사업|구축|고도화|용역)/.test(l) && l.length < 80);
    return first ? clip(first.replace(/^#+\s*/, ""), 80) : null;
  }

  /* ---------- 리스크 검증 규칙 ---------- */

  const LEVEL_WEIGHT = { high: 12, medium: 5, low: 1 };

  /**
   * 각 규칙은 (문장 배열, 추출 결과, 기준일)을 받아
   * 위반 시 { level, detail, evidence } 를 돌려준다.
   */
  const RULES = [
    {
      id: "deadline-soon",
      title: "제안 마감 임박",
      check(ss, ex, today) {
        const d = ex.dates.find((x) => x.kind === "deadline");
        if (!d) return null;
        const left = daysBetween(today, d.date);
        if (left < 0) return { level: "high", detail: `제출 마감이 ${-left}일 지났습니다.`, evidence: d.evidence };
        if (left <= 7) return { level: "high", detail: `제출 마감까지 ${left}일 남았습니다. 제안 준비 기간이 매우 짧습니다.`, evidence: d.evidence };
        if (left <= 14) return { level: "medium", detail: `제출 마감까지 ${left}일 남았습니다.`, evidence: d.evidence };
        return null;
      },
    },
    {
      id: "liquidated-damages",
      title: "지체상금률",
      check(ss) {
        const s = ss.find((x) => /지체\s*상금/.test(x));
        if (!s) return null;
        const m = s.match(/(\d+(?:\.\d+)?)\s*\/\s*1,?000/);
        if (m && Number(m[1]) > 1.25) return { level: "high", detail: `지체상금률 ${m[1]}/1,000은 일반적인 용역 기준보다 높습니다.`, evidence: clip(s) };
        if (/상한\s*(없|미적용|두지)/.test(s)) return { level: "high", detail: "지체상금 상한이 없습니다.", evidence: clip(s) };
        return { level: "low", detail: "지체상금 조항이 있습니다. 요율과 상한을 확인하세요.", evidence: clip(s) };
      },
    },
    {
      id: "scope-change",
      title: "추가 비용 없는 과업 변경",
      check(ss) {
        const s = ss.find((x) => /(과업|요구\s*사항)[^.]{0,30}(변경|추가)[^.]{0,40}(추가\s*비용\s*(없이|을\s*청구할\s*수\s*없|미지급)|무상|계약\s*금액\s*조정\s*(없|불가))/.test(x));
        return s ? { level: "high", detail: "과업 변경·추가를 계약금액 조정 없이 수용하도록 되어 있습니다.", evidence: clip(s) } : null;
      },
    },
    {
      id: "consortium",
      title: "공동수급 제한",
      check(ss) {
        const s = ss.find((x) => /공동\s*수급[^.]{0,20}(불가|불허|허용하지|제한)/.test(x));
        return s ? { level: "medium", detail: "공동수급이 허용되지 않아 단독 수행 역량이 필요합니다.", evidence: clip(s) } : null;
      },
    },
    {
      id: "subcontract",
      title: "하도급 제한",
      check(ss) {
        const s = ss.find((x) => /하도급[^.]{0,20}(불가|금지|제한|승인)/.test(x));
        return s ? { level: "medium", detail: "하도급이 제한되어 협력사 활용 계획을 검토해야 합니다.", evidence: clip(s) } : null;
      },
    },
    {
      id: "free-maintenance",
      title: "무상 유지보수·하자보수 기간",
      check(ss) {
        const s = ss.find((x) => /(무상\s*(유지\s*보수|하자\s*보수)|하자\s*보수\s*기간)/.test(x));
        if (!s) return null;
        const m = s.match(/(\d+)\s*(개월|년)/);
        const months = m ? (m[2] === "년" ? Number(m[1]) * 12 : Number(m[1])) : null;
        if (months != null && months > 12) return { level: "medium", detail: `무상 보수 기간이 ${months}개월로 일반적인 12개월보다 깁니다.`, evidence: clip(s) };
        return null;
      },
    },
    {
      id: "ip-ownership",
      title: "산출물·소스코드 권리 귀속",
      check(ss) {
        const s = ss.find((x) => /(지식\s*재산권|소유권|저작권|소스\s*코드)[^.]{0,40}(발주\s*기관|발주처|기관에)[^.]{0,10}(귀속|소유)/.test(x));
        return s ? { level: "medium", detail: "산출물 권리가 발주기관에 귀속됩니다. 자사 솔루션 재사용 범위를 확인하세요.", evidence: clip(s) } : null;
      },
    },
    {
      id: "onsite",
      title: "인력 상주 요구",
      check(ss) {
        const s = ss.find((x) => /상주/.test(x) && /(인력|투입|근무|PM)/.test(x));
        return s ? { level: "low", detail: "발주기관 상주 근무가 요구됩니다. 투입 인력 원가를 반영하세요.", evidence: clip(s) } : null;
      },
    },
    {
      id: "track-record",
      title: "수행 실적 요건",
      check(ss) {
        const s = ss.find((x) => /(최근|과거)\s*\d+\s*년[^.]{0,40}실적/.test(x) || /단일\s*(사업|계약)[^.]{0,30}실적/.test(x));
        return s ? { level: "medium", detail: "특정 기간·규모의 수행 실적이 필요합니다. 자사 실적 충족 여부를 확인하세요.", evidence: clip(s) } : null;
      },
    },
    {
      id: "tight-schedule",
      title: "사업 기간 대비 규모",
      check(ss, ex) {
        if (!ex.period || !ex.budget) return null;
        const perMonth = ex.budget.won / ex.period.months;
        if (ex.period.months <= 6 && perMonth >= 2e8)
          return { level: "high", detail: `${ex.period.label} 동안 ${ex.budget.label} 규모로 일정이 빠듯합니다.`, evidence: ex.period.evidence };
        return null;
      },
    },
    {
      id: "price-weight",
      title: "가격 평가 비중",
      check(ss, ex) {
        if (!ex.evaluation || ex.evaluation.price == null) return null;
        if (ex.evaluation.price >= 30) return { level: "medium", detail: `가격 배점이 ${ex.evaluation.price}점으로 높아 가격 경쟁이 예상됩니다.`, evidence: ex.evaluation.label };
        return null;
      },
    },
    {
      id: "security",
      title: "보안 요구사항",
      check(ss) {
        const s = ss.find((x) => /(망\s*분리|보안\s*서약|보안\s*점검|개인\s*정보\s*영향\s*평가|취약점\s*점검)/.test(x));
        return s ? { level: "low", detail: "보안 요구사항이 있습니다. 보안 점검 일정과 비용을 반영하세요.", evidence: clip(s) } : null;
      },
    },
  ];

  /* ---------- 역량 매칭 ---------- */

  function matchCapabilities(text, keywords) {
    const t = normalize(text).toLowerCase();
    const list = (keywords || []).map((k) => String(k).trim()).filter(Boolean);
    const matched = list.filter((k) => t.includes(k.toLowerCase()));
    return { keywords: list, matched, missing: list.filter((k) => !matched.includes(k)) };
  }

  /* ---------- 판단 지표 ---------- */

  function decide(risks, capability) {
    let score = 80;
    for (const r of risks) score -= LEVEL_WEIGHT[r.level] || 0;
    if (capability && capability.keywords.length) {
      const ratio = capability.matched.length / capability.keywords.length;
      score += Math.round((ratio - 0.3) * 20);
    }
    score = Math.max(0, Math.min(100, score));
    const high = risks.filter((r) => r.level === "high").length;
    let verdict = "Go";
    if (score < 50 || high >= 3) verdict = "No-Go";
    else if (score < 70 || high >= 1) verdict = "검토 필요";
    return { score, verdict };
  }

  /* ---------- 진입점 ---------- */

  /**
   * @param {string} text RFP 본문
   * @param {{ today?: Date, capabilities?: string[] }} [opts]
   */
  function analyze(text, opts = {}) {
    const today = opts.today instanceof Date ? opts.today : new Date();
    const clean = normalize(text);
    const ss = sentences(clean);

    const extracted = {
      title: extractTitle(clean),
      budget: extractBudget(clean),
      period: extractPeriod(clean),
      dates: extractDates(clean),
      evaluation: extractEvaluation(clean),
      qualifications: extractQualifications(clean),
      scope: extractScope(clean),
    };

    const risks = [];
    for (const rule of RULES) {
      const hit = rule.check(ss, extracted, today);
      if (hit) risks.push({ id: rule.id, title: rule.title, ...hit });
    }
    const order = { high: 0, medium: 1, low: 2 };
    risks.sort((a, b) => order[a.level] - order[b.level]);

    const capability = matchCapabilities(clean, opts.capabilities);
    const decision = decide(risks, capability);

    const covered = ["budget", "period", "evaluation"].filter((k) => extracted[k]).length +
      (extracted.dates.length ? 1 : 0) + (extracted.qualifications.length ? 1 : 0) + (extracted.scope.length ? 1 : 0);

    return {
      ...extracted,
      risks,
      capability,
      decision,
      coverage: { found: covered, total: 6 },
      stats: { characters: clean.length, sentences: ss.length },
    };
  }

  return { analyze, formatWon, formatDate, daysBetween, RULES, _internal: { extractBudget, extractDates, extractPeriod, extractEvaluation, toWon } };
});
