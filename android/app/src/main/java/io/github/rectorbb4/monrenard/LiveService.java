package io.github.rectorbb4.monrenard;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import java.util.Random;

/**
 * Garde le pouls du widget « en direct » quand l'appli passe en arrière-plan.
 * Pour l'instant, seule la démo existe : le service continue la simulation (valeurs inventées), toutes les 5 s.
 * Plus tard, c'est ici que vivra la connexion Bluetooth à la ceinture (la page web, elle, s'arrête en arrière-plan).
 * Android impose une notification tant que le service tourne ; il s'arrête au retour dans l'appli, depuis la
 * notification, ou tout seul au bout d'une heure.
 */
public class LiveService extends Service {

    static final String ACTION_STOP = "io.github.rectorbb4.monrenard.STOP_LIVE";
    private static final String CHANNEL = "direct";
    private static final int NOTIFICATION = 1;
    private static final long EVERY = 5000;
    private static final long MAX_DURATION = 3600_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Random random = new Random();
    private double base;
    private double drift;
    private long started;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            long now = System.currentTimeMillis();
            if (now - started > MAX_DURATION) {
                stopFromOutside(LiveService.this);
                return;
            }
            // Même allure que le simulateur de l'appli (src/sensors/simulator.ts), en plus simple
            drift = Math.max(-6, Math.min(6, drift * 0.9 + (random.nextDouble() * 2 - 1) * 1.5));
            double breath = 3 * Math.sin(2 * Math.PI * (now / 1000.0) / 5.5);
            int bpm = (int) Math.round(base + drift + breath);
            WidgetState.saveLive(LiveService.this, bpm, true);
            FoxWidget.updateLive(LiveService.this);
            handler.postDelayed(this, EVERY);
        }
    };

    /** Démarre le relais si un pouls de démo est affiché (appelé quand l'appli quitte l'écran). */
    static void startIfLive(Context ctx) {
        WidgetState s = WidgetState.load(ctx);
        if (s.liveBpm(System.currentTimeMillis()) <= 0 || !s.liveSimulated) return;
        try {
            ctx.startForegroundService(new Intent(ctx, LiveService.class));
        } catch (Exception e) {
            // Démarrage refusé par Android : le pouls disparaît du widget, comme avant
            WidgetState.saveLive(ctx, 0, false);
            FoxWidget.updateLive(ctx);
        }
    }

    /** L'appli revient : la page reprend les mesures. */
    static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, LiveService.class));
    }

    /** Arrêt demandé hors de l'appli (notification, durée maximale) : la démo s'éteint aussi dans l'appli. */
    static void stopFromOutside(Context ctx) {
        WidgetState.saveLive(ctx, 0, false);
        ctx.getSharedPreferences("widget", MODE_PRIVATE).edit().putBoolean("liveStoppedOutside", true).apply();
        FoxWidget.updateLive(ctx);
        stop(ctx);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopFromOutside(this);
            return START_NOT_STICKY;
        }
        Notification n = notification();
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(NOTIFICATION, n);
        WidgetState s = WidgetState.load(this);
        base = s.liveBpm > 0 ? s.liveBpm : 70;
        drift = 0;
        started = System.currentTimeMillis();
        handler.removeCallbacks(tick);
        handler.postDelayed(tick, EVERY);
        return START_NOT_STICKY;
    }

    private Notification notification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Mesures en direct", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Pendant que le widget affiche ton pouls en direct");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(this, 10, open, PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stopPi = PendingIntent.getService(this, 11, new Intent(this, LiveService.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_notif_heart)
                .setContentTitle("Démo en direct")
                .setContentText("Le widget affiche un pouls simulé (valeurs inventées).")
                .setContentIntent(openPi)
                .addAction(new Notification.Action.Builder(null, "Arrêter la démo", stopPi).build())
                .setOngoing(true)
                .setShowWhen(false)
                .build();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
