package io.github.rectorbb4.monrenard;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.OpenableColumns;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * Alerte « ton pouls monte » : quand le pouls des capteurs reste au-dessus du seuil pendant 30 secondes,
 * pendant une des plages horaires choisies, le téléphone sonne (son choisi, volume des alarmes) et vibre fort,
 * et une notification propose de respirer avec le renard. Marche appli fermée tant que les capteurs sont branchés.
 * Même règle que src/lib/pulseAlert.ts (les garder d'accord). Tout se passe sur le fil principal.
 */
final class PulseAlert {

    interface Listener {
        void onEvent(String name, String json);
    }

    static final String ACTION_STOP = "io.github.rectorbb4.monrenard.ALERT_STOP";
    static final String ACTION_SNOOZE = "io.github.rectorbb4.monrenard.ALERT_SNOOZE";

    private static final long SUSTAIN_MS = 30_000;
    private static final double SHARE_ABOVE = 0.8;
    private static final long COOLDOWN_MS = 15 * 60_000L;
    private static final long SNOOZE_MS = 60 * 60_000L;
    private static final long GAP_MS = 10_000;
    private static final long RING_MS = 60_000;
    private static final long TEST_MS = 5_000;
    private static final String CHANNEL = "alerte";
    private static final int NOTIFICATION = 2;

    private static PulseAlert instance;

    static synchronized PulseAlert get(Context ctx) {
        if (instance == null) instance = new PulseAlert(ctx.getApplicationContext());
        return instance;
    }

    private final Context ctx;
    private final SharedPreferences prefs;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ArrayDeque<long[]> samples = new ArrayDeque<>();
    private final Runnable autoStop = () -> stop(false);

    private boolean enabled;
    private int threshold = 100;
    private final List<int[]> slots = new ArrayList<>(); // {jours (bits, 0 = dimanche), début, fin}
    private long quietUntil;
    private MediaPlayer player;
    private volatile boolean ringing;
    private volatile int lastBpm;
    private volatile long lastAt;
    private Listener listener;
    /** L'appli est à l'écran : la page affiche l'alerte elle-même, pas besoin de notification. */
    static volatile boolean appVisible;

    private PulseAlert(Context ctx) {
        this.ctx = ctx;
        prefs = ctx.getSharedPreferences("alerte", Context.MODE_PRIVATE);
        readConfig(prefs.getString("config", null));
        quietUntil = prefs.getLong("snoozeUntil", 0);
    }

    void setListener(Listener l) {
        listener = l;
    }

    private void emit(String name, String json) {
        if (listener != null) listener.onEvent(name, json);
    }

    // ------------------------------------------------------------------ réglages

    /** Réglages envoyés par la page (même format que AlertConfig dans pulseAlert.ts). */
    void setConfig(String json) {
        if (readConfig(json)) prefs.edit().putString("config", json).apply();
    }

    private boolean readConfig(String json) {
        if (json == null) return false;
        try {
            JSONObject o = new JSONObject(json);
            boolean on = o.optBoolean("enabled", false);
            int t = Math.max(70, Math.min(160, o.optInt("threshold", 100)));
            List<int[]> list = new ArrayList<>();
            JSONArray a = o.optJSONArray("slots");
            if (a != null) {
                for (int i = 0; i < a.length(); i++) {
                    JSONObject s = a.getJSONObject(i);
                    JSONArray days = s.optJSONArray("days");
                    int bits = 0;
                    if (days != null) for (int j = 0; j < days.length(); j++) {
                        int d = days.optInt(j, -1);
                        if (d >= 0 && d <= 6) bits |= 1 << d;
                    }
                    int from = s.optInt("from", -1);
                    int to = s.optInt("to", -1);
                    if (from >= 0 && from < 1440 && to >= 0 && to < 1440) list.add(new int[] {bits, from, to});
                }
            }
            enabled = on;
            threshold = t;
            slots.clear();
            slots.addAll(list);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Est-on dans une plage horaire ? (une plage qui passe minuit compte pour le jour où elle commence) */
    boolean inSlots(long now) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        int day = c.get(Calendar.DAY_OF_WEEK) - 1;
        int minute = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
        int yesterday = (day + 6) % 7;
        for (int[] s : slots) {
            boolean today = (s[0] & (1 << day)) != 0;
            boolean before = (s[0] & (1 << yesterday)) != 0;
            if (s[1] == s[2]) {
                if (today) return true;
            } else if (s[1] < s[2]) {
                if (today && minute >= s[1] && minute < s[2]) return true;
            } else if ((today && minute >= s[1]) || (before && minute < s[2])) {
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------------ surveillance

    /** Un pouls des capteurs (ceinture prioritaire, déjà choisi par BleSensors). */
    void onHeart(int bpm, long now) {
        long[] last = samples.peekLast();
        if (last != null && now - last[0] > GAP_MS) samples.clear();
        samples.addLast(new long[] {now, bpm});
        while (!samples.isEmpty() && now - samples.peekFirst()[0] > SUSTAIN_MS) samples.removeFirst();

        if (!enabled || now < quietUntil || !inSlots(now)) return;
        if (now - samples.peekFirst()[0] < SUSTAIN_MS - 5000 || samples.size() < 5) return;
        int above = 0;
        for (long[] s : samples) if (s[1] >= threshold) above++;
        if (above < SHARE_ABOVE * samples.size()) return;

        quietUntil = now + COOLDOWN_MS;
        samples.clear();
        fire(bpm, false);
    }

    void snooze() {
        quietUntil = Math.max(quietUntil, System.currentTimeMillis() + SNOOZE_MS);
        prefs.edit().putLong("snoozeUntil", quietUntil).apply();
        samples.clear();
        stop(true);
    }

    // ------------------------------------------------------------------ sonnerie

    void fire(int bpm, boolean test) {
        stopSound();
        ringing = true;
        if (!test) {
            lastBpm = bpm;
            lastAt = System.currentTimeMillis();
        }
        playSound();
        vibrate();
        if (!test && !appVisible) notifyUser(bpm);
        emit("renard-alert", "{\"ringing\":true,\"bpm\":" + (test ? 0 : bpm) + ",\"test\":" + test + "}");
        main.removeCallbacks(autoStop);
        main.postDelayed(autoStop, test ? TEST_MS : RING_MS);
    }

    /** Arrête la sonnerie ; `cancel` retire aussi la notification. */
    void stop(boolean cancel) {
        main.removeCallbacks(autoStop);
        boolean was = ringing;
        stopSound();
        ringing = false;
        if (cancel) {
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm != null) nm.cancel(NOTIFICATION);
        }
        if (was) emit("renard-alert", "{\"ringing\":false}");
    }

    String stateJson() {
        // La dernière alerte n'est plus d'actualité au bout de 10 minutes
        boolean recent = System.currentTimeMillis() - lastAt < 10 * 60_000L;
        return "{\"ringing\":" + ringing + ",\"bpm\":" + (recent ? lastBpm : 0) + ",\"at\":" + lastAt + "}";
    }

    private void playSound() {
        Uri[] tries = {soundUri(), RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)};
        for (Uri uri : tries) {
            if (uri == null) continue;
            MediaPlayer p = new MediaPlayer();
            try {
                p.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                p.setDataSource(ctx, uri);
                p.setLooping(true);
                p.prepare();
                p.start();
                player = p;
                return;
            } catch (Exception e) {
                p.release();
            }
        }
    }

    private Vibrator vibrator() {
        if (Build.VERSION.SDK_INT >= 31) {
            VibratorManager vm = ctx.getSystemService(VibratorManager.class);
            return vm != null ? vm.getDefaultVibrator() : null;
        }
        return ctx.getSystemService(Vibrator.class);
    }

    /** Longues vibrations à pleine force, en boucle (comme un réveil). */
    @SuppressWarnings("deprecation")
    private void vibrate() {
        Vibrator v = vibrator();
        if (v == null || !v.hasVibrator()) return;
        long[] timings = {0, 900, 250, 900, 250, 900, 700};
        int[] amplitudes = {0, 255, 0, 255, 0, 255, 0};
        VibrationEffect effect = v.hasAmplitudeControl()
                ? VibrationEffect.createWaveform(timings, amplitudes, 0)
                : VibrationEffect.createWaveform(timings, 0);
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                v.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM));
            } else {
                v.vibrate(effect, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
            }
        } catch (Exception e) {
            // Pas de vibreur utilisable
        }
    }

    private void stopSound() {
        if (player != null) {
            try {
                player.stop();
            } catch (Exception e) {
                // déjà arrêté
            }
            player.release();
            player = null;
        }
        Vibrator v = vibrator();
        if (v != null) v.cancel();
    }

    private void notifyUser(int bpm) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Alerte pouls", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Quand ton pouls monte pendant tes plages horaires");
            // Le son et la vibration sont joués par l'appli (volume des alarmes, même en silencieux)
            ch.setSound(null, null);
            ch.enableVibration(false);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("monrenard://action/alert"), ctx, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(ctx, 20, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stopPi = PendingIntent.getBroadcast(ctx, 21, new Intent(ctx, Receiver.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent snoozePi = PendingIntent.getBroadcast(ctx, 22, new Intent(ctx, Receiver.class).setAction(ACTION_SNOOZE), PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = new Notification.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_notif_heart)
                .setContentTitle("Ton pouls monte : " + bpm)
                .setContentText("Pause : respire avec ton renard, deux minutes.")
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(openPi)
                .setAutoCancel(true)
                .addAction(new Notification.Action.Builder(null, "Arrêter", stopPi).build())
                .addAction(new Notification.Action.Builder(null, "Pas maintenant (1 h)", snoozePi).build());
        // Écran éteint : l'alerte s'affiche en grand (si Android le permet ; sinon, notification en haut de l'écran)
        if (Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent()) b.setFullScreenIntent(openPi, true);
        try {
            nm.notify(NOTIFICATION, b.build());
        } catch (SecurityException e) {
            // Notifications refusées : le son et la vibration suffisent
        }
    }

    // ------------------------------------------------------------------ son choisi

    Uri soundUri() {
        String s = prefs.getString("sound", null);
        return s != null ? Uri.parse(s) : null;
    }

    String soundName() {
        String name = prefs.getString("soundName", null);
        return name != null ? name : "Alarme du téléphone";
    }

    /** Son choisi dans le sélecteur d'Android (null = son d'alarme par défaut). */
    void setSound(Uri uri, boolean music) {
        SharedPreferences.Editor e = prefs.edit();
        if (uri == null) {
            e.remove("sound").remove("soundName");
        } else {
            e.putString("sound", uri.toString()).putString("soundName", titleOf(uri, music));
        }
        e.apply();
        emit("renard-alert-sound", "{}");
    }

    private String titleOf(Uri uri, boolean music) {
        if (music) {
            try (Cursor c = ctx.getContentResolver().query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    String n = c.getString(0);
                    if (n != null) return n.replaceAll("\\.[A-Za-z0-9]{2,4}$", "");
                }
            } catch (Exception ignored) {
                // nom illisible
            }
            return "Ta musique";
        }
        try {
            Ringtone r = RingtoneManager.getRingtone(ctx, uri);
            if (r != null) return r.getTitle(ctx);
        } catch (Exception ignored) {
            // nom illisible
        }
        return "Sonnerie choisie";
    }

    /** Boutons de la notification : « Arrêter » et « Pas maintenant (1 h) ». */
    public static class Receiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            PulseAlert a = get(context);
            if (ACTION_SNOOZE.equals(intent.getAction())) a.snooze();
            else a.stop(true);
        }
    }
}
