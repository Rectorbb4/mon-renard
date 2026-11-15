<script lang="ts">
  // Une courbe de l'historique (uPlot). Les moments « je le sens » sont marqués par des traits verticaux.
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';
  import type { CheckIn, FeltEvent } from '../data/types';
  import { MOOD_IDS, MOODS } from '../fox/moods';
  import { dayTicks } from '../lib/history';

  let {
    kind,
    from,
    to,
    checkins,
    events,
    label
  }: {
    kind: 'mood' | 'energy';
    from: number;
    to: number;
    checkins: CheckIn[];
    events: FeltEvent[];
    /** Description pour les lecteurs d'écran. */
    label: string;
  } = $props();

  let host: HTMLDivElement;
  let width = $state(0);
  let scheme = $state(0); // change quand le thème clair/sombre change, pour redessiner

  // Zones d'humeur : bornes et position du libellé (mêmes seuils que moodFromScore)
  const BANDS: { id: (typeof MOOD_IDS)[number]; lo: number; hi: number }[] = [
    { id: 'creux', lo: -1, hi: -0.6 },
    { id: 'grisaille', lo: -0.6, hi: -0.25 },
    { id: 'equilibre', lo: -0.25, hi: 0.25 },
    { id: 'elan', lo: 0.25, hi: 0.6 },
    { id: 'emballement', lo: 0.6, hi: 1 }
  ];

  function alpha(hex: string, a: number): string {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  $effect(() => {
    const ro = new ResizeObserver(() => (width = host.clientWidth));
    ro.observe(host);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => scheme++;
    mq.addEventListener('change', onScheme);
    return () => {
      ro.disconnect();
      mq.removeEventListener('change', onScheme);
    };
  });

  $effect(() => {
    void scheme;
    if (!width) return;
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const muted = v('--muted');
    const line = v('--line');
    const accent = v('--accent');
    const surface = v('--surface');
    const felt = v('--felt');
    const sleepColor = v('--sleep');
    const font = `12px ${v('--font-body')}`;
    const isMood = kind === 'mood';
    const dpr = uPlot.pxRatio;

    const sorted = [...checkins].sort((a, b) => a.at - b.at);
    const x = sorted.map((c) => c.at / 1000);
    const data: uPlot.AlignedData = isMood
      ? [x, sorted.map((c) => c.mood)]
      : [x, sorted.map((c) => c.energy), sorted.map((c) => c.sleep)];

    const short = to - from <= 8 * 86400_000;
    const dense = !short;
    const veryDense = to - from > 45 * 86400_000;
    // Assez de place pour chaque date, et la dernière graduation est aujourd'hui
    const ticks = dayTicks(from, to - 1, Math.max(3, Math.floor((width - 44) / (short ? 38 : 62)))).map((d) => d / 1000);
    const textColor = v('--fg');
    const yLabels = isMood
      ? BANDS.map((b) => ({ value: (b.lo + b.hi) / 2, text: MOODS[b.id].label }))
      : [
          { value: 1, text: 'Pleine forme' },
          { value: 0.5, text: 'Ça va' },
          { value: 0, text: 'À plat' }
        ];
    // Sur 7 jours, le jour de la semaine au-dessus du numéro : « lun. » puis « 9 », pour que les dates ne se touchent pas
    const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
    const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
    const tickLabel = (ms: number) => (short ? `${weekday.format(ms)}\n${new Date(ms).getDate()}` : dayMonth.format(ms));

    const series: uPlot.Series[] = [
      {},
      {
        label: isMood ? 'Humeur' : 'Énergie',
        stroke: accent,
        width: veryDense ? 1.5 : dense ? 2 : 2.5,
        spanGaps: true,
        points: veryDense
          ? { show: false }
          : { show: true, size: dense ? 5 : 8, width: dense ? 1.5 : 2, stroke: accent, fill: surface }
      }
    ];
    if (!isMood) {
      series.push({
        label: 'Nuit',
        stroke: sleepColor,
        paths: () => null,
        points: { show: true, size: veryDense ? 5 : dense ? 7 : 10, width: 0, fill: sleepColor, stroke: sleepColor }
      });
    }

    const opts: uPlot.Options = {
      width,
      height: isMood ? 240 : 190,
      // Marges gauche et droite : la place de la moitié d'une date sous la première et la dernière graduation
      padding: [14, 22, 0, 22],
      cursor: { show: false },
      legend: { show: false },
      select: { show: false, left: 0, top: 0, width: 0, height: 0 },
      scales: {
        x: { time: true, range: [from / 1000, to / 1000] },
        y: { range: isMood ? [-1, 1] : [-0.05, 1.05] }
      },
      axes: [
        {
          stroke: muted,
          font,
          size: short ? 46 : 34,
          gap: 6,
          ticks: { show: false },
          grid: { stroke: line, width: 1 },
          splits: () => ticks,
          values: (_u, splits) => splits.map((s) => tickLabel(s * 1000))
        },
        {
          // Les libellés sont dessinés dans la courbe (voir plus bas) pour laisser toute la largeur aux jours
          show: true,
          size: 0,
          gap: 0,
          ticks: { show: false },
          grid: { show: !isMood, stroke: line, width: 1 },
          splits: () => yLabels.map((l) => l.value),
          values: () => yLabels.map(() => '')
        }
      ],
      series,
      hooks: {
        drawClear: [
          (u) => {
            const { ctx, bbox } = u;
            ctx.save();
            if (isMood) {
              for (const b of BANDS) {
                const top = u.valToPos(b.hi, 'y', true);
                const bottom = u.valToPos(b.lo, 'y', true);
                ctx.fillStyle = alpha(MOODS[b.id].sky.bottom, dark ? 0.22 : 0.38);
                ctx.fillRect(bbox.left, top, bbox.width, bottom - top);
              }
            }
            // Libellés de l'axe vertical, en petit, collés à gauche sous la courbe
            ctx.font = `700 ${11.5 * dpr}px ${v('--font-body')}`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillStyle = alpha(textColor.startsWith('#') ? textColor : '#16232c', 0.5);
            for (const l of yLabels) {
              let y = u.valToPos(l.value, 'y', true);
              // Énergie : le libellé se pose juste au-dessus (ou en dessous, pour le haut) de sa ligne
              if (!isMood) y += (l.value >= 1 ? 9 : -9) * dpr;
              ctx.fillText(l.text, bbox.left + 6 * dpr, y);
            }
            ctx.restore();
          }
        ],
        draw: [
          (u) => {
            const { ctx, bbox } = u;
            ctx.save();
            ctx.strokeStyle = felt;
            ctx.fillStyle = felt;
            ctx.lineWidth = 2 * dpr;
            ctx.setLineDash([4 * dpr, 4 * dpr]);
            for (const e of events) {
              const px = u.valToPos(e.at / 1000, 'x', true);
              if (px < bbox.left - 1 || px > bbox.left + bbox.width + 1) continue;
              if (veryDense) {
                // Sur 3 mois, des traits pleine hauteur cacheraient la courbe : un simple repère en haut
                ctx.beginPath();
                ctx.arc(px, bbox.top + 5 * dpr, 3 * dpr, 0, Math.PI * 2);
                ctx.fill();
                continue;
              }
              ctx.beginPath();
              ctx.moveTo(px, bbox.top + 6 * dpr);
              ctx.lineTo(px, bbox.top + bbox.height);
              ctx.stroke();
              if (isMood) {
                ctx.beginPath();
                ctx.arc(px, bbox.top + 5 * dpr, 4.5 * dpr, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            ctx.restore();
          }
        ]
      }
    };

    const chart = new uPlot(opts, data, host);
    return () => chart.destroy();
  });
</script>

<div class="chart" bind:this={host} role="img" aria-label={label}></div>

<style>
  .chart {
    width: 100%;
    min-height: 120px;
  }

  .chart :global(.uplot) {
    font-family: var(--font-body);
  }
</style>
