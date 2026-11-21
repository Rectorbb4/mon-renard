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

    /** Pouls en direct (0 = plus de mesure) : seul le cœur du widget est redessiné, pas le renard. */
    @JavascriptInterface
    public void setLiveHeart(int bpm, boolean simulated) {
        WidgetState.saveLive(activity, bpm, simulated);
        FoxWidget.updateLive(activity);
        if (bpm > 0) activity.askNotificationsOnce();
    }

    /** Vrai (une seule fois) si la démo a été arrêtée hors de l'appli, depuis la notification. */
    @JavascriptInterface
    public boolean takeLiveStoppedOutside() {
        android.content.SharedPreferences p = activity.getSharedPreferences("widget", android.content.Context.MODE_PRIVATE);
        boolean stopped = p.getBoolean("liveStoppedOutside", false);
        if (stopped) p.edit().putBoolean("liveStoppedOutside", false).apply();
        return stopped;
    }

    /**
     * Branche la ceinture (« ceinture ») ou la bague (« bague ») en Bluetooth natif.
     * Renvoie false s'il n'y a pas de Bluetooth ; la suite arrive par l'événement « renard-ble ».
     */
    @JavascriptInterface
    public boolean bleStart(String kind) {
        if (!BleSensors.BELT.equals(kind) && !BleSensors.RING.equals(kind) && !BleSensors.BUTTON.equals(kind)) return false;
        if (!BleSensors.get(activity).hasBluetooth()) return false;
        activity.runOnUiThread(() -> activity.startSensor(kind));
        return true;
    }

    @JavascriptInterface
    public void bleStop(String kind) {
        activity.runOnUiThread(() -> BleSensors.get(activity).stop(kind, null));
    }

    /** Les capteurs en route, en JSON : [{kind, state, name}]. */
    @JavascriptInterface
    public String bleActive() {
        return BleSensors.get(activity).activeJson();
    }

    // ------------------------------------------------------------------ alerte « ton pouls monte » (PulseAlert)

    /** Réglages de l'alerte (seuil, plages horaires), en JSON. */
    @JavascriptInterface
    public void setAlertConfig(String json) {
        activity.runOnUiThread(() -> PulseAlert.get(activity).setConfig(json));
    }

    /** Ouvre le choix du son : « music » pour une musique du téléphone, sinon les sonneries. */
    @JavascriptInterface
    public void pickAlertSound(String kind) {
        activity.runOnUiThread(() -> activity.pickAlertSound("music".equals(kind)));
    }

    @JavascriptInterface
    public String alertSoundName() {
        return PulseAlert.get(activity).soundName();
    }

    /** Cinq secondes de sonnerie et de vibration, pour essayer. */
    @JavascriptInterface
    public void testAlert() {
        activity.runOnUiThread(() -> PulseAlert.get(activity).fire(0, true));
    }

    @JavascriptInterface
    public void stopAlert() {
        activity.runOnUiThread(() -> PulseAlert.get(activity).stop(true));
    }

    /** « Pas maintenant » : plus d'alerte pendant une heure. */
    @JavascriptInterface
    public void snoozeAlert() {
        activity.runOnUiThread(() -> PulseAlert.get(activity).snooze());
    }

    /** Version d'essai seulement : 35 secondes d'un faux pouls, comme si un capteur l'envoyait (tests automatiques). */
    @JavascriptInterface
    public void debugPulse(int bpm) {
        if (!BuildConfig.DEBUG) return;
        android.os.Handler h = new android.os.Handler(android.os.Looper.getMainLooper());
        for (int i = 0; i < 35; i++) h.postDelayed(() -> PulseAlert.get(activity).onHeart(bpm, System.currentTimeMillis()), i * 1000L);
    }

    /** Les pauses demandées (bouton, geste) : instants à noter dans le journal, rendus une seule fois. */
    @JavascriptInterface
    public String takePendingFelt() {
        return PulseAlert.get(activity).takePendingFelt();
    }

    /** Paquets de la bague encore inconnus (diagnostic du geste). */
    @JavascriptInterface
    public String bleUnknown() {
        return BleSensors.get(activity).unknownPackets();
    }

    /** Fait réagir la bague ; faux si elle n'est pas connectée. */
    @JavascriptInterface
    public boolean ringPing() {
        BleSensors ble = BleSensors.get(activity);
        if (!ble.ringReady()) return false;
        activity.runOnUiThread(ble::blinkRing);
        return true;
    }

    /** Version d'essai seulement : comme deux appuis sur le bouton pause (tests automatiques). */
    @JavascriptInterface
    public void debugTrigger() {
        if (!BuildConfig.DEBUG) return;
        activity.runOnUiThread(() -> PulseAlert.get(activity).trigger(BleSensors.BUTTON));
    }

    /** Version d'essai seulement : un tapotement de la bague (touche média). */
    @JavascriptInterface
    public void debugRingKey(int keyCode) {
        if (!BuildConfig.DEBUG) return;
        activity.runOnUiThread(() -> BleSensors.get(activity).onRingKey("R03_TEST", keyCode, true, 0));
    }

    /** {ringing, bpm, at} de la dernière alerte. */
    @JavascriptInterface
    public String alertState() {
        return PulseAlert.get(activity).stateJson();
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
