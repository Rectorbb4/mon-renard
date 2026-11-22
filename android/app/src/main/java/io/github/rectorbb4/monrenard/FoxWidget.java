package io.github.rectorbb4.monrenard;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.content.res.Resources;
import android.net.Uri;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

import java.util.Calendar;
import java.util.Locale;

/**
 * Widget du renard, animé et sans fond : il prend l'humeur du dernier check-in, et il somnole la nuit.
 * Android le redessine toutes les 30 minutes (voir res/xml/widget_*_info.xml) et à chaque check-in.
 */
public abstract class FoxWidget extends AppWidgetProvider {

    /** Disposition du widget (petit ou grand). */
    protected abstract boolean large();

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        RemoteViews views = build(ctx, large(), System.currentTimeMillis());
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    /** Redessine tous les widgets posés. */
    static void updateAll(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        long now = System.currentTimeMillis();
        int[] small = manager.getAppWidgetIds(new ComponentName(ctx, FoxWidgetSmall.class));
        int[] large = manager.getAppWidgetIds(new ComponentName(ctx, FoxWidgetLarge.class));
        if (small.length > 0) {
            RemoteViews v = build(ctx, false, now);
            for (int id : small) manager.updateAppWidget(id, v);
        }
        if (large.length > 0) {
            RemoteViews v = build(ctx, true, now);
            for (int id : large) manager.updateAppWidget(id, v);
        }
    }

    static boolean isNight(long now) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        int h = c.get(Calendar.HOUR_OF_DAY);
        return h >= 22 || h < 7;
    }

    static boolean sameDay(long a, long b) {
        Calendar x = Calendar.getInstance();
        x.setTimeInMillis(a);
        Calendar y = Calendar.getInstance();
        y.setTimeInMillis(b);
        return x.get(Calendar.YEAR) == y.get(Calendar.YEAR) && x.get(Calendar.DAY_OF_YEAR) == y.get(Calendar.DAY_OF_YEAR);
    }

    static String clock(long at) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(at);
        return String.format(Locale.FRANCE, "%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE));
    }

    /** La phrase sous l'humeur. */
    static String caption(WidgetState s, long now) {
        if (s.mood == null) return "Dis-lui comment tu vas";
        if (isNight(now)) return "Il se repose. Bonne nuit.";
        if (sameDay(s.lastCheckIn, now)) return "Check-in à " + clock(s.lastCheckIn);
        return "Il attend de tes nouvelles";
    }

    /**
     * Le renard animé : une boucle fluide par humeur, jouée par Android sans réveiller l'appli.
     * La nuit, une boucle plus lente, yeux mi-clos. Les boucles sont fabriquées par tools/render-widget.mjs.
     */
    static void animate(Context ctx, RemoteViews v, String mood, boolean night, boolean agitated) {
        Resources res = ctx.getResources();
        String pkg = ctx.getPackageName();
        // Le pouls qui monte le réveille, même la nuit ; son humeur ne change pas
        String suffix = agitated ? "_agite" : night ? "_nuit" : "";
        int image = mood != null ? res.getIdentifier("fox_anim_" + mood + suffix, "drawable", pkg) : 0;
        if (image == 0) image = res.getIdentifier("fox_anim_equilibre" + suffix, "drawable", pkg);
        v.setImageViewResource(R.id.fox, image);
        v.setViewVisibility(R.id.zz, night && !agitated ? View.VISIBLE : View.GONE);
    }

    static RemoteViews build(Context ctx, boolean large, long now) {
        WidgetState s = WidgetState.load(ctx);
        boolean night = isNight(now);
        String label = s.mood != null && s.label != null && !s.label.isEmpty() ? s.label : "Ton renard";

        RemoteViews v = new RemoteViews(ctx.getPackageName(), large ? R.layout.widget_large : R.layout.widget_small);
        boolean agitated = s.agitated && s.liveBpm(now) > 0;
        animate(ctx, v, s.mood, night, agitated);
        v.setContentDescription(R.id.fox, "Ton renard. Humeur : " + label + (agitated ? ". Il sent ton pouls monter." : ""));
        v.setTextViewText(R.id.mood, label);
        v.setOnClickPendingIntent(android.R.id.background, open(ctx, null));
        heart(v, s, now);
        if (large) {
            gauges(ctx, v, s, now);
            v.setOnClickPendingIntent(R.id.btn_checkin, open(ctx, "checkin"));
            v.setOnClickPendingIntent(R.id.btn_feel, open(ctx, "feel"));
        }
        return v;
    }

    /** Au-delà, les jauges sont pâlies : elles parlent d'un check-in ancien (comme dans l'appli). */
    static final long STALE_AFTER = 12 * 3600_000L;

    /**
     * Les jauges du grand widget, comme dans l'appli : humeur centrée sur l'équilibre
     * (barre vers la gauche quand elle baisse, vers la droite quand elle monte), énergie, nuit notée aujourd'hui.
     */
    static void gauges(Context ctx, RemoteViews v, WidgetState s, long now) {
        if (s.mood == null) {
            v.setViewVisibility(R.id.gauges, View.GONE);
            v.setViewVisibility(R.id.caption, View.VISIBLE);
            v.setTextViewText(R.id.caption, caption(s, now));
            return;
        }
        v.setViewVisibility(R.id.gauges, View.VISIBLE);
        v.setViewVisibility(R.id.caption, View.GONE);
        int mood = Math.round(Math.abs(s.score) * 100);
        v.setProgressBar(R.id.g_mood_low, 100, s.score < 0 ? mood : 0, false);
        v.setProgressBar(R.id.g_mood_high, 100, s.score > 0 ? mood : 0, false);
        v.setProgressBar(R.id.g_energy, 100, Math.round(s.energy * 100), false);
        boolean sleepToday = s.sleepAt > 0 && sameDay(s.sleepAt, now);
        v.setProgressBar(R.id.g_sleep, 100, sleepToday ? Math.round(s.sleep * 100) : 0, false);

        boolean stale = now - s.lastCheckIn > STALE_AFTER;
        int iconAlpha = stale ? 110 : 255;
        v.setInt(R.id.i_mood, "setImageAlpha", iconAlpha);
        v.setInt(R.id.i_energy, "setImageAlpha", iconAlpha);
        v.setInt(R.id.i_sleep, "setImageAlpha", sleepToday ? iconAlpha : 110);
        // Android 12 et plus : barres pâlies quand le check-in est ancien
        if (Build.VERSION.SDK_INT >= 31) {
            v.setColorStateList(R.id.g_mood_low, "setProgressTintList", ColorStateList.valueOf(ctx.getColor(stale ? R.color.gauge_stale : R.color.mood_low)));
            v.setColorStateList(R.id.g_mood_high, "setProgressTintList", ColorStateList.valueOf(ctx.getColor(stale ? R.color.gauge_stale : R.color.accent)));
            v.setColorStateList(R.id.g_energy, "setProgressTintList", ColorStateList.valueOf(ctx.getColor(stale ? R.color.gauge_stale : R.color.energy)));
            v.setColorStateList(R.id.g_sleep, "setProgressTintList", ColorStateList.valueOf(ctx.getColor(stale ? R.color.gauge_stale : R.color.sleep)));
        }
        // Une nuit mesurée se dit en durée : la bague ne juge pas de sa qualité
        String sleepWord = !sleepToday ? "pas notée"
                : s.sleepMinutes > 0 ? (s.sleepMinutes / 60) + " heures " + (s.sleepMinutes % 60)
                : sleepLabel(s.sleep);
        v.setContentDescription(R.id.gauges, "Humeur " + s.label + ", énergie " + energyLabel(s.energy) + ", nuit " + sleepWord
                + (stale ? ". Dernier check-in il y a plus de 12 heures." : ""));
    }

    /** Mêmes mots que l'appli (src/lib/labels.ts). */
    static String energyLabel(float v) {
        if (v < 0.2f) return "à plat";
        if (v < 0.4f) return "fatigue";
        if (v < 0.6f) return "ça va";
        if (v < 0.8f) return "en forme";
        return "pleine forme";
    }

    static String sleepLabel(float v) {
        String[] words = {"très mauvaise", "mauvaise", "moyenne", "bonne", "très bonne"};
        return words[Math.max(0, Math.min(4, Math.round(v * 4)))];
    }

    /** Le pouls en direct, pendant que l'appli tourne (« démo » tant que les valeurs sont simulées). */
    static void heart(RemoteViews v, WidgetState s, long now) {
        int bpm = s.liveBpm(now);
        if (bpm <= 0) {
            v.setViewVisibility(R.id.heart, View.GONE);
            return;
        }
        v.setViewVisibility(R.id.heart, View.VISIBLE);
        v.setTextViewText(R.id.heart, "♥ " + bpm + (s.liveSimulated ? " · démo" : ""));
        v.setContentDescription(R.id.heart, "Pouls en direct : " + bpm + " battements par minute" + (s.liveSimulated ? ", valeur simulée" : ""));
    }

    /** Redessine seulement le pouls de tous les widgets : le renard continue son animation sans à-coup. */
    static void updateLive(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        WidgetState s = WidgetState.load(ctx);
        long now = System.currentTimeMillis();
        int[] small = manager.getAppWidgetIds(new ComponentName(ctx, FoxWidgetSmall.class));
        int[] large = manager.getAppWidgetIds(new ComponentName(ctx, FoxWidgetLarge.class));
        if (small.length > 0) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_small);
            heart(v, s, now);
            manager.partiallyUpdateAppWidget(small, v);
        }
        if (large.length > 0) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_large);
            heart(v, s, now);
            manager.partiallyUpdateAppWidget(large, v);
        }
    }

    /** Ouvre l'appli, éventuellement sur une action (« checkin », « feel »). */
    static PendingIntent open(Context ctx, String action) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int code = 0;
        if (action != null) {
            i.setData(Uri.parse("monrenard://action/" + action));
            code = "feel".equals(action) ? 2 : 1;
        }
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
