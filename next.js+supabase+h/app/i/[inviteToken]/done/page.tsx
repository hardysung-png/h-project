import Link from "next/link";

type Props = { params: Promise<{ inviteToken: string }> };

export default async function InviteDonePage({ params }: Props) {
  const { inviteToken } = await params;

  return (
    <div className="max-w-sm mx-auto px-4 py-16 text-center">
      <p className="text-4xl mb-4">🎉</p>
      <h1 className="text-xl font-semibold mb-2">응답이 제출됐습니다!</h1>
      <p className="text-sm text-muted-foreground mb-6">
        응답을 바꾸고 싶다면 같은 이름으로 다시 제출하세요.
      </p>
      <Link
        href={`/i/${inviteToken}`}
        className="text-sm underline text-muted-foreground"
      >
        응답 수정하기
      </Link>
    </div>
  );
}
