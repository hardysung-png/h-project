"use client";

interface Props {
  url: string;
}

export function CopyInviteLinkButton({ url }: Props) {
  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    alert("초대 링크가 복사됐습니다!\n단톡방에 붙여넣기 하세요.");
  }

  return (
    <button
      onClick={handleCopy}
      className="text-sm border rounded-md px-3 py-1.5 hover:bg-muted/50 transition-colors"
    >
      초대 링크 복사
    </button>
  );
}
