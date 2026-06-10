import Link from "next/link";

export default function ComingSoon({
  title,
  desc,
}: {
  title: string;
  desc: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center">
      <p className="font-num text-xs font-semibold tracking-[0.3em] text-faint">COMING SOON</p>
      <h1 className="mt-3 text-2xl font-bold text-ink">{title}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-mut">{desc}</p>
      <Link
        href="/calculator"
        className="mt-8 inline-block rounded-lg bg-neon px-5 py-2.5 text-sm font-semibold text-pitch transition hover:brightness-110"
      >
        先去玩赔率工具 →
      </Link>
    </div>
  );
}
