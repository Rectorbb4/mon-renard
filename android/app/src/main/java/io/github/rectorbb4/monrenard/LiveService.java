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
 * Garde le pouls du widget « en direct » quand l'appli passe en arrière-plan (la page web, elle, s'arrête).
 * Deux cas :
 *  - des capteurs sont branchés ({@link BleSensors}) : le service garde l'appli en vie pour que la connexion
 *    Bluetooth continue, et c'est BleSensors qui met le widget à jour ;
 *  - sinon, la démo : le service continue la simulation (valeurs inventées), toutes les 5 s.
 * Android impose une notification tant que le service tourne ; il s'arrête au retour dans l'appli, depuis la
 * notification, ou tout seul au bout d'un moment (1 h pour la démo, 4 h pour les capteurs).
 */
public class LiveService extends Service {

    static final String ACTION_STOP = "io.github.rectorbb4.monrenard.STOP_LIVE";
    private static final String CHANNEL = "direct";
    private static final int NOTIFICATION = 1;
    private static final long EVERY = 5000;
    private static final long MAX_DEMO = 3600_000L;
    private static final long MAX_SENSORS = 4 * 3600_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Random random = new Random();
    private double base;
    private double drift;
    private long started;
    private boolean sensors;
    /** Android plante si le service est arrêté avant d'avoir pris sa notification : l'arrêt attend ce moment. */
    private static boolean starting;
    private static boolean stopAfterStart;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            long now = System.currentTimeMillis();
            // La pause doit rester disponible toute la journée : pas de limite avec la bague ou le bouton
            boolean allDay = sensors && BleSensors.get(LiveService.this).staysOn();
            if (!allDay && now - started > (sensors ? MAX_SENSORS : MAX_DEMO)) {
                stopFromOutside(LiveService.this);
                return;
            }
            if (sensors) {
                // Les capteurs ont pu s'arrêter tout seuls (erreur) : plus rien à garder en vie
                if (!BleSensors.get(LiveService.this).anyActive()) {
                    stop(LiveService.this);
                    return;
                }
            } else {
                // Même allure que le simulateur de l'appli (src/sensors/simulator.ts), en plus simple
                drift = Math.max(-6, Math.min(6, drift * 0.9 + (random.nextDouble() * 2 - 1) * 1.5));
                double breath = 3 * Math.sin(2 * Math.PI * (now / 1000.0) / 5.5);
                int bpm = (int) Math.round(base + drift + breath);
                WidgetState.saveLive(LiveService.this, bpm, true);
                FoxWidget.updateLive(LiveService.this);
            }
            handler.postDelayed(this, EVERY);
        }
    };

    /** Démarre le relais si des capteurs sont branchés ou si un pouls de démo est affiché (appelé quand l'appli quitte l'écran). */
    static void startIfLive(Context ctx) {
        boolean withSensors = BleSensors.get(ctx).anyActive();
        if (!withSensors) {
            WidgetState s = WidgetState.load(ctx);
            if (s.liveBpm(System.currentTimeMillis()) <= 0 || !s.liveSimulated) return;
        }
        try {
            starting = true;
            stopAfterStart = false;
            ctx.startForegroundService(new Intent(ctx, LiveService.class));
        } catch (Exception e) {
            starting = false;
            // Démarrage refusé par Android : le pouls disparaît du widget, comme avant
            if (withSensors) BleSensors.get(ctx).stopAll("Android n'a pas permis de continuer la mesure en arrière-plan.");
            WidgetState.saveLive(ctx, 0, false);
            FoxWidget.updateLive(ctx);
        }
    }

    /** L'appli revient : la page reprend la main (les capteurs, eux, restent connectés). */
    static void stop(Context ctx) {
        if (starting) {
            stopAfterStart = true;
            return;
        }
        ctx.stopService(new Intent(ctx, LiveService.class));
    }

    /** Arrêt demandé hors de l'appli (notification, durée maximale) : la mesure s'éteint aussi dans l'appli. */
    static void stopFromOutside(Context ctx) {
        BleSensors ble = BleSensors.get(ctx);
        if (ble.anyActive()) {
            ble.stopAll("Mesure arrêtée depuis la notification.");
        } else {
            ctx.getSharedPreferences("widget", MODE_PRIVATE).edit().putBoolean("liveStoppedOutside", true).apply();
        }
        WidgetState.saveLive(ctx, 0, false);
        FoxWidget.updateLive(ctx);
        stop(ctx);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            // Arrêt voulu : les capteurs ne reviennent plus tout seuls
            BleSensors.get(this).forgetAll();
            stopFromOutside(this);
            return START_NOT_STICKY;
        }
        sensors = BleSensors.get(this).anyActive();
        Notification n = notification();
        try {
            if (sensors) startForeground(NOTIFICATION, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
            else if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(NOTIFICATION, n);
        } catch (Exception e) {
            starting = false;
            stopAfterStart = false;
            // Refusé (autorisation manquante…) : on s'arrête proprement
            if (sensors) BleSensors.get(this).stopAll("Android n'a pas permis de continuer la mesure en arrière-plan.");
            stopSelf();
            return START_NOT_STICKY;
        }
        starting = false;
        if (stopAfterStart) {
            // L'appli est revenue à l'écran pendant le démarrage
            stopAfterStart = false;
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
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
        String label = BleSensors.get(this).activeLabel();
        String title = sensors ? "Mesure en direct" : "Démo en direct";
        String text = sensors
                ? Character.toUpperCase(label.charAt(0)) + label.substring(1)
                        + (label.equals("bouton pause") ? " : prêt, appuie deux fois pour faire une pause."
                                : label.contains("bague") ? " : relevés et pause prêts." : " : le widget suit ton pouls.")
                : "Le widget affiche un pouls simulé (valeurs inventées).";
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_notif_heart)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(openPi)
                .addAction(new Notification.Action.Builder(null, sensors ? "Arrêter la mesure" : "Arrêter la démo", stopPi).build())
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
