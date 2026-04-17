import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: events } = await supabase
    .from("events")
    .select("id, title, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">내 이벤트</h1>
        <Link
          href="/events/new"
          className="bg-foreground text-background text-sm px-4 py-2 rounded-md hover:opacity-90"
        >
          + 새 이벤트
        </Link>
      </div>

      {!events || events.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          아직 이벤트가 없습니다.
          <br />
          <Link href="/events/new" className="underline mt-2 inline-block">
            첫 이벤트 만들기
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}`}
                className="block border rounded-lg px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className="font-medium">{event.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(event.created_at).toLocaleDateString("ko-KR")}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
