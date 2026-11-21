package io.github.rectorbb4.monrenard;

import android.content.Context;
import android.os.Handler;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * Relève ce que la bague a gardé en mémoire : pas, pouls, stress, oxygène, sommeil, variabilité, batterie.
 * Une demande à la fois, comme Gadgetbridge (voir YawellRingDeviceSupport). Les réponses sont écrites telles
 * quelles dans un fichier : la page les décode à sa prochaine ouverture (src/data/ringParse.ts), ce qui
 * permet de relever la bague même appli fermée. Tout se passe sur le fil principal, sauf le fichier.
 */
final class RingSync {

    interface Link {
        void sendV1(byte[] packet);
        void sendV2(byte[] packet);
        boolean hasV2();
        void progress(String state, int done, int total);
    }

    /** La bague garde environ 7 jours. */
    private static final int DAYS = 7;
    private static final long FIRST_FRAME_MS = 8_000;
    /** Après un premier message, un silence veut dire que la réponse est finie (journée en cours). */
    private static final long QUIET_MS = 2_000;
    private static final long MAX_FILE = 8L * 1024 * 1024;
    /** Taille lue d'un coup par la page. */
    private static final int MAX_READ = 1024 * 1024;

    private static final class Step {
        final String kind;
        final int day;
        final int op;
        final byte[] packet;
        final boolean big;

        Step(String kind, int day, int op, byte[] packet, boolean big) {
            this.kind = kind;
            this.day = day;
            this.op = op;
            this.packet = packet;
            this.big = big;
        }
    }

    private final Context ctx;
    private final Handler main;
    private final Link link;
    private final ArrayDeque<Step> steps = new ArrayDeque<>();
    private final List<String> frames = new ArrayList<>();
    private final ByteArrayOutputStream bigFrame = new ByteArrayOutputStream();
    private Step current;
    private int total;
    private int done;
    private int hrPackets;
    private long at;

    private final Runnable timeout = this::finishStep;

    RingSync(Context ctx, Handler main, Link link) {
        this.ctx = ctx.getApplicationContext();
        this.main = main;
        this.link = link;
    }

    boolean running() {
        return current != null;
    }

    void start(long now) {
        if (running()) return;
        at = now;
        steps.clear();
        link.sendV1(timePacket());
        steps.add(new Step("battery", 0, 0x03, ColmiProtocol.packet(0x03), false));
        for (int d = 0; d < DAYS; d++) steps.add(new Step("steps", d, 0x43, ColmiProtocol.packet(0x43, d, 0x0f, 0x00, 0x5f, 0x01), false));
        for (int d = 0; d < DAYS; d++) steps.add(new Step("hr", d, 0x15, heartRateRequest(d), false));
        steps.add(new Step("stress", 0, 0x37, ColmiProtocol.packet(0x37), false));
        if (link.hasV2()) {
            steps.add(new Step("spo2", 0, 0x2a, new byte[] {(byte) 0xbc, 0x2a, 1, 0, (byte) 0xff, 0, (byte) 0xff}, true));
            steps.add(new Step("sleep", 0, 0x27, new byte[] {(byte) 0xbc, 0x27, 1, 0, (byte) 0xff, 0, (byte) 0xff}, true));
        }
        for (int d = 0; d < DAYS; d++) steps.add(new Step("hrv", d, 0x39, ColmiProtocol.packet(0x39, d, 0, 0, 0), false));
        total = steps.size();
        done = 0;
        link.progress("running", 0, total);
        next();
    }

    /** Connexion perdue : ce qui a déjà été relevé reste dans le fichier. */
    void stop() {
        main.removeCallbacks(timeout);
        boolean was = running();
        current = null;
        steps.clear();
        frames.clear();
        bigFrame.reset();
        if (was) link.progress("stopped", done, total);
    }

    /** Vrai si ce message répond à la demande en cours. */
    boolean onV1(byte[] v) {
        Step s = current;
        if (s == null || s.big || v.length < 2 || (v[0] & 0xff) != s.op) return false;
        frames.add(hex(v));
        if (isLast(s, v)) finishStep();
        else arm(QUIET_MS);
        return true;
    }

    void onV2(byte[] v) {
        Step s = current;
        if (s == null || !s.big) return;
        if (bigFrame.size() == 0 && (v.length < 6 || (v[0] & 0xff) != 0xbc || (v[1] & 0xff) != s.op)) return;
        bigFrame.write(v, 0, v.length);
        byte[] all = bigFrame.toByteArray();
        int length = (all[2] & 0xff) | ((all[3] & 0xff) << 8);
        if (all.length >= length + 6) {
            frames.add(hex(all));
            finishStep();
        } else {
            arm(QUIET_MS);
        }
    }

    private boolean isLast(Step s, byte[] v) {
        int sub = v[1] & 0xff;
        if (sub == 0xff) return true;
        switch (s.op) {
            case 0x03:
                return true;
            case 0x43:
                return sub != 0xf0 && v.length > 6 && (v[5] & 0xff) == (v[6] & 0xff) - 1;
            case 0x15:
                if (sub == 0) {
                    hrPackets = v[2] & 0xff;
                    return hrPackets == 0;
                }
                return sub == hrPackets - 1;
            default:
                return sub == 4;
        }
    }

    private void next() {
        main.removeCallbacks(timeout);
        frames.clear();
        bigFrame.reset();
        hrPackets = 0;
        current = steps.poll();
        if (current == null) {
            link.progress("done", total, total);
            return;
        }
        if (current.big) link.sendV2(current.packet);
        else link.sendV1(current.packet);
        arm(FIRST_FRAME_MS);
    }

    private void arm(long ms) {
        main.removeCallbacks(timeout);
        main.postDelayed(timeout, ms);
    }

    private void finishStep() {
        Step s = current;
        if (s == null) return;
        main.removeCallbacks(timeout);
        if (s.big && frames.isEmpty() && bigFrame.size() > 0) frames.add(hex(bigFrame.toByteArray()));
        if (!frames.isEmpty()) {
            try {
                JSONObject o = new JSONObject().put("k", s.kind).put("d", s.day).put("at", at).put("f", new JSONArray(frames));
                append(ctx, o.toString());
            } catch (Exception ignored) {
                // cette réponse sera relue à la prochaine synchronisation
            }
        }
        done++;
        link.progress("running", done, total);
        next();
    }

    /** Heure du téléphone, en décimal codé binaire : la bague date ses mesures avec. */
    private static byte[] timePacket() {
        Calendar c = Calendar.getInstance();
        return ColmiProtocol.packet(0x01, bcd(c.get(Calendar.YEAR) % 100), bcd(c.get(Calendar.MONTH) + 1), bcd(c.get(Calendar.DAY_OF_MONTH)),
                bcd(c.get(Calendar.HOUR_OF_DAY)), bcd(c.get(Calendar.MINUTE)), bcd(c.get(Calendar.SECOND)));
    }

    private static int bcd(int v) {
        return ((v / 10) << 4) | (v % 10);
    }

    /** Demande d'une journée de pouls : l'heure locale, écrite comme si c'était de l'UTC. */
    private static byte[] heartRateRequest(int daysAgo) {
        Calendar c = Calendar.getInstance();
        if (daysAgo != 0) {
            c.add(Calendar.DAY_OF_MONTH, -daysAgo);
            c.set(Calendar.HOUR_OF_DAY, 0);
            c.set(Calendar.MINUTE, 0);
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
        }
        long sec = (c.getTimeInMillis() + c.get(Calendar.ZONE_OFFSET) + c.get(Calendar.DST_OFFSET)) / 1000;
        return ColmiProtocol.packet(0x15, (int) (sec & 0xff), (int) ((sec >> 8) & 0xff), (int) ((sec >> 16) & 0xff), (int) ((sec >> 24) & 0xff));
    }

    private static String hex(byte[] v) {
        StringBuilder s = new StringBuilder(v.length * 2);
        for (byte b : v) s.append(String.format("%02x", b));
        return s.toString();
    }

    // ------------------------------------------------------------------ le fichier relu par la page

    private static File file(Context ctx) {
        return new File(ctx.getFilesDir(), "releves.jsonl");
    }

    /** Une minute de ceinture : pouls moyen et variabilité. */
    static void appendBelt(Context ctx, long minute, int hr, Double rmssd) {
        try {
            JSONObject o = new JSONObject().put("k", "belt").put("at", minute).put("hr", hr);
            if (rmssd != null) o.put("rmssd", rmssd);
            append(ctx, o.toString());
        } catch (Exception ignored) {
            // une minute de moins
        }
    }

    private static synchronized void append(Context ctx, String line) throws Exception {
        File f = file(ctx);
        if (f.length() > MAX_FILE) {
            // La page n'a pas été ouverte depuis très longtemps : on garde la moitié la plus récente
            String all = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
            int cut = all.indexOf('\n', all.length() / 2);
            Files.write(f.toPath(), all.substring(cut + 1).getBytes(StandardCharsets.UTF_8));
        }
        try (FileOutputStream out = new FileOutputStream(f, true)) {
            out.write((line + "\n").getBytes(StandardCharsets.UTF_8));
        }
    }

    /** Le début du fichier, coupé à la fin d'une ligne. */
    static synchronized String read(Context ctx) {
        try {
            File f = file(ctx);
            if (!f.exists()) return "";
            String all = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
            if (all.length() <= MAX_READ) return all;
            int end = all.lastIndexOf('\n', MAX_READ);
            return end < 0 ? all : all.substring(0, end + 1);
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
            // relu la prochaine fois : la base ne garde pas de doublons
        }
    }
}
