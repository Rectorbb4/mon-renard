package io.github.rectorbb4.monrenard;

import java.util.ArrayDeque;

/**
 * La pause de la bague : au moins quatre tapotements en trois secondes.
 * Un mouvement de la main peut envoyer la même touche qu'un tapotement : avec trois, il lançait de fausses pauses.
 */
final class TapRule {

    static final int COUNT = 4;
    static final long WINDOW_MS = 3_000;
    /** Plus rapide qu'un vrai tapotement : un frottement ou une touche reçue deux fois ne compte qu'une fois. */
    private static final long SAME_TAP_MS = 120;

    private final ArrayDeque<Long> taps = new ArrayDeque<>();
    private long seriesStart;

    /** Note un tapotement ; vrai quand il complète la série (elle repart alors de zéro). */
    boolean add(long now) {
        Long last = taps.peekLast();
        if (last != null && now - last < SAME_TAP_MS) return false;
        while (!taps.isEmpty() && now - taps.peekFirst() > WINDOW_MS) taps.removeFirst();
        taps.addLast(now);
        if (taps.size() < COUNT) return false;
        seriesStart = taps.peekFirst();
        taps.clear();
        return true;
    }

    /** Le premier tapotement de la dernière série complète. */
    long seriesStart() {
        return seriesStart;
    }

    void clear() {
        taps.clear();
    }
}
