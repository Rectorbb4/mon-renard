package io.github.rectorbb4.monrenard;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Resources;
import android.net.Uri;
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

    /** Nombre de cases du ViewFlipper (res/layout/widget_fox.xml) : deux tours de la boucle de repos. */
    static final int SLOTS = 32;

    /**
     * Le renard animé : chaque case du ViewFlipper reçoit une image de la boucle de l'humeur.
     * De jour, il cligne des yeux au second tour seulement ; la nuit, une boucle plus lente, yeux mi-clos.
     * Images et vitesses sont fabriquées par tools/render-widget.mjs.
     */
    static void animate(Context ctx, RemoteViews v, String mood, boolean night) {
        Resources res = ctx.getResources();
        String pkg = ctx.getPackageName();
        String m = mood != null && res.getIdentifier("fox_" + mood + "_ms", "integer", pkg) != 0 ? mood : "equilibre";
        int frames = res.getInteger(R.integer.fox_frames);
        int blinkAt = frames + res.getInteger(R.integer.fox_blink_at);
        int nightFrames = res.getInteger(R.integer.fox_night_frames);
        for (int i = 0; i < SLOTS; i++) {
            int f = i % frames;
            String name;
            if (night) name = "fox_" + m + "_nuit_" + (f * nightFrames / frames);
            else if (i == blinkAt) name = "fox_" + m + "_cligne_1";
            else if (i == blinkAt + 1) name = "fox_" + m + "_cligne_2";
            else name = String.format(Locale.ROOT, "fox_%s_%02d", m, f);
            int slot = res.getIdentifier(String.format(Locale.ROOT, "f%02d", i), "id", pkg);
            int image = res.getIdentifier(name, "drawable", pkg);
            if (slot != 0 && image != 0) v.setImageViewResource(slot, image);
        }
        int ms = night ? res.getInteger(R.integer.fox_night_ms) : res.getInteger(res.getIdentifier("fox_" + m + "_ms", "integer", pkg));
        v.setInt(R.id.fox, "setFlipInterval", ms);
        v.setViewVisibility(R.id.zz, night ? View.VISIBLE : View.GONE);
    }

    static RemoteViews build(Context ctx, boolean large, long now) {
        WidgetState s = WidgetState.load(ctx);
        boolean night = isNight(now);
        String label = s.mood != null && s.label != null && !s.label.isEmpty() ? s.label : "Ton renard";

        RemoteViews v = new RemoteViews(ctx.getPackageName(), large ? R.layout.widget_large : R.layout.widget_small);
        animate(ctx, v, s.mood, night);
        v.setContentDescription(R.id.fox, "Ton renard. Humeur : " + label);
        v.setTextViewText(R.id.mood, label);
        v.setOnClickPendingIntent(android.R.id.background, open(ctx, null));
        if (large) {
            v.setTextViewText(R.id.caption, caption(s, now));
            v.setOnClickPendingIntent(R.id.btn_checkin, open(ctx, "checkin"));
            v.setOnClickPendingIntent(R.id.btn_feel, open(ctx, "feel"));
        }
        return v;
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
