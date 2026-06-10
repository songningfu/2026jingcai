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
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-neutral-500">{desc}</p>
      <Link
        href="/calculator"
        className="mt-8 inline-block rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-800"
      >
        先去玩概率工具 →
      </Link>
    </div>
  );
}
