package io.github.rectorbb4.monrenard;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

/** Ce que le widget affiche, envoyé par la page web et gardé sur le téléphone. */
final class WidgetState {

    static final String[] MOODS = {"creux", "grisaille", "equilibre", "elan", "emballement"};

    /** Identifiant d'humeur, ou null si aucun check-in. */
    final String mood;
    final String label;
    /** Heures en millisecondes, 0 si rien. */
    final long lastCheckIn;
    final long lastFelt;

    private WidgetState(String mood, String label, long lastCheckIn, long lastFelt) {
        this.mood = mood;
        this.label = label;
        this.lastCheckIn = lastCheckIn;
        this.lastFelt = lastFelt;
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("widget", Context.MODE_PRIVATE);
    }

    static boolean isMood(String id) {
        for (String m : MOODS) if (m.equals(id)) return true;
        return false;
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
                    .apply();
        } catch (Exception ignored) {
            // Message illisible : on garde l'état précédent
        }
    }

    static WidgetState load(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String mood = p.getString("mood", null);
        return new WidgetState(isMood(mood) ? mood : null, p.getString("label", null), p.getLong("lastCheckIn", 0), p.getLong("lastFelt", 0));
    }
}
