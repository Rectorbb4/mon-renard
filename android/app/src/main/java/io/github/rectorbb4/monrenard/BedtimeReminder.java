package io.github.rectorbb4.monrenard;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import java.util.Calendar;
import java.util.Locale;

/**
 * Le rappel une heure avant l'heure de coucher choisie.
 * Alarme ordinaire, sans autorisation d'alarme exacte : le téléphone peut la décaler de quelques minutes.
 */
public class BedtimeReminder extends BroadcastReceiver {

    private static final String PREFS = "bedtime";
    private static final String KEY_ON = "on";
    private static final String KEY_BED = "bed";
    private static final String EXTRA_AT = "at";
    private static final String CHANNEL = "coucher";
    private static final int NOTIFICATION = 40;
    private static final int REQUEST = 40;
    private static final int OPEN_REQUEST = 41;
    /** Passé ce retard, le coucher est trop proche pour que le rappel ait encore un sens. */
    private static final long TOO_LATE = 45 * 60_000L;

    /** Enregistre le réglage et prépare le prochain rappel, ou l'annule. */
    static void configure(Context context, boolean on, int bedMinutes) {
        int bed = Math.floorMod(bedMinutes, 1440);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean(KEY_ON, on)
                .putInt(KEY_BED, bed)
                .apply();
        if (on) schedule(context, bed);
        else cancel(context);
    }

    /** Après un redémarrage ou une mise à jour, les alarmes ont disparu. */
    static void restore(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (p.getBoolean(KEY_ON, false) && p.contains(KEY_BED)) schedule(context, p.getInt(KEY_BED, 0));
    }

    /** Le prochain passage à l'heure du rappel : une heure avant le coucher. */
    static long nextAt(int bedMinutes, long now) {
        int minutes = Math.floorMod(bedMinutes - 60, 1440);
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        c.set(Calendar.HOUR_OF_DAY, minutes / 60);
        c.set(Calendar.MINUTE, minutes % 60);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        if (c.getTimeInMillis() <= now) c.add(Calendar.DAY_OF_MONTH, 1);
        return c.getTimeInMillis();
    }

    private static PendingIntent alarmIntent(Context context, long at) {
        Intent i = new Intent(context, BedtimeReminder.class).putExtra(EXTRA_AT, at);
        return PendingIntent.getBroadcast(context, REQUEST, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static void schedule(Context context, int bedMinutes) {
        AlarmManager am = context.getSystemService(AlarmManager.class);
        if (am == null) return;
        long at = nextAt(bedMinutes, System.currentTimeMillis());
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarmIntent(context, at));
    }

    private static void cancel(Context context) {
        AlarmManager am = context.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(alarmIntent(context, 0));
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(NOTIFICATION);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!p.getBoolean(KEY_ON, false)) return;
        int bed = p.getInt(KEY_BED, 0);
        long planned = intent.getLongExtra(EXTRA_AT, 0);
        if (planned == 0 || System.currentTimeMillis() - planned < TOO_LATE) show(context, bed);
        schedule(context, bed);
    }

    private static void show(Context context, int bed) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Rappel de coucher", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Une heure avant l'heure de coucher que tu as choisie");
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(context, OPEN_REQUEST, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String clock = String.format(Locale.FRANCE, "%02d:%02d", bed / 60, bed % 60);
        Notification n = new Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_notif_heart)
                .setContentTitle("Ton terrier t'attend dans une heure")
                .setContentText("Endors-toi avant " + clock + " pour ta noisette.")
                .setContentIntent(openPi)
                .setAutoCancel(true)
                .build();
        nm.notify(NOTIFICATION, n);
    }
}
