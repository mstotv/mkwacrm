"use client"

import { Clock } from 'lucide-react'
import { DOW_SHORT_MON_FIRST } from '@/lib/dashboard/date-utils'
import type { ResponseTimeSummary } from '@/lib/dashboard/types'
import { BarChart } from '@/components/tremor/bar-chart'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'
import { useLanguage } from '@/hooks/use-language'

interface ResponseTimeChartProps {
  data: ResponseTimeSummary | null
  loading: boolean
  /** Minutes. Surfaced as a "target" pill in the header. The
   *  hand-rolled SVG version drew this as a horizontal dashed
   *  line on the chart; Tremor BarChart doesn't expose Recharts
   *  primitives, so we promote it to the header for now. A
   *  follow-up can introduce an overlay or extend the vendored
   *  BarChart with a `referenceLines` prop. */
  thresholdMinutes?: number
}

// Single category, single colour — the data is "average minutes
// per weekday". Tremor expects categories as the second tuple in
// the row object, so we shape the buckets into
// `{ day: 'Mon', 'Avg minutes': 4.2 }` rows below.
const CATEGORY = 'Avg minutes'

export function ResponseTimeChart({
  data,
  loading,
  thresholdMinutes = 5,
}: ResponseTimeChartProps) {
  const { language } = useLanguage()
  const hasData = data?.buckets.some((b) => b.avgMinutes != null) ?? false

  const weekdays = language === 'ar'
    ? ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']
    : DOW_SHORT_MON_FIRST;

  // Map buckets → Tremor rows. Null `avgMinutes` (no samples)
  // collapses to 0; the chart will render an empty slot for it.
  // We attach `samples` on the row so a future customTooltip can
  // surface "no samples" copy without losing the data shape.
  const chartData =
    data?.buckets.map((b, i) => ({
      day: weekdays[i],
      [CATEGORY]: b.avgMinutes ?? 0,
      samples: b.samples,
    })) ?? []

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>
      <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div>
          <h2 className={`text-sm font-semibold text-slate-900 dark:text-white ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'متوسط وقت الاستجابة الأولية' : 'Average First Response Time'}
          </h2>
          <p className={`mt-0.5 text-xs text-slate-500 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {language === 'ar'
              ? 'عدد الدقائق المستغرقة للرد على أول رسالة غير مجابة للعميل حسب يوم الأسبوع.'
              : 'Minutes to reply to a customer\'s first unreplied message, by weekday'}
          </p>
        </div>
        <div className={`flex items-center gap-3 ${language === 'ar' ? 'text-left' : 'text-right'} text-xs`}>
          {thresholdMinutes > 0 && (
            <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-medium text-rose-300 tabular-nums">
              {language === 'ar' ? `المستهدف ${thresholdMinutes} د` : `target ${thresholdMinutes}m`}
            </span>
          )}
          {data && (data.thisWeekAvg != null || data.lastWeekAvg != null) && (
            <div className={language === 'ar' ? 'text-right' : 'text-left'}>
              <div className="text-slate-400">
                {language === 'ar' ? 'هذا الأسبوع: ' : 'This week: '}{' '}
                <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                  {fmt(data.thisWeekAvg, language)}
                </span>
              </div>
              <div className="text-slate-500">
                {language === 'ar' ? 'الأسبوع الماضي: ' : 'Last week: '}{' '}
                <span className="tabular-nums">{fmt(data.lastWeekAvg, language)}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="p-5">
        {loading || !data ? (
          <Skeleton className="h-[260px] w-full" />
        ) : !hasData ? (
          <EmptyState
            icon={Clock}
            title={language === 'ar' ? 'لم يتم تسجيل أي ردود بعد' : 'No replies recorded yet'}
            hint={language === 'ar' ? 'سيتم ملء هذا المخطط بمجرد الرد على رسائل العملاء.' : 'This chart fills in as you reply to customer messages.'}
          />
        ) : (
          <BarChart
            data={chartData}
            index="day"
            categories={[CATEGORY]}
            // 'violet' maps to Tailwind's `fill-violet-500` — matches
            // the brand accent the hand-rolled bars used (#7c3aed).
            colors={['violet']}
            valueFormatter={(value) => `${value.toFixed(1)}${language === 'ar' ? ' د' : 'm'}`}
            showLegend={false}
            yAxisWidth={48}
            // Compact height so the chart sits well inside the card
            // without dominating the row alongside the donut + activity feed.
            className="h-[260px]"
          />
        )}
      </div>
    </section>
  )
}

function fmt(mins: number | null, language: string): string {
  if (mins == null) return '—'
  if (mins < 1) return `${Math.max(1, Math.round(mins * 60))}${language === 'ar' ? ' ثانية' : 's'}`
  if (mins < 60) return `${mins.toFixed(1)}${language === 'ar' ? ' د' : 'm'}`
  return `${(mins / 60).toFixed(1)}${language === 'ar' ? ' س' : 'h'}`
}

