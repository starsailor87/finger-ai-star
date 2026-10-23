/**
 * RFP Insight AI — 데모용 가상 샘플 데이터
 *
 * 아래 공고와 RFP 본문은 화면 동작을 보여주기 위해 만든 가상 데이터이며,
 * 실제 나라장터 공고가 아닙니다. 날짜는 오늘을 기준으로 상대 계산해
 * 언제 열어도 데모 일정이 현재 시점에 맞게 보이도록 했습니다.
 */
(function (root) {
  "use strict";

  const DAY = 24 * 60 * 60 * 1000;
  const base = new Date();
  base.setHours(0, 0, 0, 0);

  function at(offsetDays) {
    return new Date(base.getTime() + offsetDays * DAY);
  }
  function ymd(dt) {
    return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, "0")}.${String(dt.getDate()).padStart(2, "0")}`;
  }

  /** 공고별 RFP 요약 본문을 만든다 (분석 엔진 입력용) */
  function rfp(o) {
    const parts = [
      `사업명: ${o.title}`,
      `발주기관: ${o.org}`,
      `사업 예산: 금 ${o.budgetEok}억원 (부가가치세 포함)`,
      `사업 기간: 계약일로부터 ${o.months}개월`,
      `공고일: ${ymd(at(o.posted))}`,
    ];
    if (o.briefing != null) parts.push(`제안 설명회: ${ymd(at(o.briefing))} 14:00, 발주기관 본점 회의실`);
    parts.push(`제안서 제출 마감: ${ymd(at(o.deadline))} 17:00까지`);
    parts.push("1. 사업 범위");
    for (const s of o.scope) parts.push(`- ${s}`);
    parts.push("2. 입찰 참가 자격");
    parts.push("소프트웨어사업자로 등록된 업체여야 합니다.");
    for (const q of o.quals || []) parts.push(q);
    parts.push("3. 평가 방법");
    parts.push(`협상에 의한 계약으로 기술평가 ${o.tech}점, 가격평가 ${100 - o.tech}점으로 평가합니다.`);
    parts.push("4. 계약 조건");
    for (const c of o.terms || []) parts.push(c);
    return parts.join("\n");
  }

  const NOTICES = [
    {
      id: "N-101", org: "한국은행", group: "public", type: "신규",
      title: "전자금융 채널 통합 인증체계 고도화",
      budgetEok: 18, months: 8, posted: 0, briefing: 5, deadline: 16, tech: 90,
      scope: ["모바일·인터넷 채널 통합 인증 플랫폼 고도화", "간편인증 및 생체인증 연계 개발", "인증 이력 통합 모니터링 구축"],
      quals: ["최근 3년 이내 금융기관 인증 시스템 구축 실적이 있어야 합니다."],
      terms: ["지체상금률은 계약금액의 1/1,000을 적용합니다.", "보안서약서를 제출하고 망분리 환경에서 개발합니다."],
    },
    {
      id: "N-102", org: "예금보험공사", group: "public", type: "재공고",
      title: "대국민 서비스 모바일 앱 재구축",
      budgetEok: 9.5, months: 6, posted: -1, briefing: null, deadline: 6, tech: 80,
      scope: ["대국민 모바일 앱 UI/UX 전면 재구축", "웹 접근성 인증 대응", "앱 성능 모니터링 도입"],
      quals: ["공동수급은 허용하지 않습니다."],
      terms: ["과업 범위 내 요구사항 변경은 추가 비용 없이 수행합니다.", "무상 하자보수 기간은 24개월로 합니다."],
    },
    {
      id: "N-103", org: "신용보증기금", group: "public", type: "신규",
      title: "보증 심사 업무 AI 문서 분석 시스템 구축",
      budgetEok: 24, months: 10, posted: 0, briefing: 7, deadline: 21, tech: 90,
      scope: ["보증 심사 서류 OCR 및 AI 문서 분석 구축", "심사 지원 대시보드 개발", "내부 업무 시스템 연계"],
      quals: ["GS인증을 보유한 솔루션을 제안해야 합니다."],
      terms: ["산출물 및 소스코드의 지식재산권은 발주기관에 귀속됩니다.", "투입 인력은 발주기관에 상주하여 근무합니다."],
    },
    {
      id: "N-104", org: "기술보증기금", group: "public", type: "정정",
      title: "기술평가 시스템 클라우드 전환 (정정공고)",
      budgetEok: 31, months: 12, posted: -3, briefing: 2, deadline: 11, tech: 80,
      scope: ["기술평가 시스템 클라우드 전환", "데이터 이관 및 검증", "전환 후 안정화 지원"],
      quals: ["최근 5년 이내 단일 사업 20억원 이상 클라우드 전환 실적이 있어야 합니다."],
      terms: ["하도급은 발주기관의 사전 승인을 받아야 합니다.", "지체상금률은 계약금액의 1.5/1,000을 적용합니다."],
    },
    {
      id: "N-105", org: "한국주택금융공사", group: "public", type: "신규",
      title: "주택연금 비대면 상담 채널 구축",
      budgetEok: 7.2, months: 7, posted: -2, briefing: null, deadline: 13, tech: 90,
      scope: ["비대면 상담 예약 및 화상상담 기능 구축", "모바일 웹 고객 상담 화면 개발"],
      quals: [],
      terms: ["개인정보 영향평가 결과를 반영합니다."],
    },
    {
      id: "N-106", org: "IBK기업은행", group: "public", type: "신규",
      title: "기업 고객 디지털 채널 UI/UX 개선",
      budgetEok: 14, months: 9, posted: 0, briefing: 4, deadline: 18, tech: 90,
      scope: ["기업뱅킹 모바일 앱 UI/UX 개선", "디자인 시스템 수립", "사용성 테스트 및 개선안 적용"],
      quals: ["최근 3년 이내 금융권 UI/UX 개선 실적이 있어야 합니다."],
      terms: ["지체상금률은 계약금액의 1/1,000을 적용합니다."],
    },
    {
      id: "N-107", org: "한국산업은행", group: "public", type: "재공고",
      title: "차세대 여신 시스템 컨설팅 (재공고)",
      budgetEok: 4.8, months: 4, posted: -4, briefing: null, deadline: 3, tech: 70,
      scope: ["차세대 여신 시스템 구축 방향 컨설팅", "이행 계획 수립"],
      quals: [],
      terms: ["과업 추가 시 계약금액 조정 없이 수행합니다."],
    },
    {
      id: "N-108", org: "한국은행", group: "public", type: "신규",
      title: "내부 업무포털 노후 장비 교체 및 유지관리",
      budgetEok: 3.1, months: 12, posted: -6, briefing: null, deadline: 2, tech: 60,
      scope: ["내부 업무포털 서버 장비 교체", "연간 유지관리"],
      quals: ["직접생산확인증명서를 보유해야 합니다."],
      terms: [],
    },
    {
      id: "N-201", org: "KB국민은행", group: "bank", type: "신규",
      title: "기업뱅킹 모바일 앱 고도화",
      budgetEok: 22, months: 8, posted: 0, briefing: 6, deadline: 20, tech: 90,
      scope: ["기업뱅킹 모바일 앱 기능 고도화", "모바일 앱 장애 모니터링 연계"],
      quals: [],
      terms: ["보안서약서를 제출합니다."],
    },
    {
      id: "N-202", org: "신한은행", group: "bank", type: "신규",
      title: "마이데이터 서비스 화면 개선",
      budgetEok: 6, months: 5, posted: -1, briefing: null, deadline: 9, tech: 80,
      scope: ["마이데이터 서비스 화면 개선", "사용성 개선"],
      quals: [],
      terms: [],
    },
    {
      id: "N-203", org: "우리은행", group: "bank", type: "정정",
      title: "오픈뱅킹 연계 플랫폼 개선 (정정)",
      budgetEok: 11, months: 6, posted: -2, briefing: 1, deadline: 14, tech: 80,
      scope: ["오픈뱅킹 연계 플랫폼 개선", "연계 모니터링 구축"],
      quals: [],
      terms: ["하도급은 금지합니다."],
    },
    {
      id: "N-204", org: "하나은행", group: "bank", type: "신규",
      title: "고객 상담 챗봇 생성형 AI 전환",
      budgetEok: 16, months: 7, posted: 0, briefing: 8, deadline: 24, tech: 90,
      scope: ["고객 상담 챗봇 생성형 AI 전환", "상담 이력 분석 대시보드"],
      quals: [],
      terms: ["산출물의 지식재산권은 발주기관에 귀속됩니다."],
    },
  ];

  for (const n of NOTICES) {
    n.postedAt = at(n.posted);
    n.deadlineAt = at(n.deadline);
    n.briefingAt = n.briefing != null ? at(n.briefing) : null;
    n.budgetWon = Math.round(n.budgetEok * 1e8);
    n.rfpText = rfp(n);
  }

  const SAMPLE_RFP = [
    "○○금융공사 디지털 채널 통합 고도화 사업 제안요청서 (가상 샘플)",
    "사업명: 디지털 채널 통합 고도화 사업",
    "발주기관: ○○금융공사",
    `사업 예산: 금 2,350,000,000원 (부가가치세 포함)`,
    "사업 기간: 계약일로부터 6개월",
    `공고일: ${ymd(at(0))}`,
    `제안 설명회: ${ymd(at(3))} 14:00, 본사 대회의실`,
    `제안서 제출 마감: ${ymd(at(9))} 17:00까지`,
    "",
    "1. 사업 범위",
    "- 인터넷뱅킹·모바일 앱 채널 통합 플랫폼 구축",
    "- 고객 인증 체계 고도화 및 간편인증 연계",
    "- 모바일 앱 성능·장애 모니터링 도입",
    "- 운영 데이터 대시보드 개발",
    "",
    "2. 입찰 참가 자격",
    "소프트웨어사업자로 등록된 업체여야 합니다.",
    "최근 3년 이내 금융기관 대상 단일 사업 15억원 이상 모바일 채널 구축 실적이 있어야 합니다.",
    "공동수급은 허용하지 않습니다.",
    "",
    "3. 평가 방법",
    "협상에 의한 계약으로 기술평가 80점, 가격평가 20점으로 평가합니다.",
    "",
    "4. 계약 조건",
    "지체상금률은 계약금액의 2/1,000을 적용하며 상한은 두지 않습니다.",
    "사업 수행 중 과업 범위 내 요구사항 변경은 추가 비용 없이 수행하여야 합니다.",
    "무상 하자보수 기간은 검수 완료 후 24개월로 합니다.",
    "산출물 및 소스코드의 지식재산권은 발주기관에 귀속됩니다.",
    "PM 및 핵심 인력은 발주기관에 상주하여 근무합니다.",
  ].join("\n");

  const DEFAULT_CAPABILITIES = ["모바일", "인증", "UI/UX", "모니터링", "오픈뱅킹", "마이데이터"];

  root.RFPData = { NOTICES, SAMPLE_RFP, DEFAULT_CAPABILITIES, today: base };
})(typeof self !== "undefined" ? self : this);
