# Supabase 핵심 요약 (Next.js App Router)

> 출처: context7 `/supabase/ssr`, `/supabase/supabase` | 갱신일: 2026-04-18  
> 전제: `@supabase/ssr` + `@supabase/supabase-js`, Next.js 15 App Router

---

## 1. 패키지 역할

| 패키지 | 역할 |
|--------|------|
| `@supabase/supabase-js` | DB 쿼리, Auth, Storage, Realtime 등 전체 기능 |
| `@supabase/ssr` | Next.js 등 SSR 환경에서 쿠키 기반 세션 지속 (`createBrowserClient`, `createServerClient` 제공) |

**핵심 개념**: Supabase 세션은 쿠키에 저장된다.  
서버에서 세션을 읽으려면 쿠키 핸들러를 직접 구현해야 하며, `@supabase/ssr`이 그 복잡성을 추상화해준다.

---

## 2. 환경 변수

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...  # 구버전의 ANON_KEY와 동일하게 사용 가능
# service role 키는 NEXT_PUBLIC_ 절대 금지 — 서버 전용
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

- `PUBLISHABLE_KEY`(구 `ANON_KEY`)는 RLS 정책이 적용되는 공개 키
- `SERVICE_ROLE_KEY`는 RLS를 우회하므로 서버 전용 코드에서만 사용

---

## 3. 클라이언트 팩토리 3종

이 리포에서는 `next.js+supabase+h/lib/supabase/` 에 구현되어 있다.

### 3-1. `createBrowserClient` — Client Component

```tsx
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
```

```tsx
// Client Component에서 사용
'use client'
import { createClient } from '@/lib/supabase/client'

export function MyComponent() {
  const supabase = createClient() // 매번 새로 생성 (전역 변수 금지)
  // ...
}
```

### 3-2. `createServerClient` — Server Component / Server Action

```tsx
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies() // Next.js 15: await 필수

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component에서 set 호출 시 무시
            // Middleware가 세션 리프레시를 담당
          }
        },
      },
    }
  )
}
```

**주의**: Fluid compute(Vercel) 환경에서는 함수 외부(전역)에 클라이언트를 캐싱하지 않는다.

### 3-3. `createServerClient` — Middleware (세션 리프레시 전용)

```tsx
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // NextResponse를 먼저 만들고 그 위에 쿠키를 설정해야 함
  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // 요청 쿠키와 응답 쿠키 양쪽에 모두 설정
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 세션 리프레시 — 인가 결정에는 getUser() 사용
  const { data: { user } } = await supabase.auth.getUser()

  // 보호 라우트 리다이렉트
  if (!user && request.nextUrl.pathname.startsWith('/protected')) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  return response // 반드시 response 반환 (쿠키 전달)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

> 이 리포 참고: `next.js+supabase+h/lib/supabase/proxy.ts`, `next.js+supabase+h/proxy.ts`

---

## 4. `getUser()` vs `getSession()` — 보안 핵심

| | `getUser()` | `getSession()` |
|--|------------|----------------|
| 동작 | Auth 서버에 검증 요청 | 쿠키에서 직접 읽음 |
| 신뢰성 | 검증됨 ✅ | 미검증 (위조 가능) ❌ |
| 속도 | 네트워크 왕복 발생 | 즉시 |
| 사용 목적 | **인가 결정** (보호 라우트 접근 허용 여부) | UI 표시 용도만 |

```tsx
// ✅ 서버에서 인가 확인 — getUser() 사용
const { data: { user }, error } = await supabase.auth.getUser()
if (!user) redirect('/login')

// ⚠️ 세션 정보 표시 용도 — getSession()은 검증 안 됨
const { data: { session } } = await supabase.auth.getSession()
console.log(session?.user.email) // 표시용으로만 활용
```

---

## 5. 인증 API

```tsx
// 회원가입
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password',
  options: {
    emailRedirectTo: `${origin}/auth/confirm`, // 이메일 확인 후 리다이렉트
  },
})

// 로그인
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password',
})

// OAuth 로그인 (Google, GitHub 등)
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${origin}/auth/callback`,
  },
})

// 로그아웃
const { error } = await supabase.auth.signOut()

// 비밀번호 리셋 이메일 발송
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${origin}/auth/update-password`,
})

// 비밀번호 변경 (로그인 상태)
const { error } = await supabase.auth.updateUser({ password: newPassword })
```

**이메일 확인 콜백 라우트**:

```tsx
// app/auth/confirm/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'signup' | 'recovery' | null

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return NextResponse.redirect(new URL('/protected', request.url))
  }

  return NextResponse.redirect(new URL('/auth/error', request.url))
}
```

> 이 리포 참고: `next.js+supabase+h/app/auth/`

---

## 6. Database 쿼리

```tsx
const supabase = await createClient()

// SELECT
const { data, error } = await supabase
  .from('posts')
  .select('id, title, created_at')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .range(0, 9) // 페이지네이션

// 단일 행 조회
const { data: post, error } = await supabase
  .from('posts')
  .select('*')
  .eq('id', postId)
  .single() // 없으면 에러, maybeSingle()은 없으면 null

// INSERT
const { data, error } = await supabase
  .from('posts')
  .insert({ title: '제목', content: '내용', user_id: userId })
  .select() // 삽입된 행 반환

// UPDATE
const { error } = await supabase
  .from('posts')
  .update({ title: '새 제목' })
  .eq('id', postId)

// DELETE
const { error } = await supabase
  .from('posts')
  .delete()
  .eq('id', postId)
```

**에러 핸들링 패턴**:

```tsx
const { data, error } = await supabase.from('posts').select('*')

if (error) {
  console.error(error.message, error.code)
  throw new Error('데이터를 불러오지 못했습니다.')
}

// data는 이제 null이 아님이 보장됨
```

> 공식 문서: https://supabase.com/docs/reference/javascript/select

---

## 7. Row Level Security (RLS)

**모든 테이블에 RLS를 활성화하는 것이 기본 원칙.**  
RLS 없이 `PUBLISHABLE_KEY`만 있으면 누구나 테이블 전체에 접근 가능하다.

```sql
-- 테이블 생성 시 RLS 활성화
CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  title text NOT NULL,
  content text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- 본인 데이터만 조회
CREATE POLICY "본인 게시글 조회" ON posts
  FOR SELECT USING (auth.uid() = user_id);

-- 본인 데이터만 삽입
CREATE POLICY "본인 게시글 삽입" ON posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 본인 데이터만 수정
CREATE POLICY "본인 게시글 수정" ON posts
  FOR UPDATE USING (auth.uid() = user_id);

-- 본인 데이터만 삭제
CREATE POLICY "본인 게시글 삭제" ON posts
  FOR DELETE USING (auth.uid() = user_id);
```

**RLS 우회가 필요한 경우** (admin 작업 등):

```tsx
// service role 클라이언트 — 서버 전용, .env.local에만 보관
import { createClient } from '@supabase/supabase-js'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // NEXT_PUBLIC_ 금지
)
```

> 공식 문서: https://supabase.com/docs/guides/database/postgres/row-level-security

---

## 8. TypeScript 타입 생성

Supabase CLI로 DB 스키마에서 타입을 자동 생성한다.

```bash
# 설치
npm install -D supabase

# 프로젝트에서 타입 파일 생성
npx supabase gen types typescript --project-id your-project-ref > types/supabase.ts
```

```tsx
// types/supabase.ts 활용
import type { Database } from '@/types/supabase'

const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

// 이제 supabase.from('posts').select() 결과에 자동 타입 추론
const { data } = await supabase.from('posts').select('*')
// data: Database['public']['Tables']['posts']['Row'][] | null
```

> 공식 문서: https://supabase.com/docs/guides/api/rest/generating-types

---

## 9. Storage / Realtime / Edge Functions 개요

**Storage** — 파일 업로드 (이미지, 문서 등)

```tsx
// 파일 업로드
const { data, error } = await supabase.storage
  .from('avatars')
  .upload(`${userId}/avatar.png`, file, { upsert: true })

// 공개 URL 조회
const { data } = supabase.storage.from('avatars').getPublicUrl(`${userId}/avatar.png`)
```

> 공식 문서: https://supabase.com/docs/guides/storage

**Realtime** — DB 변경사항 실시간 구독

```tsx
const channel = supabase
  .channel('posts-changes')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
    console.log('새 게시글:', payload.new)
  })
  .subscribe()

// 구독 해제
supabase.removeChannel(channel)
```

> 공식 문서: https://supabase.com/docs/guides/realtime

**Edge Functions** — Deno 기반 서버리스 함수

```bash
npx supabase functions new my-function
npx supabase functions deploy my-function
```

> 공식 문서: https://supabase.com/docs/guides/functions

---

## 10. 자주 겪는 함정

| 상황 | 문제 | 해결 |
|------|------|------|
| Server Component에서 `cookieStore.set()` | 에러 발생 (Server Component는 set 불가) | Middleware에서 세션 리프레시 처리 (`setAll` try/catch 무시) |
| 인가 결정에 `getSession()` 사용 | 위조된 쿠키로 우회 가능 | 반드시 `getUser()` 사용 |
| Middleware에서 `NextResponse.next()` 대신 `new NextResponse()` 생성 | 응답 쿠키가 전달 안 됨 | `NextResponse.next({ request })`로 생성 후 동일 객체 반환 |
| `.env.local` 누락 | 클라이언트 에러 (`supabase.co` URL undefined) | `.env.local` 파일 생성 후 dev 서버 재시작 |
| `NEXT_PUBLIC_` prefix 누락 | 브라우저에서 `undefined` | 클라이언트에서 쓰는 변수는 `NEXT_PUBLIC_` 필수 |
| RLS 없이 테이블 생성 | 모든 사용자가 전체 데이터 접근 가능 | 테이블 생성 직후 `ENABLE ROW LEVEL SECURITY` 실행 |
| 전역 변수에 Supabase 클라이언트 저장 | Fluid compute 환경에서 세션 공유 오염 | 매 함수 호출마다 새 클라이언트 생성 |
