# Next.js 15 핵심 요약

> 출처: context7 `/vercel/next.js/v15.1.11` | 갱신일: 2026-04-18  
> 전제: App Router, React 19, TypeScript, Node.js 런타임

---

## 1. 라우팅 기본

`app/` 디렉터리 안의 파일 이름이 곧 라우트 역할을 결정한다.

| 파일 | 역할 |
|------|------|
| `page.tsx` | 해당 URL에서 렌더링되는 UI |
| `layout.tsx` | 공유 레이아웃 (자식 간 상태 유지) |
| `loading.tsx` | Suspense 기반 로딩 UI |
| `error.tsx` | 에러 바운더리 (`"use client"` 필수) |
| `not-found.tsx` | 404 UI |
| `route.ts` | API Route Handler (HTTP 메서드 함수 export) |

```
app/
├── layout.tsx          ← 루트 레이아웃
├── page.tsx            ← /
├── (auth)/             ← 라우트 그룹 (URL에 반영 안 됨)
│   ├── login/page.tsx  ← /login
│   └── layout.tsx
├── dashboard/
│   ├── [id]/page.tsx   ← /dashboard/:id
│   └── page.tsx        ← /dashboard
└── api/
    └── users/route.ts  ← GET /api/users
```

**동적 라우트**: `[slug]` → 단일 세그먼트, `[...slug]` → 하위 전체, `[[...slug]]` → 선택적 캐치올  
**라우트 그룹** `(group)`: URL에 영향 없이 레이아웃·로딩 상태 분리 목적  
**병렬 라우트** `@slot`: 동시에 여러 페이지를 동일 레이아웃에 렌더링 (대시보드 패널 등)

---

## 2. Server Components vs Client Components

**기본값은 Server Component**. `"use client"` 선언이 없으면 서버에서만 실행된다.

```tsx
// Server Component (기본) — DB 직접 접근 가능, 번들 크기 0
export default async function UserList() {
  const users = await db.query('SELECT * FROM users') // 서버에서만 실행
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>
}
```

```tsx
// Client Component — "use client" 필수
'use client'

import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}
```

**핵심 규칙**:
- Server Component는 Client Component를 import 할 수 있지만, 역방향은 불가
- Client Component에서 서버 전용 모듈(`fs`, `crypto`, DB 클라이언트) import 금지 → 빌드 에러
- Client Component에 넘기는 props는 직렬화 가능해야 함 (함수, 클래스 인스턴스 불가)
- Server Component를 Client Component의 `children`으로 합성하면 경계를 유지할 수 있음

> 공식 문서: https://nextjs.org/docs/app/building-your-application/rendering

---

## 3. 비동기 요청 API (Next.js 15 주요 변경)

**Next.js 15부터 `cookies`, `headers`, `params`, `searchParams` 가 모두 비동기(Promise)로 변경.**  
동기 호출은 개발 모드에서 경고, 미래 버전에서 에러가 된다.

```tsx
// ❌ Next.js 14 이전 방식 (동기)
const cookieStore = cookies()
const token = cookieStore.get('token')

// ✅ Next.js 15 방식 (비동기)
const cookieStore = await cookies()
const token = cookieStore.get('token')
```

```tsx
// params / searchParams 도 동일
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q: string }>
}) {
  const { id } = await params
  const { q } = await searchParams
  // ...
}
```

```tsx
// headers 비동기 사용
import { headers } from 'next/headers'

export default async function Page() {
  const headersList = await headers()
  const userAgent = headersList.get('user-agent')
}
```

> 공식 문서: https://nextjs.org/docs/app/building-your-application/upgrading/version-15

---

## 4. 데이터 패칭 & 캐싱

**Next.js 15는 `fetch` 기본값이 `no-store`(캐시 안 함)로 변경됨.** (14 이전은 `force-cache` 기본)

```tsx
// 캐시 없음 (기본, 매 요청마다 새로 fetch)
const data = await fetch('https://api.example.com/data')

// 정적 캐시 (빌드 시 생성, 이후 영구 사용)
const data = await fetch('https://api.example.com/data', {
  cache: 'force-cache',
})

// ISR: N초마다 백그라운드 재생성
const data = await fetch('https://api.example.com/data', {
  next: { revalidate: 60 },
})

// 태그 기반 캐시 (on-demand revalidation)
const data = await fetch('https://api.example.com/data', {
  next: { tags: ['posts'] },
})
```

**캐시 무효화**:

```tsx
import { revalidatePath, revalidateTag } from 'next/cache'

// 특정 경로 캐시 제거
revalidatePath('/posts')

// 특정 태그 캐시 제거 (위 fetch tags와 연계)
revalidateTag('posts')
```

**파일 레벨 캐시 제어**:

```tsx
// page.tsx / layout.tsx 상단에 선언
export const revalidate = 60          // 60초마다 재검증
export const dynamic = 'force-dynamic' // 항상 동적 렌더링
export const dynamic = 'force-static'  // 항상 정적 렌더링
```

**`unstable_cache`** — fetch가 아닌 DB 쿼리 등을 캐시할 때:

```tsx
import { unstable_cache } from 'next/cache'

const getCachedUsers = unstable_cache(
  async () => db.query('SELECT * FROM users'),
  ['users-list'],        // 캐시 키
  { revalidate: 60, tags: ['users'] }
)
```

> 공식 문서: https://nextjs.org/docs/app/building-your-application/caching

---

## 5. Server Actions

폼 제출·데이터 변경을 서버에서 처리하는 함수. `"use server"` 디렉티브로 선언.

```tsx
// app/actions/post.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const schema = z.object({ title: z.string().min(1) })

export async function createPost(prevState: unknown, formData: FormData) {
  const result = schema.safeParse({ title: formData.get('title') })

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors }
  }

  await db.insert(result.data)
  revalidatePath('/posts')
  redirect('/posts')
}
```

```tsx
// Client Component에서 useActionState로 연결 (React 19)
'use client'

import { useActionState } from 'react'
import { createPost } from '@/app/actions/post'

export function PostForm() {
  const [state, action, pending] = useActionState(createPost, undefined)

  return (
    <form action={action}>
      <input name="title" />
      {state?.errors?.title && <p>{state.errors.title}</p>}
      <button disabled={pending}>작성</button>
    </form>
  )
}
```

**주의사항**:
- Server Action은 항상 서버에서 실행되므로 입력값은 Zod 등으로 반드시 검증
- `redirect()`는 try/catch 밖에서 호출해야 함 (내부적으로 예외를 throw)
- `revalidatePath`/`revalidateTag`는 `redirect()` 직전에 호출

> 공식 문서: https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations

---

## 6. Route Handlers

`app/api/.../route.ts` 파일에서 HTTP 메서드를 named export로 정의.

```tsx
// app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const page = searchParams.get('page') ?? '1'

  const posts = await db.getPosts(Number(page))
  return NextResponse.json(posts)
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const body = await request.json()

  // 입력 검증 필수
  const result = schema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 })
  }

  const post = await db.createPost(result.data)
  return NextResponse.json(post, { status: 201 })
}
```

```tsx
// 동적 라우트 세그먼트
// app/api/posts/[id]/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const post = await db.getPost(id)
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(post)
}
```

> 공식 문서: https://nextjs.org/docs/app/building-your-application/routing/route-handlers

---

## 7. Middleware

요청이 완료되기 전에 실행되는 엣지 함수. 인증 게이트·리다이렉트·헤더 조작에 사용.

```tsx
// middleware.ts (프로젝트 루트 또는 src/)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // 인증 확인 예시
  const token = request.cookies.get('auth-token')

  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

// 미들웨어를 적용할 경로 패턴
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/:path*',
    // 정적 파일·이미지 제외
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
```

**주의사항**:
- Edge 런타임에서 실행 → Node.js API(`fs`, `crypto` 등) 사용 불가
- 무거운 로직보다 빠른 토큰 검사·리다이렉트 용도에 적합
- Supabase SSR 사용 시 Middleware에서 세션 리프레시 필수 (→ supabase.md 참고)

> 공식 문서: https://nextjs.org/docs/app/building-your-application/routing/middleware

---

## 8. Metadata & SEO

```tsx
// 정적 메타데이터 (layout.tsx 또는 page.tsx)
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '페이지 제목',
  description: '페이지 설명',
  openGraph: {
    title: 'OG 제목',
    images: ['/og-image.png'],
  },
}
```

```tsx
// 동적 메타데이터
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const post = await getPost(id)

  return {
    title: post.title,
    description: post.summary,
    openGraph: { images: [post.thumbnailUrl] },
  }
}
```

> 공식 문서: https://nextjs.org/docs/app/building-your-application/optimizing/metadata

---

## 9. 이미지 & 폰트 최적화

```tsx
// next/image — 자동 크기 최적화, WebP 변환, lazy loading
import Image from 'next/image'

<Image
  src="/hero.png"
  alt="히어로 이미지"
  width={1200}
  height={630}
  priority  // LCP 이미지에 사용
/>
```

```tsx
// next/font — 자동 self-hosting, layout shift 없음
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={inter.className}>
      <body>{children}</body>
    </html>
  )
}
```

> 공식 문서: https://nextjs.org/docs/app/building-your-application/optimizing/images

---

## 10. 환경 변수

```bash
# .env.local
NEXT_PUBLIC_API_URL=https://api.example.com  # 브라우저에 노출됨
DB_PASSWORD=secret                            # 서버에서만 사용 가능
```

- `NEXT_PUBLIC_` prefix → 클라이언트 번들에 포함, 브라우저에서 접근 가능
- prefix 없음 → 서버 전용, 클라이언트에서 접근 시 `undefined`
- `.env.local`은 `.gitignore`에 반드시 추가

**주의**: `NEXT_PUBLIC_` 변수에 API 시크릿, DB 비밀번호 등 민감 정보 절대 저장 금지

> 공식 문서: https://nextjs.org/docs/app/building-your-application/configuring/environment-variables

---

## 11. 자주 겪는 함정

| 상황 | 문제 | 해결 |
|------|------|------|
| Client Component에서 `import { createClient } from '@/lib/supabase/server'` | 서버 전용 모듈 번들 에러 | `lib/supabase/client.ts` 사용 |
| Server Component에서 `cookies().set(...)` | 런타임 에러 | Route Handler · Server Action · Middleware에서 처리 |
| `fetch` 결과가 업데이트 안 됨 | Next.js 15 이전 코드의 `force-cache` 잔재 | `cache: 'no-store'` 또는 `revalidate` 설정 확인 |
| `useSearchParams()` 빌드 에러 | 정적 렌더링과 동적 값 충돌 | `<Suspense>`로 컴포넌트 래핑 필수 |
| `redirect()` 가 catch에서 동작 안 함 | `redirect`는 내부적으로 예외 throw | try/catch 블록 **밖**에서 호출 |
| Middleware에서 `import 'fs'` | Edge 런타임 미지원 API | Node.js 전용 코드는 Route Handler로 이동 |
