package io.github.rectorbb4.monrenard;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

/** Ce que le widget affiche, envoyé par la page web et gardé sur le téléphone. */
final class WidgetState {

    static final String[] MOODS = {"creux", "grisaille", "equilibre", "elan", "emballement"};

    /** Au-delà, le pouls affiché n'est plus « en direct » (l'appli a dû s'arrêter sans prévenir). */
    static final long LIVE_TIMEOUT = 2 * 60_000L;

    /** Identifiant d'humeur, ou null si aucun check-in. */
    final String mood;
    final String label;
    /** Heures en millisecondes, 0 si rien. */
    final long lastCheckIn;
    final long lastFelt;
    /** Jauges : humeur de -1 à 1, énergie et nuit de 0 à 1 ; sleepAt = heure de la nuit notée (0 si jamais). */
    final float score;
    final float energy;
    final float sleep;
    final long sleepAt;
    /** Pouls en direct (0 = rien), valeurs simulées ou non, heure de la dernière mesure. */
    final int liveBpm;
    final boolean liveSimulated;
    final long liveAt;

    private WidgetState(SharedPreferences p) {
        String m = p.getString("mood", null);
        mood = isMood(m) ? m : null;
        label = p.getString("label", null);
        lastCheckIn = p.getLong("lastCheckIn", 0);
        lastFelt = p.getLong("lastFelt", 0);
        score = p.getFloat("score", 0);
        energy = p.getFloat("energy", 0);
        sleep = p.getFloat("sleep", 0);
        sleepAt = p.getLong("sleepAt", 0);
        liveBpm = p.getInt("liveBpm", 0);
        liveSimulated = p.getBoolean("liveSimulated", false);
        liveAt = p.getLong("liveAt", 0);
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("widget", Context.MODE_PRIVATE);
    }

    static boolean isMood(String id) {
        for (String m : MOODS) if (m.equals(id)) return true;
        return false;
    }

    private static float bounded(double v, float min, float max) {
        if (Double.isNaN(v)) return 0;
        return (float) Math.max(min, Math.min(max, v));
    }

    static void save(Context ctx, String json) {
        try {
            JSONObject o = new JSONObject(json);
            String mood = o.optString("mood", "");
            String label = o.optString("label", "");
            if (label.length() > 30) label = label.substring(0, 30);
            prefs(ctx).edit()
                    .putString("mood", isMood(mood) ? mood : null)
                    .putString("label", isMood(mood) ? label : null)
                    .putLong("lastCheckIn", Math.max(0, o.optLong("lastCheckIn", 0)))
                    .putLong("lastFelt", Math.max(0, o.optLong("lastFelt", 0)))
                    .putFloat("score", bounded(o.optDouble("score", 0), -1, 1))
                    .putFloat("energy", bounded(o.optDouble("energy", 0), 0, 1))
                    .putFloat("sleep", bounded(o.optDouble("sleep", 0), 0, 1))
                    .putLong("sleepAt", Math.max(0, o.optLong("sleepAt", 0)))
                    .apply();
        } catch (Exception ignored) {
            // Message illisible : on garde l'état précédent
        }
    }

    /** Pouls en direct ; 0 efface l'affichage. */
    static void saveLive(Context ctx, int bpm, boolean simulated) {
        int value = bpm >= 25 && bpm <= 250 ? bpm : 0;
        prefs(ctx).edit()
                .putInt("liveBpm", value)
                .putBoolean("liveSimulated", value > 0 && simulated)
                .putLong("liveAt", value > 0 ? System.currentTimeMillis() : 0)
                .apply();
    }

    /** Le pouls à afficher maintenant, ou 0. */
    int liveBpm(long now) {
        return liveBpm > 0 && now - liveAt < LIVE_TIMEOUT && now >= liveAt - 60_000 ? liveBpm : 0;
    }

    static WidgetState load(Context ctx) {
        return new WidgetState(prefs(ctx));
    }
}
