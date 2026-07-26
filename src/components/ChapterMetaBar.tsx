import { useTranslation } from "react-i18next";
import type { ChapterStatsEntry } from "../lib/chapterStats";
import { formatDurationMs, formatStatsDateTime } from "../lib/chapterStats";
import { localeForDates, normalizeAppLanguage } from "../lib/languages";

interface ChapterMetaBarProps {
  stats: ChapterStatsEntry | null;
  liveEditTimeMs: number;
  wordCount: number;
}

export function ChapterMetaBar({ stats, liveEditTimeMs, wordCount }: ChapterMetaBarProps) {
  const { t, i18n } = useTranslation();
  const locale = localeForDates(normalizeAppLanguage(i18n.language));

  if (!stats) return null;

  return (
    <div className="chapter-meta-bar" aria-label={t("chapterMeta.aria")}>
      <span>
        {t("chapterMeta.created")}{" "}
        <time dateTime={stats.createdAt}>{formatStatsDateTime(stats.createdAt, locale)}</time>
      </span>
      <span className="chapter-meta-sep">·</span>
      <span>
        {t("chapterMeta.updated")}{" "}
        <time dateTime={stats.updatedAt}>{formatStatsDateTime(stats.updatedAt, locale)}</time>
      </span>
      <span className="chapter-meta-sep">·</span>
      <span>
        {t("chapterMeta.editTime")} {formatDurationMs(liveEditTimeMs)}
      </span>
      <span className="chapter-meta-sep">·</span>
      <span>{t("chapterMeta.wordCount", { count: wordCount })}</span>
    </div>
  );
}
