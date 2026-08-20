// 어두밴처 엔진 알파 1 — 테스트 러너 (node test-run.mjs)
// a) 3턴 자동 플레이  b) 전 분기 정적/동적 검사  c) 단정 실패 시 exit 1

import { readFileSync } from "node:fs";
import {
  getPath,
  setPath,
  checkRequire,
  applyEffects,
  createInitialState,
} from "./engine.mjs";

const scenario = JSON.parse(
  readFileSync(new URL("./scenes.ep1.json", import.meta.url), "utf8"),
);
const nodesById = new Map(scenario.nodes.map((n) => [n.id, n]));

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
  } else {
    failures += 1;
    console.error(`  [FAIL] ${msg}`);
  }
}

// ---------------------------------------------------------------
// 0) 엔진 순수성 스모크: 원본 state 불변 확인
// ---------------------------------------------------------------
console.log("== 0. 엔진 순수성 검사 ==");
{
  const s0 = createInitialState(scenario.start);
  const frozen = JSON.stringify(s0);
  const s1 = applyEffects(s0, [
    { op: "set", path: "flags.x", value: true },
    { op: "add", path: "stats.hp", value: -3 },
    { op: "push", path: "clues", value: "smoke_test" },
    { op: "goto", scene: "mist_market" },
  ]);
  assert(JSON.stringify(s0) === frozen, "applyEffects는 원본 state를 변경하지 않는다");
  assert(s1.stats.hp === 7 && s1.turn === 1 && s1.scene === "mist_market",
    "set/add/push/goto 4종 op가 새 state에 반영된다");
  assert(getPath(s1, "flags.x") === true && s1.clues.includes("smoke_test"),
    "getPath/setPath 경로 접근이 동작한다");
  assert(checkRequire(s1, null) === true &&
    checkRequire(s1, { path: "stats.hp", gte: 7 }) === true &&
    checkRequire(s1, { path: "stats.hp", gte: 8 }) === false &&
    checkRequire(s1, { path: "flags.x", is: true }) === true &&
    checkRequire(s1, { path: "clues", has: "smoke_test" }) === true,
    "checkRequire: null/gte/is/has 전부 스펙대로 판정한다");
  const s2 = setPath(s0, "trust.merchant", 2);
  assert(s0.trust.merchant === undefined && s2.trust.merchant === 2,
    "setPath는 원본을 두고 새 객체를 반환한다");
}

// ---------------------------------------------------------------
// a) 3턴 자동 플레이 — 매 턴 require를 충족하는 첫 선택지 선택
// ---------------------------------------------------------------
console.log("\n== a. 3턴 자동 플레이 ==");
{
  let state = createInitialState(scenario.start);
  console.log(`  [turn ${state.turn}] scene=${state.scene} (시작)`);
  for (let i = 0; i < 3; i++) {
    const node = nodesById.get(state.scene);
    assert(node !== undefined, `현재 씬 '${state.scene}'이 시나리오에 정의되어 있다`);
    if (!node) break;
    if (node.choices.length === 0) {
      console.log(`  [turn ${state.turn}] scene=${state.scene} — 엔딩 도달, 플레이 종료`);
      break;
    }
    const choice = node.choices.find((c) => checkRequire(state, c.require));
    assert(choice !== undefined, `씬 '${node.id}'에 require 충족 선택지가 존재한다`);
    if (!choice) break;
    const prevScene = state.scene;
    state = applyEffects(state, choice.effects);
    console.log(
      `  [turn ${state.turn}] ${prevScene} --(${choice.id})--> ${state.scene}` +
      ` | hp=${state.stats.hp} clues=[${state.clues.join(",")}]` +
      ` flags=${JSON.stringify(state.flags)} trust=${JSON.stringify(state.trust)}`,
    );
  }
  assert(state.turn === 3 || nodesById.get(state.scene)?.choices.length === 0,
    "3턴 자동 플레이가 중단 없이 완주된다");
  console.log(`  최종 state: ${JSON.stringify(state)}`);
}

// ---------------------------------------------------------------
// b-1) 정적 검사: 미정의 goto 0건
// ---------------------------------------------------------------
console.log("\n== b-1. 미정의 goto 검사 ==");
{
  const bad = [];
  for (const node of scenario.nodes) {
    for (const choice of node.choices) {
      for (const ef of choice.effects) {
        if (ef.op === "goto" && !nodesById.has(ef.scene)) {
          bad.push(`${node.id}/${choice.id} -> ${ef.scene}`);
        }
      }
    }
  }
  assert(bad.length === 0, `미정의 goto 0건 (발견: ${bad.length}${bad.length ? " — " + bad.join(", ") : ""})`);
}

// ---------------------------------------------------------------
// b-2) 정적 검사: 도달 불가 씬 0건 (start부터 goto 그래프 BFS)
// ---------------------------------------------------------------
console.log("\n== b-2. 도달 불가 씬 검사 ==");
{
  const reachable = new Set([scenario.start]);
  const queue = [scenario.start];
  while (queue.length) {
    const node = nodesById.get(queue.shift());
    if (!node) continue;
    for (const choice of node.choices) {
      for (const ef of choice.effects) {
        if (ef.op === "goto" && !reachable.has(ef.scene)) {
          reachable.add(ef.scene);
          queue.push(ef.scene);
        }
      }
    }
  }
  const unreachable = scenario.nodes.map((n) => n.id).filter((id) => !reachable.has(id));
  assert(unreachable.length === 0,
    `도달 불가 씬 0건 (발견: ${unreachable.length}${unreachable.length ? " — " + unreachable.join(", ") : ""})`);
}

// ---------------------------------------------------------------
// b-3) 동적 검사: require/effects를 실제 적용한 상태 공간 탐색으로
//      엔딩(beat=ending, choices 없음) 도달 경로 ≥ 1
// ---------------------------------------------------------------
console.log("\n== b-3. 엔딩 도달 경로 검사 ==");
{
  const MAX_DEPTH = 20;
  const endingPaths = [];
  const walk = (state, path, depth) => {
    if (depth > MAX_DEPTH) return;
    const node = nodesById.get(state.scene);
    if (!node) return;
    if (node.beat === "ending" && node.choices.length === 0) {
      endingPaths.push([...path, state.scene]);
      return;
    }
    for (const choice of node.choices) {
      if (!checkRequire(state, choice.require)) continue;
      walk(applyEffects(state, choice.effects), [...path, `${state.scene}(${choice.id})`], depth + 1);
    }
  };
  walk(createInitialState(scenario.start), [], 0);
  assert(endingPaths.length >= 1, `엔딩 도달 경로 ≥ 1 (발견: ${endingPaths.length}개)`);
  for (const p of endingPaths) console.log(`    경로: ${p.join(" -> ")}`);
}

// ---------------------------------------------------------------
// 결과
// ---------------------------------------------------------------
console.log(`\n== 결과: ${failures === 0 ? "ALL PASS" : `${failures}건 실패`} ==`);
process.exit(failures === 0 ? 0 : 1);
