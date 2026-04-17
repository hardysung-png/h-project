# h-project: 가족 & 지인 이벤트 관리 웹앱

## 프로젝트 구조

메인 앱: `next.js+supabase+h/` 디렉터리 (Next.js 15 + Supabase)
학습 문서: `docs/` (next-js.md, supabase.md)

## 기술 스택

- **프론트엔드**: Next.js 15 App Router + React 19
- **백엔드**: Supabase (Postgres, Auth)
- **스타일**: Tailwind CSS + shadcn/ui
- **폼**: React Hook Form + Zod (V0.2+)

## V0.1 구현 스코프

하나의 이벤트 + 일정별 응답 + 차등 N빵 정산만. 나머지는 V0.2+.

전체 플랜: `~/.gstack/projects/h-project/seong-yeoncheol-main-design-20260418-021641.md`

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
