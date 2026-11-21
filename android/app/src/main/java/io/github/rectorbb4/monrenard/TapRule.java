package io.github.rectorbb4.monrenard;

import java.util.ArrayDeque;

/** La pause de la bague : au moins trois tapotements en trois secondes. */
final class TapRule {

    static final int COUNT = 3;
    static final long WINDOW_MS = 3_000;
    /** Une même touche reçue deux fois de suite ne compte qu'une fois. */
    private static final long SAME_TAP_MS = 60;

    private final ArrayDeque<Long> taps = new ArrayDeque<>();

    /** Note un tapotement ; vrai quand il complète la série (elle repart alors de zéro). */
    boolean add(long now) {
        Long last = taps.peekLast();
        if (last != null && now - last < SAME_TAP_MS) return false;
        while (!taps.isEmpty() && now - taps.peekFirst() > WINDOW_MS) taps.removeFirst();
        taps.addLast(now);
        if (taps.size() < COUNT) return false;
        taps.clear();
        return true;
    }

    void clear() {
        taps.clear();
    }
}
