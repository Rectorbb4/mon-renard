package io.github.rectorbb4.monrenard;

import java.util.ArrayDeque;
import java.util.Arrays;

/**
 * Le renard du widget sent ton pouls, avec la même règle que sur l'accueil (src/fox/pulse.ts) :
 * médiane des 20 dernières secondes, agité à partir de 60 % de la montée, calme à nouveau sous 30 %.
 */
final class WidgetPulse {

    static final long WINDOW_MS = 20_000;
    private static final int MIN_SAMPLES = 3;
    /** L'agitation commence 20 battements sous le seuil d'alerte et atteint son maximum au seuil. */
    private static final int RAMP = 20;

    private final ArrayDeque<long[]> samples = new ArrayDeque<>();
    private boolean agitated;

    /** Note une mesure ; vrai si l'état du renard vient de changer. */
    boolean add(long now, int bpm, int threshold) {
        samples.addLast(new long[] {now, bpm});
        while (now - samples.peekFirst()[0] > WINDOW_MS) samples.removeFirst();
        if (samples.size() < MIN_SAMPLES) return false;
        double level = (median() - (threshold - RAMP)) / (double) RAMP;
        boolean next = agitated ? level >= 0.3 : level >= 0.6;
        boolean changed = next != agitated;
        agitated = next;
        return changed;
    }

    boolean isAgitated() {
        return agitated;
    }

    /** Plus de mesure : il se calme. Vrai s'il était agité. */
    boolean reset() {
        boolean was = agitated;
        agitated = false;
        samples.clear();
        return was;
    }

    private double median() {
        long[] v = new long[samples.size()];
        int i = 0;
        for (long[] s : samples) v[i++] = s[1];
        Arrays.sort(v);
        int m = v.length / 2;
        return v.length % 2 == 1 ? v[m] : (v[m - 1] + v[m]) / 2.0;
    }
}
