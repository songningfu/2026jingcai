import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminRoot({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>;
}) {
  const { secret } = await searchParams;
  if (!secret || secret !== process.env.CRON_SECRET) redirect("/");
  redirect(`/admin/dashboard?secret=${secret}`);
}
