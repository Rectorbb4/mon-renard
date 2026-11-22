package io.github.rectorbb4.monrenard;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/**
 * Garde en permanence les dernières secondes de pouls. Quand une pause est demandée (bague, bouton),
 * enregistre les 10 secondes avant le début du geste et les 10 secondes après, même appli fermée.
 * Le résultat attend dans un fichier que la page le range avec le moment (src/data/moments.ts).
 * Tout se passe sur le fil principal, sauf la lecture du fichier par la page.
 */
final class MomentCapture {

    static final long BEFORE_MS = 10_000;
    static final long AFTER_MS = 10_000;
    /** Le geste dure jusqu'à 3 secondes : la mémoire couvre les 10 secondes d'avant son premier tapotement. */
    private static final long KEEP_MS = BEFORE_MS + TapRule.WINDOW_MS + 1_000;
    /** Laisse arriver la dernière mesure de la fenêtre. */
    private static final long FINISH_GRACE_MS = 1_500;
    private static final long MAX_FILE = 2L * 1024 * 1024;

    /** Prévenu quand un moment est prêt, pour que la page le range tout de suite si elle est ouverte. */
    interface Listener {
        void onReady();
    }

    private static MomentCapture instance;

    static synchronized MomentCapture get(Context ctx) {
        if (instance == null) instance = new MomentCapture(ctx.getApplicationContext());
        return instance;
    }

    private static final class Pending {
        final long at;
        final long start;
        final List<long[]> hr = new ArrayList<>();
        final List<long[]> rr = new ArrayList<>();
        boolean done;

        Pending(long at, long start) {
            this.at = at;
            this.start = start;
        }

        boolean covers(long t) {
            return t >= start - BEFORE_MS && t <= start + AFTER_MS;
        }
    }

    private final Context ctx;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ArrayDeque<long[]> hrMemory = new ArrayDeque<>();
    private final ArrayDeque<long[]> rrMemory = new ArrayDeque<>();
    private final List<Pending> pending = new ArrayList<>();
    private Listener listener;

    private MomentCapture(Context ctx) {
        this.ctx = ctx;
    }

    void setListener(Listener l) {
        listener = l;
    }

    /** Une mesure retenue par {@link BleSensors} (ceinture prioritaire sur la bague). */
    void onReading(String kind, int bpm, List<Integer> rr, long now) {
        // Troisième case : 1 si la mesure vient de la ceinture
        long[] h = {now, bpm, BleSensors.BELT.equals(kind) ? 1 : 0};
        hrMemory.addLast(h);
        List<long[]> beats = beatsOf(rr, now);
        rrMemory.addAll(beats);
        while (!hrMemory.isEmpty() && now - hrMemory.peekFirst()[0] > KEEP_MS) hrMemory.removeFirst();
        while (!rrMemory.isEmpty() && now - rrMemory.peekFirst()[0] > KEEP_MS) rrMemory.removeFirst();

        for (Pending p : new ArrayList<>(pending)) {
            if (p.covers(now)) p.hr.add(h);
            for (long[] b : beats) if (p.covers(b[0])) p.rr.add(b);
            if (now > p.start + AFTER_MS) finish(p);
        }
    }

    /** Un paquet peut porter plusieurs battements : chacun est daté en remontant depuis la réception. */
    private static List<long[]> beatsOf(List<Integer> rr, long now) {
        List<long[]> out = new ArrayList<>();
        if (rr == null) return out;
        long t = now;
        for (int i = rr.size() - 1; i >= 0; i--) {
            int v = rr.get(i);
            out.add(0, new long[] {t, v});
            t -= v;
        }
        return out;
    }

    /** Une pause vient d'être demandée : `at` est son instant dans le journal, `start` le début du geste. */
    void begin(long at, long start) {
        Pending p = new Pending(at, Math.min(at, start));
        for (long[] h : hrMemory) if (p.covers(h[0])) p.hr.add(h);
        for (long[] b : rrMemory) if (p.covers(b[0])) p.rr.add(b);
        pending.add(p);
        main.postDelayed(() -> finish(p), Math.max(0, p.start + AFTER_MS - at) + FINISH_GRACE_MS);
    }

    private void finish(Pending p) {
        if (p.done) return;
        p.done = true;
        pending.remove(p);
        try {
            JSONObject o = new JSONObject().put("at", p.at).put("start", p.start);
            int fromBelt = 0;
            for (long[] h : p.hr) fromBelt += (int) h[2];
            // La ceinture a pu être retirée pendant la fenêtre : on nomme celui qui a donné le plus de mesures
            if (!p.hr.isEmpty()) o.put("src", fromBelt * 2 >= p.hr.size() ? BleSensors.BELT : BleSensors.RING);
            o.put("hr", relative(p.hr, p.start));
            o.put("rr", relative(p.rr, p.start));
            append(ctx, o.toString());
        } catch (Exception ignored) {
            // ce moment reste dans le journal, sans ses mesures
        }
        if (listener != null) listener.onReady();
    }

    private static JSONArray relative(List<long[]> list, long start) {
        JSONArray a = new JSONArray();
        for (long[] v : list) a.put(new JSONArray().put(v[0] - start).put(v[1]));
        return a;
    }

    // ------------------------------------------------------------------ fichier

    private static File file(Context ctx) {
        return new File(ctx.getFilesDir(), "moments.jsonl");
    }

    private static synchronized void append(Context ctx, String line) throws Exception {
        File f = file(ctx);
        if (f.length() > MAX_FILE) {
            String all = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
            int cut = all.indexOf('\n', all.length() / 2);
            Files.write(f.toPath(), all.substring(cut + 1).getBytes(StandardCharsets.UTF_8));
        }
        try (FileOutputStream out = new FileOutputStream(f, true)) {
            out.write((line + "\n").getBytes(StandardCharsets.UTF_8));
        }
    }

    static synchronized String read(Context ctx) {
        try {
            File f = file(ctx);
            return f.exists() ? new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8) : "";
        } catch (Exception e) {
            return "";
        }
    }

    /** La page a bien rangé les `chars` premiers caractères. */
    static synchronized void ack(Context ctx, int chars) {
        try {
            File f = file(ctx);
            if (!f.exists() || chars <= 0) return;
            String all = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
            if (chars >= all.length()) {
                if (!f.delete()) Files.write(f.toPath(), new byte[0]);
            } else {
                Files.write(f.toPath(), all.substring(chars).getBytes(StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) {
            // relu la prochaine fois : ranger deux fois le même moment ne change rien
        }
    }
}
