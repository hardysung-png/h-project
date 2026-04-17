# Design Doc: 가족 & 지인 이벤트 관리 웹앱

**버전**: V0.1  
**날짜**: 2026-04-18  
**상태**: APPROVED  
**작성자**: seong-yeoncheol  

---

## 1. 배경 및 목적

### 문제

가족/지인 소규모 모임(생일, 팔순잔치, 가족여행 등)을 카카오톡 단톡방으로만 관리할 때 세 가지 지점이 반복해서 아프다.

| 문제 | 현재 방식의 한계 |
|------|----------------|
| 여러 일정 분리 응답 | 사전준비·본행사·뒷풀이처럼 하위 일정이 있을 때 누가 어느 일정에 오는지 단톡방에서 헷갈림 |
| 참석 집계 | 누가 오고 안 오는지 한눈에 안 보임. 매번 위로 스크롤하며 수동으로 세야 함 |
| 차등 N빵 정산 | 어른/아이 차등, 호스트 제외, 특정인 제외 등 한국 가족 모임의 현실적 규칙을 매번 손으로 계산 |

### 목적

위 세 문제를 해결하는 웹앱을 만든다. 동시에 Next.js 15 + Supabase 실전 학습의 결과물로 본인이 실제로 쓰는 도구를 완성한다(vibe coding).

### 차별화 포인트

차등 N빵 + 일정별 참석의 조합은 한국적 맥락에서 고유하다. Doodle, 구글폼, Lu.ma 어느 것도 "어른 1인분, 아이 0.5인분, 호스트 제외" 계산을 기본으로 제공하지 않는다.

---

## 2. 확정된 제약 사항

- **기술 스택**: Next.js 15 App Router + React 19 + Supabase (Postgres, Auth). 변경 불가 — 학습 목적
- **언어**: 한국어 전용 (i18n 불필요)
- **규모**: 이벤트당 15~50명, 이벤트 수 수십 개 수준, 동시 접속 수십 명 이내
- **V0.1 완성 기준**: 가상 "2026년 9월 가족모임 (15명, 일정 2개)" 시나리오 통과

---

## 3. V0.1 스코프 (확정)

### 포함 (V0.1)

- 이벤트 생성 (제목 + 복수 세부 일정)
- 고유 초대 링크(URL) 생성 및 복사
- 참석자 닉네임 + 어른/아이 선택 + 일정별 참석 응답 (가입 불필요)
- 호스트 대시보드: 일정별 참석 집계 테이블
- 비용 항목 입력 + 차등 N빵 정산 (어른 1인분, 아이 0.5인분, 특정인 제외)

### 제외 (V0.2+)

| 기능 | 미루는 이유 |
|------|------------|
| 초대장 테마 디자인 (생일/팔순 등) | 핵심 가치와 무관, 디자인 공수 큼 |
| 카카오 알림톡 / 이메일 / 앱푸시 | 외부 API 연동 공수 큼. URL 복사로 충분 |
| 부호스트 권한 | 단일 호스트로 V0.1 충분 |
| 지인 목록 + 함께한 모임 로그 | 이벤트가 쌓여야 의미 있는 기능 |
| 사전/사후 정산 분리 | 단일 정산으로 V0.1 충분 |
| 일정별 정산 | 이벤트 전체 단일 정산으로 먼저 검증 |
| 반복 이벤트, 갤러리, 후기 | V2+ |
| 다국어 지원 | V3+ |

---

## 4. 아키텍처

### 기술 스택

```
Frontend:  Next.js 15 (App Router) + React 19
Styling:   Tailwind CSS + shadcn/ui
Backend:   Supabase (Postgres + Auth + Storage)
Actions:   Next.js Server Actions (no separate API routes)
Deploy:    Vercel (GitHub auto-deploy)
```

### 라우팅 구조

```
/                        호스트 대시보드 (로그인 필요)
/events/new              이벤트 생성 폼 (로그인 필요)
/events/[eventId]        이벤트 상세: 참석 집계 + 정산 (로그인 필요)
/i/[inviteToken]         참석자 초대 페이지 (로그인 불필요)
/i/[inviteToken]/done    응답 완료 페이지
/auth/login              로그인
/auth/sign-up            회원가입
```

### 데이터 모델

```sql
-- 이벤트 (최상위 단위)
events
  id            uuid PK default gen_random_uuid()
  host_id       uuid FK → auth.users
  title         text NOT NULL
  invite_token  text UNIQUE default encode(gen_random_bytes(16), 'hex')
  created_at    timestamptz default now()

-- 세부 일정 (이벤트 안에 여러 개)
schedules
  id          uuid PK
  event_id    uuid FK → events ON DELETE CASCADE
  title       text NOT NULL  -- 예: "점심 모임", "차담회"
  starts_at   timestamptz nullable
  sort_order  int NOT NULL default 0

-- 참석자 (닉네임만, 가입 불필요)
attendees
  id                          uuid PK
  event_id                    uuid FK → events
  nickname                    text NOT NULL
  is_adult                    boolean default true
  is_excluded_from_settlement boolean default false
  created_at                  timestamptz

-- 일정별 참석 응답
attendance_responses
  id          uuid PK
  attendee_id uuid FK → attendees
  schedule_id uuid FK → schedules
  attending   boolean NOT NULL
  UNIQUE(attendee_id, schedule_id)

-- 비용 항목
cost_items
  id          uuid PK
  event_id    uuid FK → events
  name        text NOT NULL  -- 예: "식비", "케이크"
  amount      int NOT NULL CHECK (amount >= 0)  -- 원 단위
  child_ratio real NOT NULL default 0.5  -- 아이 1인분 비율
```

### RLS (Row Level Security) 정책

| 테이블 | 정책 | 조건 |
|--------|------|------|
| events | host CRUD | `host_id = auth.uid()` |
| events | anon SELECT | 모두 허용 (초대 링크 조회용) |
| schedules | host CRUD | 이벤트 소유자 |
| schedules | anon SELECT | 모두 허용 (초대 페이지 렌더링용) |
| cost_items | host CRUD | 이벤트 소유자 |
| attendees | host SELECT | 이벤트 소유자 |
| attendees | anon INSERT/UPDATE/SELECT | 모두 허용 (닉네임 응답용) |
| attendance_responses | host SELECT | 이벤트 소유자 |
| attendance_responses | anon INSERT/UPDATE | 모두 허용 |

> **V0.1 보안 참고:** attendees/attendance_responses의 anon 정책은 V0.1 범위 내에서 의도된 것. V0.2에서 참석자별 개인 토큰(signed invite token per person)으로 강화 예정.

---

## 5. 차등 N빵 계산 알고리즘

`lib/settlement.ts`에 순수 함수로 구현. 사이드 이펙트 없음, 유닛 테스트 가능.

```
totalAmount = sum(cost_items.amount)

weight(attendee) =
  0               if is_excluded_from_settlement
  1               if is_adult
  child_ratio     otherwise  (기본 0.5)

totalWeight = sum(weight(a) for all attendees)
perUnit     = totalAmount / totalWeight

share(attendee) = round(weight(attendee) * perUnit)

-- 반올림 오차는 마지막 포함 참석자에게 보정
```

**예시 (검증 케이스):**
- 총액: 230,000원 (식비 150,000 + 장소비 50,000 + 케이크 30,000)
- 참석자: 엄마(어른), 아들(어른), 막내조카(아이), 호스트(제외)
- 가중치: 1 + 1 + 0.5 + 0 = 2.5인분
- 1인분: 230,000 / 2.5 = 92,000원
- 막내조카: 92,000 × 0.5 = 46,000원

---

## 6. 핵심 UX 흐름

### 호스트 흐름
1. 회원가입/로그인 → 호스트 대시보드
2. "+ 새 이벤트" → 제목 + 일정 최대 3개 입력 → 저장
3. 이벤트 상세에서 "초대 링크 복사" → 가족 카톡방에 붙여넣기
4. 비용 항목 입력 → 차등 N빵 결과 확인
5. 참석자 중 정산 제외할 사람 "제외" 토글

### 참석자 흐름
1. 카톡방에서 링크 클릭 → 초대 페이지 (로그인 불필요)
2. 닉네임 입력 + 어른/아이 선택
3. 각 일정별 참석/불참 라디오 선택
4. "응답 제출" → 완료 페이지
5. 수정하려면 같은 링크에서 같은 닉네임으로 재제출 (덮어쓰기)

---

## 7. 파일 구조 (구현됨)

```
next.js+supabase+h/
├── supabase/
│   └── migrations/
│       └── 0001_init.sql          ← DB 스키마 + RLS
├── lib/
│   ├── settlement.ts              ← 차등 N빵 순수 함수
│   └── supabase/
│       ├── client.ts
│       ├── server.ts
│       └── proxy.ts               ← /i/ 비로그인 허용 수정
├── app/
│   ├── page.tsx                   ← 호스트 대시보드
│   ├── actions/
│   │   ├── events.ts              ← 이벤트/비용 Server Actions
│   │   └── attendance.ts         ← 참석 응답 Server Action
│   ├── events/
│   │   ├── new/page.tsx           ← 이벤트 생성
│   │   └── [eventId]/page.tsx    ← 이벤트 상세 (집계 + 정산)
│   └── i/
│       └── [inviteToken]/
│           ├── page.tsx           ← 참석자 초대 페이지
│           └── done/page.tsx     ← 응답 완료
└── components/
    └── CopyInviteLinkButton.tsx   ← 초대 링크 복사 버튼 (클라이언트)
```

---

## 8. 환경 변수

`.env.local`에 필요한 값:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000   # 배포 시 실제 URL로 교체
```

---

## 9. 배포

| 단계 | 방법 |
|------|------|
| 로컬 개발 | `npm run dev` (Next.js dev server) |
| DB 마이그레이션 | Supabase Dashboard → SQL Editor → `0001_init.sql` 실행 |
| 배포 | Vercel → GitHub 연결 → main push시 자동 배포 |
| 환경 변수 | Vercel Dashboard → Environment Variables |

---

## 10. V0.1 완성 기준 (검증 시나리오)

"2026년 9월 가족모임" 시나리오에서 다음이 모두 통과되면 V0.1 완료:

- [ ] 호스트 회원가입/로그인
- [ ] 이벤트 "9월 가족모임" + 일정 2개(점심 모임, 차담회) 생성
- [ ] 초대 링크 복사 동작
- [ ] 참석자 4명이 각각 다른 조합으로 응답:
  - 엄마(어른) — 점심O, 차담O
  - 아들(어른) — 점심O, 차담X
  - 막내조카(아이) — 점심O, 차담O
  - 삼촌(어른) — 점심X, 차담O
- [ ] 호스트 대시보드에서 "점심 3/4, 차담 3/4" 표시
- [ ] 비용 입력: 식비 150,000 + 장소비 50,000 + 케이크 30,000 = 총 230,000원
- [ ] 호스트 정산 제외 설정
- [ ] 차등 N빵: 3명 어른 + 1명 아이(0.5인분) = 3.5인분 → 올바른 금액 표시
- [ ] Vercel 배포 후 동일 시나리오 통과

---

## 11. 미해결 질문 (V0.2 결정 필요)

1. **참석자 응답 수정 보안**: 현재 "닉네임 동일 = 덮어쓰기" 방식. 악의적 덮어쓰기 가능 → V0.2에서 참석자별 signed token 도입 검토
2. **호스트 정산 제외 기본값**: UI에서 호스트를 기본값 "제외"로 설정할지 여부
3. **일정별 정산**: 일정마다 다른 참석자가 있을 때 비용도 일정별로 나눌지 (V0.2)
4. **Supabase Realtime**: 참석 응답 실시간 반영 (현재는 F5 새로고침)

---

## 12. V0.2 백로그

- 참석자별 개인 signed token (보안 강화)
- Supabase Realtime (참석 현황 실시간 반영)
- 일정별 정산
- 초대장 테마 디자인 (생일/팔순/가족모임/일반)
- 이메일 초대 (Resend)
- 카카오 알림톡
- 부호스트 권한 시스템
- 지인 목록 + 함께한 모임 로그
- 갤러리/사진/후기
