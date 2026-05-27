import { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { getDashboard, type DashboardResponse, type DashboardTimelineRow } from '../../api/admin';
import { Activity, Users, Coins, DollarSign } from 'lucide-react';

type GroupBy = 'group' | 'model';

const WINDOW_OPTIONS = [
  { label: '1일', value: 1 },
  { label: '1주', value: 7 },
  { label: '1달', value: 30 },
  { label: '1년', value: 365 },
];

// Token tracking was introduced on this date; clamp the chart start so earlier empty days aren't shown.
const TRACKING_START = '2026-04-22';

// Distinct-enough palette for stacked series on a dark background
const PALETTE = [
  '#60a5fa', '#f59e0b', '#10b981', '#ef4444', '#a78bfa',
  '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4',
  '#eab308', '#8b5cf6', '#22c55e',
];

function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR');
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function formatUSD(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 100) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

function formatRate(n: number | null | undefined): string {
  if (n == null) return '—';
  // Per-1M price; show with 2 decimals when large, 3 when small
  return n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [groupBy, setGroupBy] = useState<GroupBy>('group');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDashboard(days)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.detail || '데이터를 불러오지 못했습니다'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  // Build the chart dataset: one row per date, with a column per series (group name or model name).
  const { chartData, seriesKeys } = useMemo(() => {
    if (!data) return { chartData: [] as Record<string, number | string>[], seriesKeys: [] as string[] };

    const dateSet = new Set<string>();
    const seriesSet = new Set<string>();
    const bucket: Record<string, Record<string, number>> = {};
    const seriesTotals: Record<string, number> = {};

    const keyFor = (r: DashboardTimelineRow) =>
      groupBy === 'group'
        ? (r.group_name || '미지정')
        : (r.model_id || r.provider_name || '—');

    for (const r of data.timeline) {
      dateSet.add(r.date);
      const sKey = keyFor(r);
      seriesSet.add(sKey);
      if (!bucket[r.date]) bucket[r.date] = {};
      bucket[r.date][sKey] = (bucket[r.date][sKey] ?? 0) + r.total_tokens;
      seriesTotals[sKey] = (seriesTotals[sKey] ?? 0) + r.total_tokens;
    }

    // Fill in every date in the window so the chart shows a continuous timeline.
    // Clamp to TRACKING_START so we don't render weeks of empty days from before tracking existed.
    const rawStart = data.window_start < TRACKING_START ? TRACKING_START : data.window_start;
    const startDate = new Date(rawStart + 'T00:00:00Z');
    const endDate = new Date(data.window_end + 'T00:00:00Z');
    const dates: string[] = [];
    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    // Drop series that never contributed tokens — otherwise recharts still draws their zero-height
    // stroke on top of a real series, making it look like the wrong color.
    // Cap to top 10 series by total; lump the rest into "기타"
    const sortedSeries = Array.from(seriesSet)
      .filter((s) => (seriesTotals[s] ?? 0) > 0)
      .sort((a, b) => (seriesTotals[b] ?? 0) - (seriesTotals[a] ?? 0));
    const topSeries = sortedSeries.slice(0, 10);
    const rest = new Set(sortedSeries.slice(10));
    const finalSeries = rest.size > 0 ? [...topSeries, '기타'] : topSeries;

    const rows = dates.map((date) => {
      const row: Record<string, number | string> = { date };
      for (const s of topSeries) row[s] = bucket[date]?.[s] ?? 0;
      if (rest.size > 0) {
        let other = 0;
        for (const s of rest) other += bucket[date]?.[s] ?? 0;
        row['기타'] = other;
      }
      return row;
    });

    return { chartData: rows, seriesKeys: finalSeries };
  }, [data, groupBy]);

  if (loading) {
    return <div className="text-gray-400 text-sm py-8 text-center">불러오는 중...</div>;
  }
  if (error) {
    return <div className="text-red-400 text-sm py-8 text-center">{error}</div>;
  }
  if (!data) return null;

  const s = data.summary;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">대시보드</h2>
        <div className="flex items-center gap-1 bg-[#2f2f2f] rounded-lg p-1">
          {WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1 text-xs font-medium rounded-md ${
                days === opt.value ? 'bg-[#4a4a4a] text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile
          icon={<Coins className="w-4 h-4" />}
          label={`${days}일 토큰`}
          value={formatNumber(s.window_total_tokens)}
          sub={`입력 ${formatCompact(s.window_prompt_tokens)} · 출력 ${formatCompact(s.window_completion_tokens)}`}
        />
        <Tile
          icon={<DollarSign className="w-4 h-4" />}
          label={`${days}일 예상 비용`}
          value={formatUSD(s.window_cost_usd)}
          sub={s.window_cost_usd == null ? '가격 미등록 모델 포함' : `오늘 ${formatUSD(s.today_cost_usd)}`}
        />
        <Tile
          icon={<Activity className="w-4 h-4" />}
          label="오늘 토큰"
          value={formatNumber(s.today_total_tokens)}
          sub={`응답 ${formatNumber(s.today_assistant_messages)}건`}
        />
        <Tile
          icon={<Users className="w-4 h-4" />}
          label="활성 사용자"
          value={formatNumber(s.active_users_in_window)}
          sub={`최근 ${days}일 기준`}
        />
      </div>

      {/* Token usage timeline */}
      <section className="bg-[#1f1f1f] border border-[#2f2f2f] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-white text-sm font-semibold">토큰 사용량 추이</h3>
            <p className="text-gray-500 text-xs mt-0.5">일별 합계 ({(data.window_start < TRACKING_START ? TRACKING_START : data.window_start)} ~ {data.window_end})</p>
          </div>
          <div className="flex items-center gap-1 bg-[#2f2f2f] rounded-lg p-1">
            <button
              onClick={() => setGroupBy('group')}
              className={`px-3 py-1 text-xs font-medium rounded-md ${
                groupBy === 'group' ? 'bg-[#4a4a4a] text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              그룹별
            </button>
            <button
              onClick={() => setGroupBy('model')}
              className={`px-3 py-1 text-xs font-medium rounded-md ${
                groupBy === 'model' ? 'bg-[#4a4a4a] text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              모델별
            </button>
          </div>
        </div>
        {seriesKeys.length === 0 ? (
          <div className="text-gray-500 text-sm py-12 text-center">기간 내 기록된 토큰이 없습니다</div>
        ) : (
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  {seriesKeys.map((k, i) => (
                    <linearGradient id={`grad-${i}`} key={k} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.7} />
                      <stop offset="100%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.15} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke="#2f2f2f" vertical={false} />
                <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} tickFormatter={formatCompact} />
                <Tooltip
                  contentStyle={{ background: '#171717', border: '1px solid #2f2f2f', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#d1d5db' }}
                  formatter={(v) => formatNumber(Number(v))}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
                {seriesKeys.map((k, i) => (
                  <Area
                    key={k}
                    type="monotone"
                    dataKey={k}
                    stackId="1"
                    stroke={PALETTE[i % PALETTE.length]}
                    fill={`url(#grad-${i})`}
                    strokeWidth={1.5}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Per-provider cost + quota */}
      {data.providers.length > 0 && (
        <section className="bg-[#1f1f1f] border border-[#2f2f2f] rounded-xl p-4">
          <div className="mb-3">
            <h3 className="text-white text-sm font-semibold">모델별 비용 및 쿼터</h3>
            <p className="text-gray-500 text-xs mt-0.5">누적 사용량 기준. 가격은 1M 토큰당 USD (입력/출력).</p>
          </div>
          <div className="space-y-3">
            {[...data.providers].sort((a, b) => b.tokens_used - a.tokens_used).map((p) => {
              const over = p.token_quota != null && p.tokens_used > p.token_quota;
              const barWidth = p.token_quota == null ? 100 : Math.min(100, p.percent_used ?? 0);
              const barColor = p.token_quota == null
                ? 'bg-gradient-to-r from-[#3a3a3a] to-[#4a4a4a]'
                : over
                  ? 'bg-red-500'
                  : (p.percent_used ?? 0) > 80 ? 'bg-yellow-500' : 'bg-emerald-500';
              return (
                <div key={p.id}>
                  <div className="flex items-center justify-between mb-1 text-xs gap-3">
                    <div className="text-gray-200 font-medium truncate">
                      {p.name} <span className="text-gray-500 font-normal">· {p.model_id || '—'}</span>
                      <span className="ml-2 text-gray-500">
                        in {formatRate(p.input_price_per_1m)} · out {formatRate(p.output_price_per_1m)} / 1M
                      </span>
                      {p.price_source === 'override' && <span className="ml-2 text-blue-400">(수동)</span>}
                      {p.price_source === 'unknown' && <span className="ml-2 text-yellow-500">(가격 미등록)</span>}
                    </div>
                    <div className="text-gray-400 whitespace-nowrap">
                      <span className={over ? 'text-red-400' : 'text-gray-300'}>{formatNumber(p.tokens_used)}</span>
                      {p.token_quota != null && <span className="text-gray-600"> / {formatNumber(p.token_quota)}</span>}
                      {p.token_quota == null && <span className="text-gray-600"> / 무제한</span>}
                      <span className="ml-3 text-emerald-400">{formatUSD(p.cost_usd)}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-[#2f2f2f] rounded-full overflow-hidden">
                    <div className={`h-full ${barColor}`} style={{ width: `${barWidth}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Per-group usage & limits */}
      {data.groups.length > 0 && (
        <section className="bg-[#1f1f1f] border border-[#2f2f2f] rounded-xl p-4">
          <div className="mb-3">
            <h3 className="text-white text-sm font-semibold">그룹별 사용량 및 한도 ({days}일)</h3>
            <p className="text-gray-500 text-xs mt-0.5">선택한 기간 내 토큰/비용 사용량. 한도 미설정 시 무제한.</p>
          </div>
          <div className="space-y-3">
            {data.groups.map((g) => (
              <UsageRow
                key={g.group_id}
                title={g.group_name}
                tokens={g.tokens_used}
                cost={g.cost_usd}
                tokenLimit={g.token_limit}
                priceLimit={g.price_limit_usd}
                tokenPercent={g.token_percent}
                pricePercent={g.price_percent}
              />
            ))}
          </div>
        </section>
      )}

      {/* Per-user usage & limits */}
      {data.users.length > 0 && (
        <section className="bg-[#1f1f1f] border border-[#2f2f2f] rounded-xl p-4">
          <div className="mb-3">
            <h3 className="text-white text-sm font-semibold">사용자별 사용량 및 한도 ({days}일)</h3>
            <p className="text-gray-500 text-xs mt-0.5">기간 내 활동이 있거나 한도가 설정된 사용자만 표시됩니다.</p>
          </div>
          <div className="space-y-3">
            {data.users.map((u) => (
              <UsageRow
                key={u.user_id}
                title={u.name}
                subtitle={u.email + (u.group_name ? ` · ${u.group_name}` : '')}
                tokens={u.tokens_used}
                cost={u.cost_usd}
                tokenLimit={u.token_limit}
                priceLimit={u.price_limit_usd}
                tokenPercent={u.token_percent}
                pricePercent={u.price_percent}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

interface UsageRowProps {
  title: string;
  subtitle?: string;
  tokens: number;
  cost: number | null;
  tokenLimit: number | null;
  priceLimit: number | null;
  tokenPercent: number | null;
  pricePercent: number | null;
}

function UsageRow({ title, subtitle, tokens, cost, tokenLimit, priceLimit, tokenPercent, pricePercent }: UsageRowProps) {
  const tokenOver = tokenLimit != null && tokens > tokenLimit;
  const priceOver = priceLimit != null && cost != null && cost > priceLimit;
  // Pick the more saturated of the two as the dominant bar color/percent
  const dominantPercent = (() => {
    const a = tokenPercent ?? -1;
    const b = pricePercent ?? -1;
    return Math.max(a, b);
  })();
  const barWidth = dominantPercent < 0 ? 0 : Math.min(100, dominantPercent);
  const noLimit = tokenLimit == null && priceLimit == null;
  const over = tokenOver || priceOver;
  const barColor = noLimit
    ? 'bg-gradient-to-r from-[#3a3a3a] to-[#4a4a4a]'
    : over
      ? 'bg-red-500'
      : dominantPercent > 80 ? 'bg-yellow-500' : 'bg-emerald-500';

  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-xs gap-3">
        <div className="text-gray-200 font-medium truncate">
          {title}
          {subtitle && <span className="ml-2 text-gray-500 font-normal">· {subtitle}</span>}
        </div>
        <div className="text-gray-400 whitespace-nowrap text-right">
          <span className={tokenOver ? 'text-red-400' : 'text-gray-300'}>{formatNumber(tokens)}</span>
          <span className="text-gray-600"> / {tokenLimit != null ? formatNumber(tokenLimit) : '무제한'}</span>
          <span className="mx-2 text-gray-600">·</span>
          <span className={priceOver ? 'text-red-400' : 'text-emerald-400'}>{formatUSD(cost)}</span>
          {priceLimit != null && <span className="text-gray-600"> / {formatUSD(priceLimit)}</span>}
        </div>
      </div>
      <div className="h-2 bg-[#2f2f2f] rounded-full overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: noLimit ? '100%' : `${barWidth}%` }} />
      </div>
    </div>
  );
}

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-[#1f1f1f] border border-[#2f2f2f] rounded-xl p-4">
      <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-white text-2xl font-semibold">{value}</div>
      <div className="text-gray-500 text-xs mt-1">{sub}</div>
    </div>
  );
}
