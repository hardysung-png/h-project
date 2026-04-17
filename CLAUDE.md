# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 프로젝트 개요

가족/지인 소규모 모임을 관리하는 웹앱. 핵심 가치: 일정별 참석 응답 + 참석 현황 집계 + 어른/아이 차등 N빵 정산.

- **앱 디렉터리**: `next.js+supabase+h/` (Next.js 15 App Router + Supabase)
- **학습 문서**: `docs/` (next-js.md, supabase.md)
- **기획 문서**: `prd.md`, `design-doc.md`, `Roadmap.md`

---

## 개발 명령어

앱 디렉터리 기준(`cd "next.js+supabase+h/"`):

```bash
npm run dev      # 개발 서버 (localhost:3000)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint 검사
```

환경변수(`.env.local` 필요):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

---

## 아키텍처

### 라우팅 구조

| 경로 | 역할 | 인증 |
|------|------|------|
| `/` | 호스트 대시보드 (이벤트 목록) | 필수 |
| `/events/new` | 이벤트 + 일정 생성 | 필수 |
| `/events/[eventId]` | 이벤트 상세: 참석 집계 + 비용 입력 + 차등 N빵 정산 | 필수 |
| `/i/[inviteToken]` | 참석자 응답 페이지 (비로그인) | 불필요 |
| `/i/[inviteToken]/done` | 응답 완료 페이지 | 불필요 |
| `/auth/*` | 로그인·회원가입·비밀번호 관리 | — |

미들웨어(`middleware.ts`)가 `/i/` 경로를 제외한 모든 페이지에 인증 가드를 적용한다.

### 데이터 흐름

```
호스트 (인증)
  → /events/new         → createEvent() Server Action
  → /events/[eventId]   → upsertCostItem(), updateAttendeeExclusion()

참석자 (비인증, invite_token으로 접근)
  → /i/[inviteToken]    → submitAttendance() Server Action
```

### 데이터베이스 (Supabase Postgres)

5개 테이블: `events` → `schedules` → `attendees` → `attendance_responses`, `cost_items`

- `events`: 호스트 ID + `invite_token` (고유 초대 토큰)
- `schedules`: 이벤트에 속하는 세부 일정 (최대 3개)
- `attendees`: 닉네임 + 어른/아이 + 정산 제외 여부
- `attendance_responses`: 참석자 × 일정 참석 여부
- `cost_items`: 비용 항목 + 아이 할인율 (기본 0.5)

RLS 정책: 호스트는 CRUD 전체, 비로그인 참석자는 `invite_token` 매칭으로 읽기/쓰기만 허용.

### 핵심 로직

**`lib/settlement.ts`** — `calculateSettlement()`: 어른 1.0 / 아이 0.5 가중치 기반 차등 N빵 계산. 정산 제외자는 가중치 0. 반올림 오차는 마지막 참석자에게 보정.

**`lib/supabase/`** — `server.ts`(Server Component용), `client.ts`(Client Component용), `proxy.ts`(미들웨어 세션 관리) 세 클라이언트를 역할에 따라 구분해서 사용한다.

**Server Actions** (`app/actions/`) — 폼 제출과 데이터 변경은 모두 Server Action으로 처리. `revalidatePath()`로 캐시 무효화.

---

## V0.1 구현 스코프

단일 이벤트 + 일정별 참석 응답 + 차등 N빵 정산만. React Hook Form + Zod 도입은 V0.2+.

---

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.

| 요청 유형 | 스킬 |
|-----------|------|
| 아이디어, 만들 가치 있나 | `/office-hours` |
| 버그, 에러, 500 | `/investigate` |
| 배포, PR 생성 | `/ship` |
| QA, 사이트 테스트 | `/qa` |
| 코드 리뷰 | `/review` |
| 배포 후 문서 업데이트 | `/document-release` |
| 주간 회고 | `/retro` |
| 디자인 시스템, 브랜드 | `/design-consultation` |
| 시각적 검토, 디자인 polish | `/design-review` |
| 아키텍처 리뷰 | `/plan-eng-review` |
| 진행 상태 저장/복원 | `/checkpoint` |
| 코드 품질 점검 | `/health` |
