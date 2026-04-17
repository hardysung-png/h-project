import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createEvent } from "@/app/actions/events";

export default async function NewEventPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold mb-6">새 이벤트 만들기</h1>
      <form action={createEvent} className="flex flex-col gap-5">
        <div>
          <label className="block text-sm font-medium mb-1">이벤트 이름</label>
          <input
            name="title"
            required
            placeholder="예: 아버지 팔순잔치"
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">세부 일정</label>
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-2">
                <input
                  name={`schedule_${i}_title`}
                  placeholder={
                    i === 0
                      ? "일정 1 (예: 점심 모임)"
                      : i === 1
                        ? "일정 2 (예: 차담회)"
                        : "일정 3 (선택)"
                  }
                  className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
                <input
                  name={`schedule_${i}_starts_at`}
                  type="datetime-local"
                  className="border rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>
            ))}
          </div>
          <input type="hidden" name="scheduleCount" value="3" />
        </div>

        <button
          type="submit"
          className="bg-foreground text-background py-2 rounded-md text-sm font-medium hover:opacity-90"
        >
          이벤트 만들기
        </button>
      </form>
    </div>
  );
}
