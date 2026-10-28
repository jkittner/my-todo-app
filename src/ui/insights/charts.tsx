import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DAY_MS, HOUR_MS, MINUTE_MS, MONTH_MS, YEAR_MS } from '../../logic/dates';
import type { BoxStats } from '../../logic/stats';

export interface Datum {
  key: string;
  label: string;
  value: number;
  /** CSS colour, normally a var(--c-*) token. */
  color: string;
}

const pct = (v: number, total: number) => (total ? Math.round((v / total) * 100) : 0);

interface Tip {
  text: string;
  x: number;
  y: number;
}

/** Hover and focus tooltip shared by the marks inside one chart. */
function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const bind = (text: string) => {
    const show = (e: Event) => {
      const mark = e.currentTarget as Element;
      const box = mark.closest('.chart-body') as HTMLElement;
      const m = mark.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      setTip({ text, x: m.left - b.left + m.width / 2, y: m.top - b.top });
    };
    return {
      onPointerEnter: show,
      onFocus: show,
      onPointerLeave: () => setTip(null),
      onBlur: () => setTip(null),
      tabIndex: 0,
      'aria-label': text,
    };
  };
  const node = tip && (
    <div class="chart-tip" role="tooltip" style={{ left: `${tip.x}px`, top: `${tip.y}px` }}>
      {tip.text}
    </div>
  );
  return { bind, node };
}

export function ChartCard(p: {
  title: string;
  note?: string;
  wide?: boolean;
  children: ComponentChildren;
  table: ComponentChildren;
}) {
  return (
    <section class={`chart-card ${p.wide ? 'is-wide' : ''}`}>
      <h3>{p.title}</h3>
      {p.note && <p class="chart-note">{p.note}</p>}
      {p.children}
      <details class="chart-table">
        <summary>Show as table</summary>
        {p.table}
      </details>
    </section>
  );
}

export function Legend({ items }: { items: Datum[] }) {
  return (
    <ul class="legend">
      {items.map((d) => (
        <li key={d.key}>
          <span class="swatch" style={{ background: d.color }} aria-hidden="true" />
          {d.label}
        </li>
      ))}
    </ul>
  );
}

export function SimpleTable(p: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table class="data-table compact">
      <thead>
        <tr>
          {p.head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {p.rows.map((r) => (
          <tr key={String(r[0])}>
            {r.map((c, i) =>
              i === 0 ? (
                <th scope="row" key={i}>
                  {c}
                </th>
              ) : (
                <td key={i}>{c}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One horizontal bar split into parts of a whole, with a labelled legend underneath. */
export function ShareBar({ data, unit = 'tasks' }: { data: Datum[]; unit?: string }) {
  const { bind, node } = useTip();
  const total = data.reduce((s, d) => s + d.value, 0);
  const parts = data.filter((d) => d.value > 0);
  return (
    <div class="chart-body">
      {total === 0 ? (
        <p class="chart-empty">No tasks to show yet.</p>
      ) : (
        <div class="share-bar">
          {parts.map((d) => (
            <div
              key={d.key}
              class="share-seg"
              style={{ flexGrow: d.value, background: d.color }}
              {...bind(`${d.label}: ${d.value} ${unit} (${pct(d.value, total)}%)`)}
            />
          ))}
        </div>
      )}
      <ul class="share-legend">
        {data.map((d) => (
          <li key={d.key}>
            <span class="swatch" style={{ background: d.color }} aria-hidden="true" />
            <span class="share-label">{d.label}</span>
            <span class="share-value">
              {d.value} <span class="muted">({pct(d.value, total)}%)</span>
            </span>
          </li>
        ))}
      </ul>
      {node}
    </div>
  );
}

/** Horizontal bars on a shared scale, one series, value at the tip. */
export function BarList({ data, unit = 'tasks' }: { data: Datum[]; unit?: string }) {
  const { bind, node } = useTip();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div class="chart-body">
      {data.length === 0 ? (
        <p class="chart-empty">No tasks to show yet.</p>
      ) : (
        <ul class="bar-list">
          {data.map((d) => (
            <li key={d.key}>
              <span class="bar-label">{d.label}</span>
              <span class="bar-track">
                <span
                  class="bar"
                  style={{ width: `${(d.value / max) * 100}%`, background: d.color }}
                  {...bind(`${d.label}: ${d.value} ${unit}`)}
                />
                <span class="bar-value">{d.value}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {node}
    </div>
  );
}

export interface BoxRow {
  key: string;
  label: string;
  box: BoxStats;
  /** Values the box is drawn from. */
  count: number;
}

/** Round durations for axis steps, from a minute to a century. */
const NICE_STEPS_MS = [
  ...[1, 2, 5, 10, 15, 30].map((m) => m * MINUTE_MS),
  ...[1, 2, 3, 4, 6, 8, 12].map((h) => h * HOUR_MS),
  ...[1, 2, 3, 7, 14].map((d) => d * DAY_MS),
  ...[1, 2, 3, 6].map((m) => m * MONTH_MS),
  ...[1, 2, 5, 10, 20, 50, 100].map((y) => y * YEAR_MS),
];

/** Round steps giving about four ticks from at or below `lo` to at or above `hi`. */
export function linearTicks(lo: number, hi: number): number[] {
  // A single value gets a step from its size, so the axis still has a scale.
  const span = hi - lo || Math.abs(hi) || MINUTE_MS;
  const step = NICE_STEPS_MS.find((s) => s >= span / 4) as number;
  const start = Math.floor(lo / step);
  return Array.from({ length: Math.max(1, Math.ceil(hi / step) - start) + 1 }, (_, i) => (start + i) * step);
}

/**
 * Log axis ticks: the floor itself first (drawn as 0), then round durations above it up to the first
 * one at or above `hi`. A tick closer than a decade to the previous one is left out so labels don't
 * collide; the last tick is kept in its place by dropping the one before it if needed.
 */
export function logTicks(floor: number, hi: number): number[] {
  const minGap = 1;
  const ticks = [floor];
  for (const c of NICE_STEPS_MS) {
    if (c <= floor) continue;
    if (c >= hi) {
      if (ticks.length > 1 && Math.log10(c / ticks[ticks.length - 1]) < minGap) ticks.pop();
      ticks.push(c);
      break;
    }
    if (Math.log10(c / ticks[ticks.length - 1]) >= minGap) ticks.push(c);
  }
  return ticks;
}

/**
 * One horizontal box plot per row on a shared scale fitted to the whiskers: the box spans the IQR,
 * the line in it is the median (also written at the row's end), and the whiskers stop at
 * 1.5 × the box length. Values beyond the whiskers are not drawn.
 * Values are durations in ms. The scale is linear unless switched to log, where values below
 * `logFloor` are drawn at it.
 */
export function BoxPlotList({
  rows,
  format,
  logFloor,
}: {
  rows: BoxRow[];
  format: (ms: number) => string;
  logFloor: number;
}) {
  const { bind, node } = useTip();
  const [log, setLog] = useState(false);
  const lowest = Math.min(...rows.map((r) => r.box.low));
  const highest = Math.max(...rows.map((r) => r.box.high));
  const scale = log ? (v: number) => Math.log10(Math.max(v, logFloor)) : (v: number) => v;
  const ticks = log ? logTicks(logFloor, Math.max(highest, logFloor)) : linearTicks(lowest, highest);
  // The log axis starts at the floor, which reads as 0: a visual anchor, not a value.
  const label = (t: number, i: number) => (log && i === 0 ? '0' : format(t));
  const min = scale(ticks[0]);
  const span = scale(ticks[ticks.length - 1]) - min;
  const at = (v: number) => `${((scale(v) - min) / span) * 100}%`;
  const extent = (from: number, to: number) => `${((scale(to) - scale(from)) / span) * 100}%`;
  return (
    <div class="chart-body">
      {rows.length === 0 ? (
        <p class="chart-empty">No completed tasks yet.</p>
      ) : (
        <>
          <div class="segmented box-scale" role="group" aria-label="Axis scale">
            {[
              { key: false, label: 'Linear' },
              { key: true, label: 'Log' },
            ].map((s) => (
              <button
                key={s.label}
                type="button"
                class="segment-button"
                aria-pressed={log === s.key}
                onClick={() => setLog(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <ul class="box-list">
            {rows.map(({ key, label, box: b, count }) => (
              <li key={key}>
                <span class="bar-label">{label}</span>
                <span
                  class="box-track"
                  {...bind(
                    `${label}: median ${format(b.median)}, IQR ${format(b.q1)} to ${format(b.q3)}, ` +
                      `whiskers ${format(b.low)} to ${format(b.high)}, ${count} ${count === 1 ? 'task' : 'tasks'}`,
                  )}
                >
                  {ticks.map((t) => (
                    <span key={t} class="box-grid" style={{ left: at(t) }} />
                  ))}
                  <span class="box-whisker" style={{ left: at(b.low), width: extent(b.low, b.high) }} />
                  <span class="box" style={{ left: at(b.q1), width: extent(b.q1, b.q3) }} />
                  <span class="box-median" style={{ left: at(b.median) }} />
                </span>
                <span class="bar-value">{format(b.median)}</span>
              </li>
            ))}
          </ul>
          <div class="box-axis" aria-hidden="true">
            <span class="box-ticks">
              {ticks.map((t, i) => (
                <span key={t} style={{ left: at(t) }}>
                  {label(t, i)}
                </span>
              ))}
            </span>
          </div>
        </>
      )}
      {node}
    </div>
  );
}

export interface StackRow {
  key: string;
  label: string;
  parts: Datum[];
}

/** One stacked bar per row on a shared scale (counts, not shares), total at the tip. */
export function StackedRows({ rows }: { rows: StackRow[] }) {
  const { bind, node } = useTip();
  const totals = rows.map((r) => r.parts.reduce((s, d) => s + d.value, 0));
  const max = Math.max(1, ...totals);
  return (
    <div class="chart-body">
      <ul class="bar-list">
        {rows.map((r, i) => (
          <li key={r.key}>
            <span class="bar-label">{r.label}</span>
            <span class="bar-track">
              <span class="stack" style={{ width: `${(totals[i] / max) * 100}%` }}>
                {r.parts
                  .filter((d) => d.value > 0)
                  .map((d) => (
                    <span
                      key={d.key}
                      class="stack-seg"
                      style={{ flexGrow: d.value, background: d.color }}
                      {...bind(`${r.label}, ${d.label}: ${d.value} tasks`)}
                    />
                  ))}
              </span>
              <span class="bar-value">{totals[i]}</span>
            </span>
          </li>
        ))}
      </ul>
      {node}
    </div>
  );
}

export interface ColumnGroup {
  key: string;
  label: string;
  /** Long form used in tooltips, e.g. "Week of Oct 6". */
  title: string;
  values: Datum[];
}

const niceMax = (v: number) => {
  if (v <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(v));
  const n = Math.ceil(v / step);
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * step;
};

/** A round step (1, 2 or 5 times a power of ten) of at least `v`, which must be above zero. */
export function niceStep(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Tracks an element's rendered width so SVG text stays at its real size. */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current as HTMLDivElement;
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** Grouped columns over time on one y axis. Zero values draw no mark; the table lists them. */
export function GroupedColumns({ groups }: { groups: ColumnGroup[] }) {
  const { bind, node } = useTip();
  const { ref, width: W } = useWidth(640);
  const H = 220;
  const pad = { l: 28, r: 4, t: 8, b: 26 };
  const top = niceMax(Math.max(0, ...groups.flatMap((g) => g.values.map((d) => d.value))));
  const ticks = [0, top / 2, top];
  const band = (W - pad.l - pad.r) / groups.length;
  const series = groups[0]?.values.length ?? 1;
  const barW = Math.max(4, Math.min(16, (band - 12) / series - 2));
  const labelEvery = band < 56 ? 2 : 1;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const base = y(0);

  return (
    <div class="chart-body" ref={ref}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        class="columns-svg"
        role="img"
        aria-label="Completed and overdue tasks per week"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} class="grid" />
            <text x={pad.l - 6} y={y(t)} class="tick" text-anchor="end" dominant-baseline="middle">
              {t}
            </text>
          </g>
        ))}
        {groups.map((g, gi) => {
          const x0 = pad.l + gi * band + (band - series * (barW + 2) + 2) / 2;
          return (
            <g key={g.key}>
              {g.values.map((d, si) => {
                const h = base - y(d.value);
                const x = x0 + si * (barW + 2);
                return (
                  d.value > 0 && (
                    <path
                      key={d.key}
                      class="col"
                      d={columnPath(x, base, barW, h)}
                      style={{ fill: d.color }}
                      {...bind(`${g.title}: ${d.value} ${d.label.toLowerCase()}`)}
                    />
                  )
                );
              })}
              {(groups.length - 1 - gi) % labelEvery === 0 && (
                <text x={pad.l + gi * band + band / 2} y={H - 8} class="tick" text-anchor="middle">
                  {g.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {node}
    </div>
  );
}

/** A column with a 4px rounded top and a square base. */
export function columnPath(x: number, base: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${base}v${-(h - r)}q0,${-r} ${r},${-r}h${w - 2 * r}q${r},0 ${r},${r}v${h - r}z`;
}
