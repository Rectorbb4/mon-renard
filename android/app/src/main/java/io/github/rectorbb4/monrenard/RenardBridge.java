package io.github.rectorbb4.monrenard;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Ce que la page web peut demander au téléphone, sous le nom {@code window.RenardAndroid}.
 * Seules les pages de Mon renard sont ouvertes dans l'appli (les autres liens partent dans le navigateur).
 */
public class RenardBridge {

    private final MainActivity activity;

    RenardBridge(MainActivity activity) {
        this.activity = activity;
    }

    /** Dernière humeur et derniers instants, en JSON : le widget se met à jour. */
    @JavascriptInterface
    public void setWidgetState(String json) {
        WidgetState.save(activity, json);
        FoxWidget.updateAll(activity);
    }

    /** Enregistre une sauvegarde JSON dans le dossier Téléchargements. Renvoie false en cas d'échec. */
    @JavascriptInterface
    public boolean saveFile(String name, String content) {
        String safe = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (safe.isEmpty()) safe = "mon-renard-sauvegarde.json";
        if (!safe.endsWith(".json")) safe += ".json";
        ContentResolver resolver = activity.getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, safe);
        values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        values.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) return false;
        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new java.io.IOException("Pas de flux");
            out.write(content.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            resolver.delete(uri, null, null);
            return false;
        }
        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        return true;
    }

    /** Écran allumé pendant la respiration guidée. */
    @JavascriptInterface
    public void keepScreenOn(boolean on) {
        activity.keepScreenOn(on);
    }

    @JavascriptInterface
    public String version() {
        return BuildConfig.VERSION_NAME;
    }

    @JavascriptInterface
    public int versionCode() {
        return BuildConfig.VERSION_CODE;
    }

    /** Le lanceur d'applis sait-il poser un widget à la demande de l'appli ? */
    @JavascriptInterface
    public boolean canPinWidget() {
        return AppWidgetManager.getInstance(activity).isRequestPinAppWidgetSupported();
    }

    /** Propose de poser le widget (« small » ou « large ») : Android demande confirmation. */
    @JavascriptInterface
    public boolean pinWidget(String size) {
        AppWidgetManager manager = AppWidgetManager.getInstance(activity);
        if (!manager.isRequestPinAppWidgetSupported()) return false;
        Class<?> provider = "small".equals(size) ? FoxWidgetSmall.class : FoxWidgetLarge.class;
        return manager.requestPinAppWidget(new ComponentName(activity, provider), null, null);
    }
}
