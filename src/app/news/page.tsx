import NewsFlash from "@/components/NewsFlash";

export const metadata = { title: "世界杯快讯 | 球译" };

export default function NewsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">⚡ 世界杯快讯</h1>
        <p className="mt-1 text-xs text-faint">
          自动聚合 BBC Sport、ESPN、新浪体育等多源资讯，每6小时更新
        </p>
      </div>
      <NewsFlash limit={40} />
    </main>
  );
}
