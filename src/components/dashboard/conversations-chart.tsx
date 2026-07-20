"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import type { ConversationsSeriesPoint } from '@/lib/dashboard/types'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/use-theme'
import { useLanguage } from '@/hooks/use-language'

type RangeDays = 7 | 30 | 90

interface ConversationsChartProps {
  /** Per-range data, so switching tabs never re-fetches. */
  series: Record<RangeDays, ConversationsSeriesPoint[] | null>
  loading: boolean
  range: RangeDays
  onRangeChange: (r: RangeDays) => void
}

// ------------------------------------------------------------
// Layout constants. The SVG renders into a fixed viewBox and scales
// via CSS (preserveAspectRatio default). Everything inside uses
// viewBox coordinates so the drawing math stays simple even as the
// container resizes.
// ------------------------------------------------------------
const VB_W = 760
const VB_H = 240
const PADDING = { top: 16, right: 16, bottom: 28, left: 40 }

export function ConversationsChart({ series, loading, range, onRangeChange }: ConversationsChartProps) {
  const data = series[range]
  const { theme } = useTheme()
  const { language } = useLanguage()

  const chartColors = useMemo(() => {
    switch (theme) {
      case 'cobalt':
        return {
          incoming: '#3b82f6',
          outgoing: '#2563eb',
          textIncoming: 'text-blue-600 dark:text-blue-400',
          textOutgoing: 'text-blue-700 dark:text-blue-500',
          dotIncoming: 'bg-blue-500',
          dotOutgoing: 'bg-blue-700',
        }
      case 'amber':
        return {
          incoming: '#f59e0b',
          outgoing: '#d97706',
          textIncoming: 'text-amber-600 dark:text-amber-400',
          textOutgoing: 'text-amber-700 dark:text-amber-500',
          dotIncoming: 'bg-amber-500',
          dotOutgoing: 'bg-amber-700',
        }
      case 'rose':
        return {
          incoming: '#f43f5e',
          outgoing: '#e11d48',
          textIncoming: 'text-rose-600 dark:text-rose-400',
          textOutgoing: 'text-rose-700 dark:text-rose-500',
          dotIncoming: 'bg-rose-500',
          dotOutgoing: 'bg-rose-700',
        }
      case 'emerald':
      case 'violet':
      default:
        return {
          incoming: '#10b981',
          outgoing: '#16a34a',
          textIncoming: 'text-emerald-600 dark:text-emerald-400',
          textOutgoing: 'text-green-600 dark:text-green-400',
          dotIncoming: 'bg-emerald-500',
          dotOutgoing: 'bg-green-500',
        }
    }
  }, [theme])

  // Memoise the max so per-day hover math doesn't recompute it.
  const { maxY, niceTicks } = useMemo(() => {
    const arr = data ?? []
    const max = arr.reduce(
      (m, p) => Math.max(m, p.incoming, p.outgoing),
      0,
    )
    const ceil = niceCeil(max)
    const ticks = [0, ceil / 4, ceil / 2, (3 * ceil) / 4, ceil].map((v) =>
      Math.round(v),
    )
    // De-dupe when the series is flat 0.
    return { maxY: ceil, niceTicks: Array.from(new Set(ticks)) }
  }, [data])

  return (
    <section className="flex h-full flex-col rounded-xl border border-slate-800 bg-slate-900" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <div>
          <h2 className={`text-sm font-semibold text-slate-900 dark:text-white ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'المحادثات بمرور الوقت' : 'Conversations Over Time'}
          </h2>
          <p className={`mt-0.5 text-xs text-slate-500 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'حجم الرسائل اليومية حسب الاتجاه' : 'Daily message volume by direction'}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-slate-800/60 p-1">
          {[7, 30, 90].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRangeChange(r as RangeDays)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                range === r
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white',
              )}
            >
              {language === 'ar' ? `${r} يوم` : `${r} days`}
            </button>
          ))}
        </div>
      </header>

      <div className="p-5">
        {loading || !data ? (
          <Skeleton className="h-[240px] w-full" />
        ) : data.every((p) => p.incoming === 0 && p.outgoing === 0) ? (
          <EmptyState
            icon={MessageSquare}
            title={language === 'ar' ? 'لا يوجد نشاط رسائل في هذه الفترة' : 'No message activity in this range'}
            hint={language === 'ar' ? 'أرسل أو استقبل رسائل لبدء تعبئة هذا المخطط البياني.' : 'Send or receive messages to start populating this chart.'}
          />
        ) : (
          <LineSvg data={data} maxY={maxY} ticks={niceTicks} chartColors={chartColors} language={language} />
        )}
      </div>

      <footer className="flex items-center gap-4 border-t border-slate-800 px-5 py-3 text-xs text-slate-400">
        <LegendDot color={chartColors.incoming} label={language === 'ar' ? 'واردة' : 'Incoming'} />
        <LegendDot color={chartColors.outgoing} label={language === 'ar' ? 'صادرة' : 'Outgoing'} />
      </footer>
    </section>
  )
}

// ------------------------------------------------------------
// The actual SVG. Two polylines + per-day hit targets for hover.
// ------------------------------------------------------------

function LineSvg({
  data,
  maxY,
  ticks,
  chartColors,
  language,
}: {
  data: ConversationsSeriesPoint[]
  maxY: number
  ticks: number[]
  chartColors: any
  language: string
}) {
  const { colorMode } = useTheme()
  // Hover state: both the snapped index AND the tooltip's pixel
  // offset inside the wrapper div. They're stored together so the
  // tooltip positions against the chart's actual rendered pixels,
  // not against a raw viewBox percentage.
  const [hover, setHover] = useState<{ idx: number; tooltipLeftPx: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const chartW = VB_W - PADDING.left - PADDING.right
  const chartH = VB_H - PADDING.top - PADDING.bottom

  // x step can be fractional for 90-day views; points are positioned
  // at the center of each "slot" so the first and last points don't
  // sit right on the axis.
  const stepX = data.length > 1 ? chartW / (data.length - 1) : 0
  const yFor = (v: number) =>
    maxY === 0 ? PADDING.top + chartH : PADDING.top + chartH - (v / maxY) * chartH
  const xFor = (i: number) => PADDING.left + i * stepX

  const incomingPath = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(p.incoming)}`).join(' ')
  const outgoingPath = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(p.outgoing)}`).join(' ')

  useEffect(() => {
    const svg = svgRef.current
    const wrap = wrapRef.current
    if (!svg || !wrap) return
    const onMove = (e: MouseEvent) => {
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const local = pt.matrixTransform(ctm.inverse())
      const xVb = local.x

      // Snap to closest day column. Bounds clamp ensures we don't snap
      // to index -1 or index >= length when the cursor drifts past the
      // axis borders.
      const rawIdx = Math.round((xVb - PADDING.left) / stepX)
      const idx = Math.max(0, Math.min(data.length - 1, rawIdx))

      // Tooltip pixel alignment: standard getBoundingClientRect is scales-
      // safe and matches current screen layout. We offset by padding.left
      // and index step scaled to the actual DOM width so the tooltip
      // box snaps precisely to the vertical axis line.
      const rect = svg.getBoundingClientRect()
      const ratio = rect.width / VB_W
      const tooltipLeftPx = (PADDING.left + idx * stepX) * ratio

      setHover({ idx, tooltipLeftPx })
    }
    const onLeave = () => setHover(null)

    wrap.addEventListener('mousemove', onMove)
    wrap.addEventListener('mouseleave', onLeave)
    return () => {
      wrap.removeEventListener('mousemove', onMove)
      wrap.removeEventListener('mouseleave', onLeave)
    }
  }, [data, stepX])

  const hovered = hover !== null ? data[hover.idx] : null
  const hoverX = hover !== null ? xFor(hover.idx) : 0

  // X-axis label strategy: show ~6 evenly-spaced labels regardless
  // of range so the axis never looks crowded.
  const labelStride = Math.max(1, Math.ceil(data.length / 6))

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-[240px] w-full"
        role="img"
        aria-label="Conversations per day"
      >
        {/* Y-axis gridlines + labels */}
        {ticks.map((t) => {
          const y = yFor(t)
          return (
            <g key={t}>
              <line
                x1={PADDING.left}
                x2={VB_W - PADDING.right}
                y1={y}
                y2={y}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeDasharray="3 3"
              />
              <text
                x={PADDING.left - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-slate-500 text-[10px]"
              >
                {t}
              </text>
            </g>
          )
        })}

        {/* X-axis labels */}
        {data.map((p, i) =>
          i % labelStride === 0 ? (
            <text
              key={p.day}
              x={xFor(i)}
              y={VB_H - 8}
              textAnchor="middle"
              className="fill-slate-500 text-[10px]"
            >
              {shortDayLabel(p.day, language)}
            </text>
          ) : null,
        )}

        {/* Outgoing polyline */}
        <path
          d={outgoingPath}
          fill="none"
          stroke={chartColors.outgoing}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Incoming polyline */}
        <path
          d={incomingPath}
          fill="none"
          stroke={chartColors.incoming}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Hover crosshair */}
        {hover !== null && (
          <g pointerEvents="none">
            <line
              x1={hoverX}
              x2={hoverX}
              y1={PADDING.top}
              y2={PADDING.top + chartH}
              className="stroke-slate-300 dark:stroke-slate-600"
              strokeDasharray="3 3"
            />
            <circle cx={hoverX} cy={yFor(data[hover.idx].incoming)} r={3.5} fill={chartColors.incoming} />
            <circle cx={hoverX} cy={yFor(data[hover.idx].outgoing)} r={3.5} fill={chartColors.outgoing} />
          </g>
        )}
      </svg>

      {/* Tooltip */}
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: `${hover.tooltipLeftPx}px` }}
        >
          <div className="font-medium text-slate-900 dark:text-white">{longDayLabel(hovered.day, language)}</div>
          <div className="mt-1 flex flex-col gap-0.5">
            <span className={cn("flex items-center gap-1.5", chartColors.textIncoming)}>
              <span className={cn("inline-block h-1.5 w-1.5 rounded-full", chartColors.dotIncoming)} />
              {hovered.incoming} {language === 'ar' ? 'واردة' : 'incoming'}
            </span>
            <span className={cn("flex items-center gap-1.5", chartColors.textOutgoing)}>
              <span className={cn("inline-block h-1.5 w-1.5 rounded-full", chartColors.dotOutgoing)} />
              {hovered.outgoing} {language === 'ar' ? 'صادرة' : 'outgoing'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function shortDayLabel(key: string, language: string): string {
  // key is YYYY-MM-DD; return "Apr 17"-style. Using Date with an
  // appended time avoids timezone-shift surprises across midnight.
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(language === 'ar' ? 'ar-SA' : undefined, { month: 'short', day: 'numeric' })
}

function longDayLabel(key: string, language: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(language === 'ar' ? 'ar-SA' : undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Round `max` up to a "nice" number so Y-axis ticks feel natural
 * (1, 2, 5, 10, 20, 50, …). Keeps the chart readable even when the
 * series is small (max=3 becomes ceil=4, not 3).
 */
function niceCeil(max: number): number {
  if (max <= 0) return 4
  const pow = Math.pow(10, Math.floor(Math.log10(max)))
  const normalised = max / pow
  let nice: number
  if (normalised <= 1) nice = 1
  else if (normalised <= 2) nice = 2
  else if (normalised <= 5) nice = 5
  else nice = 10
  return nice * pow
}
