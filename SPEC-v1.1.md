# 어두밴처 엔진 스펙 v1.1

v1(알파 1단계 최초 스펙) 대비 **확정 변경점**만 기록한다. 여기 없는 항목은 v1 그대로다.

## 변경점 요약

| # | 항목 | v1 | v1.1 (확정) |
|---|------|----|-------------|
| 1 | `state.version` | 미확정(구현상 문자열 `"alpha-1"`) | 숫자 `1` |
| 2 | `history` 항목 형태 | 미확정("history push"만 명시) | 객체형 `{ turn, from, to }` |
| 3 | `goto` 대상 키 | 미확정 | `"scene"` — `{ "op": "goto", "scene": "<scene_id>" }` |
| 4 | 시나리오 컨테이너 | 미확정(노드 배열만 명시) | `{ episode, start, nodes: [] }` |
| 5 | `beat` / `tag` | `beat` = 단계 태그 문자열 | `beat` = 실제 장면 서술(한국어 2~3문장, must_mention 자연 포함), 기존 단계 태그는 `tag` 필드로 이동·보존 |

## 상세

### 1. `state.version` = 숫자 `1`
초기 상태의 `version`은 숫자 `1`이다. 알파 1 구현에서 임시로 쓰던 문자열 `"alpha-1"`을 원복했다.
`test-run.mjs`가 `state.version === 1`을 단정으로 검사한다.

### 2. `history`는 객체형
`goto` 실행 시 `history`에 다음 객체를 push한다.

```json
{ "turn": 2, "from": "mist_market", "to": "fog_pier" }
```

- `turn`: 전환이 **완료된 후**의 턴 번호 (goto가 turn을 +1한 값)
- `from`: 전환 직전 씬 id
- `to`: 전환 후 씬 id

### 3. `goto`의 대상 키는 `"scene"`

```json
{ "op": "goto", "scene": "fog_pier" }
```

`goto`는 (a) `state.scene`을 대상으로 교체, (b) `turn` +1, (c) `history` push(위 2번 형태)를 한 번에 수행한다.

### 4. 시나리오 파일 컨테이너

```json
{
  "episode": "ep1",
  "start": "harbor_entrance",
  "nodes": [ ...노드 배열... ]
}
```

- `episode`: 에피소드 id (영문)
- `start`: 시작 씬 id — 초기 상태 생성 시 `state.scene`으로 사용
- `nodes`: 노드 배열 (노드 구조는 v1과 동일: `id`, `beat`, `must_mention`, `choices`)

### 5. `beat`와 `tag`의 이원화
- `beat`: 플레이어에게 그대로 보여줄 **실제 장면 서술**. 한국어 2~3문장, 해당 노드의 `must_mention` 항목을 서술 안에 자연스럽게 포함한다.
- `tag`: v1에서 `beat`가 담당하던 **구조 태그**(`intro` / `branch_*` / `converge` / `ending`)를 보존하는 필드. 엔딩 판정 등 구조 검사는 `tag`로 한다.

## 불변 사항 (v1 유지)
- `GameState` 골격: `{ version, scene, turn, stats:{hp}, trust:{}, clues:[], flags:{}, history:[] }`
- effects op는 `set` / `add` / `push` / `goto` 4종만
- `require`: `{ path, gte }` | `{ path, is }` | `{ path, has }` | `null`
- scene/clue/flag id는 전부 영문
- `checkRequire` · `applyEffects`는 순수 함수 — 원본 state 불변, 외부 의존성 0
