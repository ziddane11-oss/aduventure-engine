// 어두밴처 엔진 알파 1 — 순수 함수 코어 (외부 의존성 0)
//
// GameState: { version, scene, turn, stats:{hp}, trust:{}, clues:[], flags:{}, history:[] }
// effects op 4종: set / add / push / goto
// require: { path, gte } | { path, is } | { path, has } | null

/** 점(.) 경로로 중첩 값을 읽는다. 없으면 undefined. */
export function getPath(obj, path) {
  if (obj == null || typeof path !== "string" || path === "") return undefined;
  let cur = obj;
  for (const key of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return cur;
}

/** 점(.) 경로에 값을 쓴 새 객체를 반환한다. 원본은 불변. */
export function setPath(obj, path, value) {
  if (typeof path !== "string" || path === "") {
    throw new Error(`setPath: invalid path: ${String(path)}`);
  }
  const keys = path.split(".");
  const root = obj == null || typeof obj !== "object" ? {} : obj;

  const rec = (node, idx) => {
    const key = keys[idx];
    const base =
      node != null && typeof node === "object" && !Array.isArray(node)
        ? { ...node }
        : Array.isArray(node)
          ? node.slice()
          : {};
    if (idx === keys.length - 1) {
      base[key] = value;
    } else {
      base[key] = rec(
        node != null && typeof node === "object" ? node[key] : undefined,
        idx + 1,
      );
    }
    return base;
  };

  return rec(root, 0);
}

/** require 조건 검사. null/undefined면 항상 통과. 순수 함수. */
export function checkRequire(state, require) {
  if (require == null) return true;
  const val = getPath(state, require.path);

  if ("gte" in require) {
    return typeof val === "number" && val >= require.gte;
  }
  if ("is" in require) {
    return val === require.is;
  }
  if ("has" in require) {
    return Array.isArray(val) && val.includes(require.has);
  }
  throw new Error(`checkRequire: unknown require shape: ${JSON.stringify(require)}`);
}

/**
 * effects 배열을 순서대로 적용한 새 GameState를 반환한다. 원본 state 불변.
 * - set  { op:"set",  path, value }        : path에 value 대입
 * - add  { op:"add",  path, value }        : 숫자 가산 (미정의 path는 0으로 간주)
 * - push { op:"push", path, value }        : 배열에 value 추가 (미정의 path는 []로 간주)
 * - goto { op:"goto", scene }              : scene 전환, turn+1, history push
 */
export function applyEffects(state, effects) {
  let next = state;
  if (!Array.isArray(effects)) return next;

  for (const ef of effects) {
    switch (ef.op) {
      case "set": {
        next = setPath(next, ef.path, ef.value);
        break;
      }
      case "add": {
        const cur = getPath(next, ef.path);
        const base = typeof cur === "number" ? cur : 0;
        if (typeof ef.value !== "number") {
          throw new Error(`applyEffects: add value must be a number: ${JSON.stringify(ef)}`);
        }
        next = setPath(next, ef.path, base + ef.value);
        break;
      }
      case "push": {
        const cur = getPath(next, ef.path);
        const arr = Array.isArray(cur) ? cur.slice() : [];
        arr.push(ef.value);
        next = setPath(next, ef.path, arr);
        break;
      }
      case "goto": {
        const history = Array.isArray(next.history) ? next.history.slice() : [];
        const turn = (typeof next.turn === "number" ? next.turn : 0) + 1;
        history.push({ turn, from: next.scene, to: ef.scene });
        next = { ...next, scene: ef.scene, turn, history };
        break;
      }
      default:
        throw new Error(`applyEffects: unknown op: ${JSON.stringify(ef)}`);
    }
  }
  return next;
}

/** 초기 GameState 생성. */
export function createInitialState(startScene) {
  return {
    version: "alpha-1",
    scene: startScene,
    turn: 0,
    stats: { hp: 10 },
    trust: {},
    clues: [],
    flags: {},
    history: [],
  };
}
