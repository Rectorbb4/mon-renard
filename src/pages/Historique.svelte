<script lang="ts">
  // Historique : courbes sur 7 ou 30 jours, puis le journal jour par jour.
  import { liveQuery } from 'dexie';
  import HistoryChart from '../components/HistoryChart.svelte';
  import { checkInsBetween } from '../data/checkins';
  import { getDB } from '../data/db';
  import { feltEventsBetween } from '../data/events';
  import type { CheckIn, FeltEvent } from '../data/types';
  import { MOODS, moodFromScore } from '../fox/moods';
  import { addDays, averageMood, dayLabel, groupByDay, periodStart, startOfDay } from '../lib/history';
  import { journal, startJournal } from '../lib/journal.svelte';
  import { energyLabel, sleepLabel } from '../lib/labels';
  import { hrefFor } from '../lib/router';

  const PERIOD_KEY = 'mon-renard:periode-historique';
  function savedPeriod(): 7 | 30 {
    try {
      return localStorage.getItem(PERIOD_KEY) === '30' ? 30 : 7;
    } catch {
      return 7;
    }
  }

  let days = $state<7 | 30>(savedPeriod());
  const now = Date.now();
  const from = $derived(periodStart(days, now));
  const to = addDays(startOfDay(now), 1);

  let checkins = $state.raw<CheckIn[]>([]);
  let events = $state.raw<FeltEvent[]>([]);
  let loaded = $state(false);

  function choose(d: 7 | 30) {
    days = d;
    try {
      localStorage.setItem(PERIOD_KEY, String(d));
    } catch {
      /* stockage indisponible */
    }
  }

  $effect(() => {
    const start = from;
    let sub: { unsubscribe(): void } | null = null;
    let cancelled = false;
    startJournal().then(() => {
      const profileId = journal.profileId;
      if (cancelled || profileId == null) {
        loaded = true;
        return;
      }
      const db = getDB();
      sub = liveQuery(() =>
        Promise.all([checkInsBetween(db, profileId, start, to), feltEventsBetween(db, profileId, start, to)])
      ).subscribe({
        next: ([c, e]) => {
          checkins = c;
          events = e;
          loaded = true;
        },
        error: (err) => {
          console.error(err);
          loaded = true;
        }
      });
    });
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  });

  const average = $derived(averageMood(checkins));
  const energyAvg = $derived(checkins.length ? checkins.reduce((s, c) => s + c.energy, 0) / checkins.length : null);
  const nights = $derived(checkins.filter((c) => c.sleep != null));
  const sleepAvg = $derived(nights.length ? nights.reduce((s, c) => s + (c.sleep ?? 0), 0) / nights.length : null);
  const journalDays = $derived(groupByDay(checkins, events));
  const clock = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
</script>

<section class="history">
  <header>
    <h1>Historique</h1>
    <div class="period" role="radiogroup" aria-label="Période">
      <button type="button" role="radio" aria-checked={days === 7} onclick={() => choose(7)}>7 jours</button>
      <button type="button" role="radio" aria-checked={days === 30} onclick={() => choose(30)}>30 jours</button>
    </div>
  </header>

  {#if loaded && !checkins.length && !events.length}
    <div class="empty">
      <p class="empty-title">Rien sur cette période pour l'instant</p>
      <p>Chaque check-in et chaque moment « je le sens » viendra s'ajouter ici.</p>
      <a class="cta" href={hrefFor('accueil')}>Faire un check-in</a>
    </div>
  {:else if loaded}
    <div class="stats">
      <div class="stat">
        <span class="stat-label">Humeur moyenne</span>
        <span class="stat-value">{average == null ? '—' : MOODS[moodFromScore(average)].label}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Énergie moyenne</span>
        <span class="stat-value">{energyAvg == null ? '—' : energyLabel(energyAvg)}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Nuits</span>
        <span class="stat-value">{sleepAvg == null ? '—' : sleepLabel(sleepAvg)}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Check-ins · moments</span>
        <span class="stat-value">{checkins.length} · {events.length}</span>
      </div>
    </div>

    <article class="card">
      <h2>Humeur</h2>
      <HistoryChart
        kind="mood"
        {from}
        {to}
        {checkins}
        {events}
        label={`Courbe de l'humeur sur ${days} jours : ${checkins.length} check-ins, ${events.length} moments « je le sens ».`}
      />
      <p class="legend">
        <span class="key line"></span> ton humeur
        <span class="key felt"></span> « je le sens »
      </p>
    </article>

    <article class="card">
      <h2>Énergie et nuits</h2>
      <HistoryChart
        kind="energy"
        {from}
        {to}
        {checkins}
        {events}
        label={`Courbe de l'énergie et qualité des nuits sur ${days} jours.`}
      />
      <p class="legend">
        <span class="key line"></span> énergie
        <span class="key dot"></span> nuit
        <span class="key felt"></span> « je le sens »
      </p>
    </article>

    <h2 class="journal-title">Journal</h2>
    {#each journalDays as day (day.day)}
      <section class="day">
        <h3>{dayLabel(day.day, now)}</h3>
        <ul>
          {#each day.items as item (item.kind + item.at)}
            <li>
              <span class="time">{clock.format(item.at)}</span>
              {#if item.kind === 'checkin'}
                {@const m = MOODS[moodFromScore(item.checkin.mood)]}
                <span class="mark" style:--top={m.sky.top} style:--bottom={m.sky.bottom}></span>
                <span class="entry">
                  <strong>{m.label}</strong>
                  <span class="detail">
                    énergie {energyLabel(item.checkin.energy).toLowerCase()}{#if item.checkin.sleep != null}, nuit {sleepLabel(item.checkin.sleep).toLowerCase()}{/if}
                  </span>
                  {#if item.checkin.word}<span class="quote">« {item.checkin.word} »</span>{/if}
                </span>
              {:else}
                <span class="mark felt-mark"></span>
                <span class="entry">
                  <strong class="felt-label">Je le sens</strong>
                  {#if item.event.note}<span class="quote">« {item.event.note} »</span>{/if}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}

  <p class="note">Ces courbes t'aident à repérer des tendances. Elles ne remplacent pas un avis médical.</p>
</section>

<style>
  .history {
    display: grid;
    gap: 18px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  h1 {
    font-size: clamp(30px, 8vw, 40px);
  }

  .period {
    display: inline-flex;
    padding: 4px;
    border-radius: 999px;
    background: var(--surface-2);
  }

  .period button {
    min-height: 40px;
    padding: 0 16px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
  }

  .period button[aria-checked='true'] {
    background: var(--surface);
    color: var(--fg);
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.12);
  }

  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .stat {
    display: grid;
    gap: 2px;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--line);
  }

  .stat-label {
    font-size: 13px;
    color: var(--muted);
  }

  .stat-value {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 19px;
  }

  .card {
    display: grid;
    gap: 8px;
    padding: 16px 12px 12px 8px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--line);
    min-width: 0;
  }

  .card h2 {
    font-size: 19px;
    padding-left: 8px;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    padding-left: 8px;
    font-size: 13px;
    color: var(--muted);
  }

  .key {
    display: inline-block;
    margin-left: 6px;
  }

  .key.line {
    width: 18px;
    height: 3px;
    border-radius: 2px;
    background: var(--accent);
  }

  .key.felt {
    width: 0;
    height: 14px;
    border-left: 2px dashed var(--felt);
  }

  .key.dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--sleep);
  }

  .journal-title {
    font-size: 22px;
    margin-top: 6px;
  }

  .day h3 {
    font-size: 15px;
    color: var(--muted);
    margin-bottom: 6px;
  }

  .day h3::first-letter {
    text-transform: uppercase;
  }

  .day ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }

  .day li {
    display: grid;
    grid-template-columns: 46px 16px 1fr;
    align-items: start;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--line);
  }

  .time {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    font-size: 15px;
    padding-top: 1px;
  }

  .mark {
    width: 16px;
    height: 16px;
    margin-top: 4px;
    border-radius: 50%;
    background: linear-gradient(var(--top), var(--bottom));
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.15);
  }

  .felt-mark {
    background: var(--felt);
  }

  .entry {
    display: grid;
    gap: 1px;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .detail {
    color: var(--muted);
    font-size: 15px;
  }

  .felt-label {
    color: var(--felt);
  }

  .quote {
    font-size: 15px;
    white-space: pre-line;
  }

  .empty {
    display: grid;
    gap: 8px;
    justify-items: start;
    padding: 20px 18px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--line);
  }

  .empty-title {
    font-weight: 700;
    font-size: 19px;
  }

  .empty p:not(.empty-title) {
    color: var(--muted);
  }

  .cta {
    margin-top: 6px;
    padding: 12px 20px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-fg);
    font-weight: 700;
    text-decoration: none;
  }

  .note {
    color: var(--muted);
    font-size: 14px;
    text-align: center;
  }
</style>
