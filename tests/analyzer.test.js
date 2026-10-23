// 실행: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const { analyze, formatWon, _internal } = require("../assets/analyzer.js");

const TODAY = new Date(2026, 9, 23); // 2026-10-23

const RFP = `사업명: 디지털 채널 통합 고도화 사업
사업 예산: 금 2,350,000,000원 (부가가치세 포함)
사업 기간: 계약일로부터 6개월
제안 설명회: 2026.10.26 14:00
제안서 제출 마감: 2026.11.01 17:00까지
1. 사업 범위
- 모바일 앱 채널 통합 플랫폼 구축
- 고객 인증 체계 고도화
2. 입찰 참가 자격
소프트웨어사업자로 등록된 업체여야 합니다.
최근 3년 이내 금융기관 대상 단일 사업 15억원 이상 구축 실적이 있어야 합니다.
공동수급은 허용하지 않습니다.
3. 평가 방법
협상에 의한 계약으로 기술평가 80점, 가격평가 20점으로 평가합니다.
4. 계약 조건
지체상금률은 계약금액의 2/1,000을 적용하며 상한은 두지 않습니다.
사업 수행 중 과업 범위 내 요구사항 변경은 추가 비용 없이 수행하여야 합니다.
무상 하자보수 기간은 검수 완료 후 24개월로 합니다.`;

test("금액 단위를 원으로 환산한다", () => {
  assert.equal(_internal.toWon("2,350,000,000", "원"), 2350000000);
  assert.equal(_internal.toWon("18", "억원"), 1800000000);
  assert.equal(_internal.toWon("500", "백만원"), 500000000);
  assert.equal(formatWon(2350000000), "23.5억원");
});

test("예산·기간·일정·배점을 추출한다", () => {
  const r = analyze(RFP, { today: TODAY });
  assert.equal(r.title, "디지털 채널 통합 고도화 사업");
  assert.equal(r.budget.won, 2350000000);
  assert.equal(r.period.months, 6);
  const deadline = r.dates.find((d) => d.kind === "deadline");
  assert.equal(deadline.dateLabel, "2026.11.01");
  assert.ok(r.dates.find((d) => d.kind === "briefing"));
  assert.equal(r.evaluation.tech, 80);
  assert.equal(r.evaluation.price, 20);
  assert.equal(r.evaluation.method, "협상에 의한 계약");
  assert.equal(r.scope.length, 2);
  assert.equal(r.qualifications.length, 3);
  assert.ok(!r.qualifications.some((q) => q.includes("인증 체계")), "과업 문장은 자격 요건에서 제외");
});

test("계약 조건 리스크를 검증한다", () => {
  const r = analyze(RFP, { today: TODAY });
  const ids = r.risks.map((x) => x.id);
  for (const id of ["deadline-soon", "liquidated-damages", "scope-change", "consortium", "free-maintenance", "track-record", "tight-schedule"]) {
    assert.ok(ids.includes(id), `${id} 리스크가 잡혀야 함`);
  }
  assert.equal(r.risks.find((x) => x.id === "liquidated-damages").level, "high");
  assert.equal(r.risks[0].level, "high", "high 리스크가 먼저 정렬됨");
});

test("리스크가 많으면 No-Go 판단", () => {
  const r = analyze(RFP, { today: TODAY });
  assert.equal(r.decision.verdict, "No-Go");
});

test("조건이 무난한 RFP는 Go 판단", () => {
  const clean = `사업명: 모바일 앱 UI 개선
사업 예산: 금 5억원
사업 기간: 계약일로부터 8개월
제안서 제출 마감: 2026.11.30 17:00까지
기술평가 90점, 가격평가 10점`;
  const r = analyze(clean, { today: TODAY, capabilities: ["모바일", "UI"] });
  assert.equal(r.risks.filter((x) => x.level === "high").length, 0);
  assert.equal(r.decision.verdict, "Go");
  assert.deepEqual(r.capability.matched, ["모바일", "UI"]);
});

test("빈 입력에도 오류 없이 동작한다", () => {
  const r = analyze("", { today: TODAY });
  assert.equal(r.budget, null);
  assert.deepEqual(r.risks, []);
  assert.equal(r.coverage.found, 0);
});
