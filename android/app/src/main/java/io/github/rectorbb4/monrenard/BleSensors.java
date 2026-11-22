package io.github.rectorbb4.monrenard;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothStatusCodes;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Les capteurs portés, en Bluetooth natif (la WebView de l'appli n'a pas Web Bluetooth) :
 * la ceinture cardio (service standard Heart Rate 0x180D) et la bague Colmi (voir {@link ColmiProtocol}).
 *
 * Tout se passe sur le fil principal : les rappels Bluetooth y sont renvoyés. La connexion vit ici, hors de
 * l'activité, pour continuer quand l'appli passe en arrière-plan ({@link LiveService} garde alors l'appli
 * en vie, avec une notification). Les mesures partent vers la page (événement « renard-ble », voir
 * src/sensors/native.ts) et vers le widget. Les autorisations sont demandées avant par {@link MainActivity}.
 */
@SuppressLint("MissingPermission")
final class BleSensors {

    static final String BELT = "ceinture";
    static final String RING = "bague";
    /** Le bouton pause : un porte-clés Bluetooth « iTag » (anti-perte), qu'on presse deux fois. */
    static final String BUTTON = "bouton";

    static final UUID HR_SERVICE = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb");
    static final UUID HR_MEASUREMENT = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb");
    static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    /** iTag : service FFE0, l'appui arrive en notification sur FFE1. */
    static final UUID ITAG_SERVICE = UUID.fromString("0000ffe0-0000-1000-8000-00805f9b34fb");
    static final UUID ITAG_PRESS = UUID.fromString("0000ffe1-0000-1000-8000-00805f9b34fb");
    /** « Perte de lien » (0x1803) : sinon l'iTag bipe dès que le téléphone s'éloigne. */
    static final UUID LINK_LOSS = UUID.fromString("00001803-0000-1000-8000-00805f9b34fb");
    static final UUID ALERT_LEVEL = UUID.fromString("00002a06-0000-1000-8000-00805f9b34fb");
    /** Deux appuis à moins de 2 secondes : pas de déclenchement par erreur dans une poche. */
    private static final long DOUBLE_PRESS_MS = 2_000;
    /** Après une pause, les tapotements sont ignorés un moment : elle ne peut pas se relancer en boucle. */
    private static final long TAP_QUIET = 20_000;
    private static final long GESTURE_LOG = 60 * 60_000;
    /** Relevé de la bague : à la connexion, puis toutes les 30 minutes. */
    private static final long SYNC_EVERY = 30 * 60_000;
    private static final long SYNC_DELAY = 2_500;
    /** La ceinture donne le pouls depuis moins de ce délai : la bague n'allume pas sa LED pour rien. */
    private static final long BELT_ACTIVE_MS = 15_000;

    private static final long SCAN_TIMEOUT = 20_000;
    /** Si l'appareil déjà connu n'apparaît pas, on prend le premier autre trouvé au bout de ce délai. */
    private static final long KNOWN_GRACE = 4_000;
    private static final long CONNECT_TIMEOUT = 15_000;
    private static final long OP_TIMEOUT = 3_000;
    private static final long WIDGET_EVERY = 5_000;
    /** Tant que la ceinture donne un pouls (moins de 5 s), celui de la bague est ignoré : elle est plus précise. */
    private static final long PREFER_BELT_MS = 5_000;
    /** Les capteurs à rebrancher tout seuls (mise à jour, redémarrage), jusqu'à ce qu'on les arrête. */
    private static final String WANTED = "voulus";
    private static final String[] KINDS = {BELT, RING, BUTTON};
    /** Un capteur absent (ceinture rangée…) est recherché à ce rythme, sans jamais abandonner. */
    private static final long RETRY_EVERY = 3 * 60_000;
    private static final long LOOK_FOR = 10_000;
    /** L'essai des gestes s'arrête de lui-même : il ne peut pas bloquer la pause. */
    private static final long RING_TEST_MAX = 10 * 60_000;

    interface Listener {
        void onEvent(String json);
    }

    private static BleSensors instance;

    static synchronized BleSensors get(Context ctx) {
        if (instance == null) instance = new BleSensors(ctx.getApplicationContext());
        return instance;
    }

    private final Context ctx;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<String, Sensor> sensors = new LinkedHashMap<>();
    private Listener listener;
    private long lastBeltHr;
    private long lastWidget;
    /** Copie lisible depuis n'importe quel fil (le pont JavaScript n'est pas sur le fil principal). */
    private volatile String activeJson = "[]";
    private volatile boolean ringReady;
    private long gestureQuietUntil;
    private final TapRule taps = new TapRule();
    private RingKeys ringKeys;
    /** Tapotements reçus depuis une heure, pour voir si la bague en envoie sans qu'on le veuille. */
    private final ArrayDeque<Long> gestureLog = new ArrayDeque<>();
    /** Pendant l'essai des gestes, ils sont montrés à la page et ne lancent aucune pause. */
    private volatile long ringTestUntil;
    /** Le tactile a été ouvert pour un essai et n'a pas encore retrouvé son mode (bague déconnectée entre-temps). */
    private boolean touchBorrowed;
    private long beltMinute;
    private int beltSum;
    private int beltCount;
    private final List<Integer> beltRr = new ArrayList<>();
    private boolean ringLowBattery;
    private boolean ringCharging;

    private BleSensors(Context ctx) {
        this.ctx = ctx;
    }

    void setListener(Listener l) {
        listener = l;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = ctx.getSystemService(BluetoothManager.class);
        return m == null ? null : m.getAdapter();
    }

    boolean hasBluetooth() {
        return ctx.getPackageManager().hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE) && adapter() != null;
    }

    boolean isEnabled() {
        BluetoothAdapter a = adapter();
        return a != null && a.isEnabled();
    }

    boolean anyActive() {
        return !sensors.isEmpty();
    }

    /** La bague ou le bouton pause sont branchés : ils doivent pouvoir rester connectés toute la journée. */
    boolean staysOn() {
        return sensors.containsKey(BUTTON) || sensors.containsKey(RING);
    }

    static String label(String kind) {
        return BELT.equals(kind) ? "ceinture" : RING.equals(kind) ? "bague" : "bouton pause";
    }

    /** Un iTag : son nom (« iTAG ») ou son service FFE0. */
    static boolean isButton(String name, List<ParcelUuid> uuids) {
        if (name != null && name.trim().toLowerCase(java.util.Locale.ROOT).contains("itag")) return true;
        return uuids != null && uuids.contains(new ParcelUuid(ITAG_SERVICE));
    }

    /** Une ceinture : son nom (Coospo H6…) ou le service de pouls connu du téléphone. */
    static boolean isBelt(String name, ParcelUuid[] uuids) {
        if (name != null) {
            String n = name.trim().toLowerCase(java.util.Locale.ROOT);
            if (n.contains("coospo") || n.matches("^h6(\\b|m).*")) return true;
        }
        if (uuids != null) {
            for (ParcelUuid u : uuids) if (HR_SERVICE.equals(u.getUuid())) return true;
        }
        return false;
    }

    /** Paquets de la bague que l'appli ne connaît pas encore (pour comprendre son geste au premier essai). */
    String unknownPackets() {
        return ctx.getSharedPreferences("capteurs", Context.MODE_PRIVATE).getString("inconnus", "");
    }

    private void logUnknown(byte[] v) {
        logLine(hex(v));
    }

    private static String hex(byte[] v) {
        StringBuilder hex = new StringBuilder();
        for (byte b : v) hex.append(String.format("%02x", b));
        return hex.toString();
    }

    /** Fil principal. Le tactile est ouvert le temps de l'essai, puis la bague retrouve le mode choisi dans QRing. */
    void setRingTest(boolean on) {
        ringTestUntil = on ? System.currentTimeMillis() + RING_TEST_MAX : 0;
        Sensor r = sensors.get(RING);
        boolean linked = r != null && "connected".equals(r.state);
        if (on) {
            if (linked) {
                r.write(ColmiProtocol.touchMode(ColmiProtocol.TOUCH_KEYS));
                touchBorrowed = true;
            }
        } else if (touchBorrowed && linked) {
            r.write(ColmiProtocol.touchMode(wantedTouchMode()));
            touchBorrowed = false;
        }
    }

    private int savedTouchMode() {
        return ctx.getSharedPreferences("capteurs", Context.MODE_PRIVATE).getInt("tactileMode", ColmiProtocol.TOUCH_CLOSED);
    }

    /** Pause par tapotements activée : le tactile reste ouvert. Sinon, le choix fait dans QRing. */
    private int wantedTouchMode() {
        return ringGestureOn() ? ColmiProtocol.TOUCH_KEYS : savedTouchMode();
    }

    /** Écran qui s'éteint : on redit à la bague de garder son tactile ouvert. */
    void reapplyTouch() {
        if (!ringGestureOn() || ringTesting()) return;
        Sensor r = sensors.get(RING);
        if (r != null && "connected".equals(r.state)) r.write(ColmiProtocol.touchMode(ColmiProtocol.TOUCH_KEYS));
    }

    private void syncRingKeys() {
        boolean on = ringGestureOn() && sensors.containsKey(RING);
        if (ringKeys == null) {
            if (!on) return;
            ringKeys = new RingKeys(ctx, this);
        }
        ringKeys.setOn(on);
    }

    private boolean ringTesting() {
        return System.currentTimeMillis() < ringTestUntil;
    }

    private void emitGesture(String channel, String code) {
        emit(event(RING, "gesture").putOpt("channel", channel).putOpt("code", code).putOpt("at", System.currentTimeMillis()));
    }

    /** Un message de la bague : le geste connu, ou un message inconnu qui en est peut-être un autre. Vrai si c'est le geste. */
    private boolean onRingMessage(byte[] v, long now) {
        // La bague confirme le réglage du tactile : noté pour le diagnostic, ce n'est pas un geste
        if ((v[0] & 0xff) == ColmiProtocol.CMD_TOUCH) {
            logLine("tactile " + hex(v));
            // Sans essai ni pause par tapotements, c'est le choix fait dans QRing : c'est lui qu'on remettra ensuite
            int mode = ColmiProtocol.touchModeOf(v);
            if (mode >= 0 && !ringTesting() && !ringGestureOn()) {
                ctx.getSharedPreferences("capteurs", Context.MODE_PRIVATE).edit().putInt("tactileMode", mode).apply();
            }
            return true;
        }
        if (ColmiProtocol.isGesture(v)) {
            // Ce signal part aussi sur des mouvements ordinaires : il ne lance jamais de pause
            if (ringTesting()) {
                logUnknown(v);
                emitGesture("message", hex(v));
            }
            return true;
        }
        return false;
    }

    private void onUnknownMessage(byte[] v) {
        if (ColmiProtocol.isKnown(v[0])) return;
        logUnknown(v);
        if (ringTesting()) emitGesture("message", hex(v));
    }

    /** Version d'essai : un message comme s'il venait de la bague. */
    void debugPacket(byte[] v) {
        if (!onRingMessage(v, System.currentTimeMillis())) onUnknownMessage(v);
    }

    private void logLine(String text) {
        SharedPreferences p = ctx.getSharedPreferences("capteurs", Context.MODE_PRIVATE);
        StringBuilder all = new StringBuilder(new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.FRANCE).format(new java.util.Date()));
        all.append(' ').append(text);
        String[] old = p.getString("inconnus", "").split("\n");
        for (int i = 0; i < Math.min(old.length, 11); i++) if (!old[i].isEmpty()) all.append('\n').append(old[i]);
        p.edit().putString("inconnus", all.toString()).apply();
    }

    /**
     * Le tapotement de la bague n'arrive pas par ses messages : Android la voit comme une petite télécommande
     * et reçoit une touche média. Vrai si la touche vient de la bague.
     */
    boolean onRingKey(String device, int keyCode, boolean down, int repeat) {
        if (!ColmiProtocol.isRing(device)) return false;
        if (!down || repeat != 0) return true;
        String key = android.view.KeyEvent.keyCodeToString(keyCode);
        logLine("touche " + key);
        if (ringTesting()) emitGesture("touche", key);
        else onRingTap(System.currentTimeMillis());
        return true;
    }

    /**
     * Option activée : au moins trois tapotements en trois secondes demandent une pause.
     * Option désactivée (par défaut) : ils sont seulement comptés, rien ne vibre.
     */
    private void onRingTap(long now) {
        synchronized (gestureLog) {
            gestureLog.addLast(now);
            trimGestureLog(now);
        }
        if (!ringGestureOn() || now < gestureQuietUntil) return;
        if (taps.add(now)) {
            gestureQuietUntil = now + TAP_QUIET;
            PulseAlert.get(ctx).trigger(RING, taps.seriesStart());
        }
    }

    private void trimGestureLog(long now) {
        while (!gestureLog.isEmpty() && now - gestureLog.peekFirst() > GESTURE_LOG) gestureLog.removeFirst();
    }

    /** Le geste de la bague peut-il lancer une pause ? Désactivé tant qu'on ne l'a pas choisi. */
    boolean ringGestureOn() {
        return ctx.getSharedPreferences("capteurs", Context.MODE_PRIVATE).getBoolean("gestePause", false);
    }

    void setRingGestureOn(boolean on) {
        ctx.getSharedPreferences("capteurs", Context.MODE_PRIVATE).edit().putBoolean("gestePause", on).apply();
        taps.clear();
        gestureQuietUntil = 0;
        Sensor r = sensors.get(RING);
        if (r != null && "connected".equals(r.state) && !ringTesting()) r.write(ColmiProtocol.touchMode(wantedTouchMode()));
        syncRingKeys();
    }

    int ringGesturesLastHour() {
        synchronized (gestureLog) {
            trimGestureLog(System.currentTimeMillis());
            return gestureLog.size();
        }
    }

    /** Relance tout de suite le relevé de la bague ; faux si elle n'est pas connectée. */
    boolean syncRing() {
        Sensor r = sensors.get(RING);
        if (r == null || !"connected".equals(r.state)) return false;
        r.startSync(System.currentTimeMillis());
        return true;
    }

    // ------------------------------------------------------------------ ceinture : une ligne par minute

    private void logBelt(int bpm, List<Integer> rr, long now) {
        long minute = now - now % 60_000;
        if (beltMinute != 0 && minute != beltMinute) flushBelt();
        beltMinute = minute;
        beltSum += bpm;
        beltCount++;
        if (rr != null) beltRr.addAll(rr);
    }

    private void flushBelt() {
        // Moins de 20 mesures dans la minute : pas assez pour en tirer quelque chose
        if (beltCount >= 20) RingSync.appendBelt(ctx, beltMinute, Math.round((float) beltSum / beltCount), rmssd(beltRr));
        beltMinute = 0;
        beltSum = 0;
        beltCount = 0;
        beltRr.clear();
    }

    /** Même calcul que src/sensors/metrics.ts. */
    private static Double rmssd(List<Integer> rr) {
        List<Integer> clean = new ArrayList<>();
        for (int v : rr) if (v >= 300 && v <= 2000) clean.add(v);
        if (clean.size() < 3) return null;
        double sum = 0;
        int n = 0;
        for (int i = 1; i < clean.size(); i++) {
            int d = clean.get(i) - clean.get(i - 1);
            if (Math.abs(d) > clean.get(i - 1) * 0.25) continue;
            sum += d * d;
            n++;
        }
        return n < 2 ? null : Math.round(Math.sqrt(sum / n) * 10) / 10.0;
    }

    String activeJson() {
        return activeJson;
    }

    /** « ceinture et bague », pour la notification. */
    String activeLabel() {
        List<String> names = new ArrayList<>();
        for (String k : sensors.keySet()) names.add(label(k));
        return String.join(" et ", names);
    }

    // ------------------------------------------------------------------ commandes (fil principal)

    /** Branche un capteur. Sans effet (à part redire son état) s'il est déjà en route. */
    void start(String kind) {
        setWanted(kind, true);
        Sensor s = sensors.get(kind);
        if (s != null) {
            s.emitStatus();
            return;
        }
        s = new Sensor(kind);
        sensors.put(kind, s);
        s.scan();
    }

    /** Débranche un capteur ; `message` est envoyé à la page (null = arrêt demandé par la page). */
    void stop(String kind, String message) {
        Sensor s = sensors.get(kind);
        if (s != null) s.end(message);
    }

    /**
     * « Arrêter » : il ne se rebranchera plus tout seul. La page rappelle aussi ceci après une erreur :
     * le capteur est alors déjà terminé, et il reste à rebrancher.
     */
    void stopByUser(String kind) {
        if (!sensors.containsKey(kind)) return;
        setWanted(kind, false);
        stop(kind, null);
    }

    /** « Arrêter la mesure » depuis la notification. */
    void forgetAll() {
        for (String k : KINDS) setWanted(k, false);
    }

    private Set<String> wanted() {
        SharedPreferences p = ctx.getSharedPreferences("capteurs", Context.MODE_PRIVATE);
        if (p.contains(WANTED)) return new HashSet<>(p.getStringSet(WANTED, new HashSet<>()));
        // Avant la 1.9, rien n'était noté : on reprend les capteurs déjà utilisés sur ce téléphone
        Set<String> used = new HashSet<>();
        for (String k : KINDS) if (p.getString(k, null) != null) used.add(k);
        p.edit().putStringSet(WANTED, used).apply();
        return used;
    }

    private void setWanted(String kind, boolean on) {
        Set<String> list = wanted();
        if (on ? list.add(kind) : list.remove(kind)) {
            ctx.getSharedPreferences("capteurs", Context.MODE_PRIVATE).edit().putStringSet(WANTED, list).apply();
        }
    }

    /** Rebranche les capteurs voulus (ouverture de l'appli, mise à jour, redémarrage du téléphone). Fil principal. */
    void resumeWanted() {
        if (!hasBluetooth()) return;
        if (Build.VERSION.SDK_INT >= 31
                && ctx.checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        SharedPreferences p = ctx.getSharedPreferences("capteurs", Context.MODE_PRIVATE);
        Set<String> want = wanted();
        for (String k : KINDS) {
            String address = p.getString(k, null);
            if (!want.contains(k) || sensors.containsKey(k) || !BluetoothAdapter.checkBluetoothAddress(address)) continue;
            Sensor s = new Sensor(k);
            sensors.put(k, s);
            s.waitFor(address);
        }
    }

    void stopAll(String message) {
        for (Sensor s : new ArrayList<>(sensors.values())) s.end(message);
    }

    /** Un état « en attente » avant le vrai démarrage (autorisation demandée…), ou une fin sans connexion. */
    void emitStatus(String kind, String state) {
        emit(event(kind, "status").putOpt("state", state));
    }

    void emitEnd(String kind, String message) {
        emit(event(kind, "end").putOpt("message", message));
    }

    // ------------------------------------------------------------------ envoi

    private static J event(String kind, String type) {
        return new J().putOpt("kind", kind).putOpt("type", type);
    }

    private void emit(J e) {
        if (listener != null) listener.onEvent(e.toString());
    }

    private void refreshActive() {
        JSONArray a = new JSONArray();
        for (Sensor s : sensors.values()) {
            a.put(new J().putOpt("kind", s.kind).putOpt("state", s.state).putOpt("name", s.name).o);
        }
        activeJson = a.toString();
        Sensor r = sensors.get(RING);
        ringReady = r != null && "connected".equals(r.state);
        syncRingKeys();
    }

    /** La bague est connectée (lisible depuis le pont JavaScript). */
    boolean ringReady() {
        return ringReady;
    }

    /** Fait réagir la bague, pour la retrouver ou vérifier qu'elle écoute (fil principal). */
    void blinkRing() {
        Sensor r = sensors.get(RING);
        if (r != null && "connected".equals(r.state)) r.write(ColmiProtocol.blink());
    }

    /** Lue à chaque relevé : sous 15 %, la bague arrête le pouls continu et ne reprend qu'à 20 %. */
    private void noteRingBattery(int level, boolean charging) {
        ringCharging = charging;
        if (level < ColmiProtocol.LOW_BATTERY) ringLowBattery = true;
        else if (level >= ColmiProtocol.BATTERY_OK) ringLowBattery = false;
    }

    /** Version d'essai : une mesure comme si elle venait de ce capteur. */
    void debugReading(String kind, int bpm, int rr) {
        List<Integer> beats = new ArrayList<>();
        if (rr > 0) beats.add(rr);
        onHeartRate(kind, bpm, beats);
    }

    private void onHeartRate(String kind, int bpm, List<Integer> rr) {
        long now = System.currentTimeMillis();
        if (BELT.equals(kind)) lastBeltHr = now;
        else if (now - lastBeltHr < PREFER_BELT_MS) return;
        // Les dernières secondes, pour les retrouver autour d'une pause demandée
        MomentCapture.get(ctx).onReading(kind, bpm, rr, now);
        // Alerte « ton pouls monte » (seuil, plages horaires) : voir PulseAlert
        PulseAlert.get(ctx).onHeart(bpm, now);
        if (now - lastWidget < WIDGET_EVERY) return;
        lastWidget = now;
        WidgetState.saveLive(ctx, bpm, false);
        FoxWidget.updateLive(ctx);
    }

    private void removed(Sensor s) {
        sensors.remove(s.kind);
        refreshActive();
        if (BELT.equals(s.kind)) {
            lastBeltHr = 0;
            flushBelt();
        }
        if (!sensors.containsKey(BELT) && !sensors.containsKey(RING) && !BUTTON.equals(s.kind)) {
            // Plus de pouls : il disparaît du widget
            lastWidget = 0;
            WidgetState.saveLive(ctx, 0, false);
            FoxWidget.updateLive(ctx);
        }
        // Plus rien à garder en arrière-plan
        if (sensors.isEmpty()) LiveService.stop(ctx);
    }

    // ------------------------------------------------------------------ un capteur

    /** Une opération Bluetooth ; renvoie vrai s'il faut attendre son rappel avant la suivante. */
    private interface Op {
        boolean run();
    }

    private final class Sensor {
        final String kind;
        final boolean ring;
        final boolean button;
        String state = "scanning";
        private long lastPress;
        String name;
        private BluetoothLeScanner scanner;
        private ScanCallback scanCallback;
        private BluetoothDevice candidate;
        private String candidateName;
        private BluetoothGatt gatt;
        private BluetoothGattCharacteristic writeChar;
        private BluetoothGattCharacteristic writeV2;
        private RingSync sync;
        private long lastSync;
        private boolean ended;
        private boolean everConnected;
        private int attempts;
        /** Essai sur un appareil déjà relié au téléphone ; s'il ne convient pas, on repart sur une recherche. */
        private boolean direct;
        private boolean triedDirect;
        /** Le lien Bluetooth est établi (les réglages du capteur sont peut-être encore en cours). */
        private boolean linked;
        private final ArrayDeque<Op> ops = new ArrayDeque<>();
        private boolean busy;
        private ColmiProtocol.Session session;
        private long lastNotice;

        private final Runnable scanTimeout = this::nothingFound;
        private final Runnable endLook = this::stopScan;
        /** Le capteur ne revient pas (Bluetooth coupé puis rallumé, longue absence) : on relance l'attente. */
        private final Runnable retry = new Runnable() {
            @Override
            public void run() {
                if (ended || !"reconnecting".equals(state)) return;
                BluetoothAdapter a = adapter();
                String known = prefs().getString(kind, null);
                if (!linked && a != null && a.isEnabled() && BluetoothAdapter.checkBluetoothAddress(known)) {
                    closeGatt();
                    openGatt(a.getRemoteDevice(known), true);
                    lookFor(a, known);
                }
                main.postDelayed(this, RETRY_EVERY);
            }
        };
        private final Runnable takeCandidate = () -> {
            if (candidate != null && "scanning".equals(state)) connect(candidate, candidateName);
        };
        private final Runnable connectTimeout = () -> {
            if (!everConnected) retryOrEnd();
        };
        private final Runnable opTimeout = () -> {
            busy = false;
            pump();
        };
        private final Runnable tick = new Runnable() {
            @Override
            public void run() {
                if (session == null || ended) return;
                long now = System.currentTimeMillis();
                // Sans ceinture, la bague donne le pouls : à l'écran, pour l'alerte, et pour les secondes autour d'une pause
                boolean want = ColmiProtocol.wantsLive(
                        now - lastBeltHr < BELT_ACTIVE_MS,
                        PulseAlert.appVisible || PulseAlert.get(ctx).isEnabled(),
                        ringGestureOn(),
                        java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY),
                        ringLowBattery,
                        ringCharging);
                if (want != session.measuring()) for (byte[] p : want ? session.start(now) : session.stop()) write(p);
                for (byte[] p : session.tick(now)) write(p);
                if (now - lastSync >= SYNC_EVERY) startSync(now);
                main.postDelayed(this, 1000);
            }
        };

        Sensor(String kind) {
            this.kind = kind;
            this.ring = RING.equals(kind);
            this.button = BUTTON.equals(kind);
        }

        private SharedPreferences prefs() {
            return ctx.getSharedPreferences("capteurs", Context.MODE_PRIVATE);
        }

        void setState(String s) {
            state = s;
            refreshActive();
            emitStatus();
        }

        void emitStatus() {
            emit(event(kind, "status").putOpt("state", state).putOpt("name", name));
        }

        // ---------------------------------------------------------- recherche

        /** Rebranché tout seul : on attend l'appareil déjà connu, aussi longtemps qu'il faut, sans message d'erreur. */
        void waitFor(String address) {
            everConnected = true;
            BluetoothAdapter a = adapter();
            BluetoothDevice d = a != null ? a.getRemoteDevice(address) : null;
            if (d != null) name = nameOf(d);
            setState("reconnecting");
            if (d != null && a.isEnabled()) openGatt(d, true);
            keepTrying();
        }

        private void keepTrying() {
            main.removeCallbacks(retry);
            main.postDelayed(retry, RETRY_EVERY);
        }

        /** Courte recherche de cet appareil précis : s'il est là, connexion directe. */
        private void lookFor(BluetoothAdapter a, String address) {
            if (ended || scanCallback != null) return;
            BluetoothLeScanner s = a.getBluetoothLeScanner();
            if (s == null) return;
            scanner = s;
            scanCallback = new ScanCallback() {
                @Override
                public void onScanResult(int callbackType, ScanResult result) {
                    BluetoothDevice d = result.getDevice();
                    main.post(() -> {
                        if (ended || linked || scanCallback == null || !"reconnecting".equals(state)) return;
                        stopScan();
                        closeGatt();
                        openGatt(d, false);
                    });
                }
            };
            List<ScanFilter> filters = new ArrayList<>();
            filters.add(new ScanFilter.Builder().setDeviceAddress(address).build());
            try {
                s.startScan(filters, new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_BALANCED).build(), scanCallback);
                main.postDelayed(endLook, LOOK_FOR);
            } catch (Exception e) {
                scanCallback = null;
            }
        }

        void scan() {
            refreshActive();
            emitStatus();
            BluetoothAdapter a = adapter();
            if (a == null || !a.isEnabled()) {
                end("Le Bluetooth est éteint : active-le pour brancher tes capteurs.");
                return;
            }
            // Un capteur déjà relié au téléphone (appairé) ne s'annonce plus : la recherche ne le verrait jamais
            if (!triedDirect) {
                triedDirect = true;
                BluetoothDevice held = alreadyConnected();
                if (held != null) {
                    direct = true;
                    connect(held, nameOf(held));
                    return;
                }
            }
            scanner = a.getBluetoothLeScanner();
            if (scanner == null) {
                end("La recherche Bluetooth n'est pas disponible.");
                return;
            }
            List<ScanFilter> filters = null;
            if (!ring && !button) {
                filters = new ArrayList<>();
                filters.add(new ScanFilter.Builder().setServiceUuid(new ParcelUuid(HR_SERVICE)).build());
            }
            // La bague n'annonce pas toujours son service : on la reconnaît à son nom
            ScanSettings settings = new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();
            scanCallback = new ScanCallback() {
                @Override
                public void onScanResult(int callbackType, ScanResult result) {
                    ScanRecord rec = result.getScanRecord();
                    String advName = rec != null ? rec.getDeviceName() : null;
                    List<ParcelUuid> uuids = rec != null ? rec.getServiceUuids() : null;
                    BluetoothDevice d = result.getDevice();
                    main.post(() -> found(d, advName, uuids));
                }

                @Override
                public void onScanFailed(int errorCode) {
                    main.post(() -> end("La recherche Bluetooth a échoué (code " + errorCode + "). Réessaie dans un instant."));
                }
            };
            try {
                scanner.startScan(filters, settings, scanCallback);
            } catch (SecurityException e) {
                end("Autorisation Bluetooth manquante.");
                return;
            }
            main.postDelayed(scanTimeout, SCAN_TIMEOUT);
        }

        /** Le capteur de ce type déjà connecté au téléphone, s'il y en a un (le dernier utilisé d'abord). */
        private BluetoothDevice alreadyConnected() {
            BluetoothManager m = ctx.getSystemService(BluetoothManager.class);
            if (m == null) return null;
            String known = prefs().getString(kind, null);
            BluetoothDevice match = null;
            try {
                for (BluetoothDevice d : m.getConnectedDevices(BluetoothProfile.GATT)) {
                    if (d.getAddress().equals(known)) return d;
                    if (match == null && isMine(d)) match = d;
                }
            } catch (SecurityException e) {
                return null;
            }
            return match;
        }

        private boolean isMine(BluetoothDevice d) {
            String n = nameOf(d);
            if (ring) return ColmiProtocol.isRing(n);
            if (button) return isButton(n, null);
            return isBelt(n, d.getUuids());
        }

        private String nameOf(BluetoothDevice d) {
            try {
                return d.getName();
            } catch (SecurityException e) {
                return null;
            }
        }

        /** L'appareil déjà relié n'était pas le bon, ou ne répond pas : recherche normale. */
        private void backToScan() {
            direct = false;
            everConnected = false;
            attempts = 0;
            name = null;
            main.removeCallbacks(connectTimeout);
            main.removeCallbacks(opTimeout);
            ops.clear();
            busy = false;
            closeGatt();
            state = "scanning";
            scan();
        }

        /** Ce n'est pas le bon appareil : on cherche ailleurs si on l'avait pris d'office, sinon on le dit. */
        private void notCompatible(String message) {
            if (direct) backToScan();
            else end(message);
        }

        private void nothingFound() {
            end(button
                    ? "Aucun bouton trouvé. Appuie une fois dessus pour le réveiller, et vérifie qu'il n'est pas connecté à une autre appli (iSearching…)."
                    : ring
                    ? "Aucune bague trouvée. Vérifie qu'elle est chargée, et force l'arrêt de l'appli QRing si tu l'as installée : la bague ne parle qu'à une appli à la fois."
                    : "Aucune ceinture trouvée. Mouille les électrodes, mets-la sur la peau (elle ne s'allume qu'à ce contact) et ferme toute autre appli qui l'utilise.");
        }

        private void found(BluetoothDevice d, String advName, List<ParcelUuid> uuids) {
            if (ended || !"scanning".equals(state)) return;
            String n = advName;
            if (n == null) {
                try {
                    n = d.getName();
                } catch (SecurityException ignored) {
                    // sans nom
                }
            }
            if (ring && !ColmiProtocol.isRing(n)) return;
            if (button && !isButton(n, uuids)) return;
            String known = prefs().getString(kind, null);
            if (known != null && !known.equals(d.getAddress())) {
                // Un autre appareil que celui de la dernière fois : on lui laisse un peu de temps pour apparaître
                if (candidate == null) {
                    candidate = d;
                    candidateName = n;
                    main.postDelayed(takeCandidate, KNOWN_GRACE);
                }
                return;
            }
            connect(d, n);
        }

        private void stopScan() {
            main.removeCallbacks(scanTimeout);
            main.removeCallbacks(takeCandidate);
            main.removeCallbacks(endLook);
            if (scanner != null && scanCallback != null) {
                try {
                    scanner.stopScan(scanCallback);
                } catch (Exception ignored) {
                    // Bluetooth éteint entre-temps
                }
            }
            scanCallback = null;
        }

        // ---------------------------------------------------------- connexion

        private void connect(BluetoothDevice d, String n) {
            stopScan();
            name = n;
            // Un appareil pris d'office n'est retenu qu'une fois confirmé (voir setup)
            if (!direct) prefs().edit().putString(kind, d.getAddress()).apply();
            setState("connecting");
            main.postDelayed(connectTimeout, CONNECT_TIMEOUT);
            openGatt(d, false);
        }

        private void openGatt(BluetoothDevice d, boolean auto) {
            try {
                gatt = d.connectGatt(ctx, auto, callback, BluetoothDevice.TRANSPORT_LE);
            } catch (SecurityException e) {
                end("Autorisation Bluetooth manquante.");
            }
        }

        /** Première connexion ratée (fréquent en Bluetooth) : on réessaie deux fois. */
        private void retryOrEnd() {
            if (ended) return;
            if (direct) {
                backToScan();
                return;
            }
            BluetoothDevice d = gatt != null ? gatt.getDevice() : null;
            closeGatt();
            if (d != null && ++attempts < 3) {
                main.removeCallbacks(connectTimeout);
                main.postDelayed(connectTimeout, CONNECT_TIMEOUT);
                openGatt(d, false);
            } else {
                end(button
                        ? "Impossible de se connecter au bouton. Appuie dessus pour le réveiller, puis réessaie."
                        : ring
                        ? "Impossible de se connecter à la bague. Ferme l'appli QRing si elle est ouverte, puis réessaie."
                        : "Impossible de se connecter à la ceinture. Réessaie dans un instant.");
            }
        }

        private void closeGatt() {
            linked = false;
            if (gatt == null) return;
            try {
                gatt.close();
            } catch (Exception ignored) {
                // déjà fermée
            }
            gatt = null;
        }

        private final BluetoothGattCallback callback = new BluetoothGattCallback() {
            @Override
            public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
                main.post(() -> {
                    if (g != gatt) return;
                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        main.removeCallbacks(connectTimeout);
                        everConnected = true;
                        linked = true;
                        try {
                            g.discoverServices();
                        } catch (SecurityException e) {
                            end("Autorisation Bluetooth manquante.");
                        }
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        lost();
                    }
                });
            }

            @Override
            public void onServicesDiscovered(BluetoothGatt g, int status) {
                main.post(() -> {
                    if (g == gatt) setup();
                });
            }

            @Override
            public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor d, int status) {
                main.post(() -> {
                    if (g == gatt) opDone();
                });
            }

            @Override
            public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
                main.post(() -> {
                    if (g == gatt) opDone();
                });
            }

            /** Android 13 et plus. */
            @Override
            public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c, byte[] value) {
                byte[] v = value.clone();
                UUID id = c.getUuid();
                main.post(() -> {
                    if (g == gatt) onValue(id, v);
                });
            }

            /** Android 10 à 12. */
            @Override
            @SuppressWarnings("deprecation")
            public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
                byte[] value = c.getValue();
                if (value == null) return;
                byte[] v = value.clone();
                UUID id = c.getUuid();
                main.post(() -> {
                    if (g == gatt) onValue(id, v);
                });
            }
        };

        /** Connexion perdue : on attend que le capteur revienne (Android se reconnecte tout seul quand il est à portée). */
        private void lost() {
            if (ended) return;
            stopSession();
            ops.clear();
            busy = false;
            main.removeCallbacks(opTimeout);
            if (!everConnected) {
                retryOrEnd();
                return;
            }
            BluetoothDevice d = gatt != null ? gatt.getDevice() : null;
            closeGatt();
            if (d == null) {
                end((button ? "Bouton" : ring ? "Bague" : "Ceinture") + " : connexion perdue.");
                return;
            }
            setState("reconnecting");
            openGatt(d, true);
            keepTrying();
        }

        private void setup() {
            if (gatt == null) return;
            if (button) {
                BluetoothGattService svc = gatt.getService(ITAG_SERVICE);
                BluetoothGattCharacteristic press = svc != null ? svc.getCharacteristic(ITAG_PRESS) : null;
                if (press == null) {
                    notCompatible("Ce bouton n'est pas compatible : il faut un porte-clés Bluetooth « iTag ».");
                    return;
                }
                enableNotifications(press);
                // Pas de bip quand le téléphone s'éloigne
                BluetoothGattService loss = gatt.getService(LINK_LOSS);
                BluetoothGattCharacteristic level = loss != null ? loss.getCharacteristic(ALERT_LEVEL) : null;
                if (level != null) ops.add(() -> gatt != null && writeCharacteristic(level, new byte[] {0}));
            } else if (ring) {
                BluetoothGattService svc = gatt.getService(ColmiProtocol.SERVICE);
                BluetoothGattCharacteristic notify = svc != null ? svc.getCharacteristic(ColmiProtocol.NOTIFY) : null;
                writeChar = svc != null ? svc.getCharacteristic(ColmiProtocol.WRITE) : null;
                if (notify == null || writeChar == null) {
                    notCompatible("Cette bague n'est pas compatible (elle doit s'utiliser avec l'appli QRing).");
                    return;
                }
                enableNotifications(notify);
                BluetoothGattService v2 = gatt.getService(ColmiProtocol.SERVICE_V2);
                BluetoothGattCharacteristic notifyV2 = v2 != null ? v2.getCharacteristic(ColmiProtocol.NOTIFY_V2) : null;
                writeV2 = v2 != null ? v2.getCharacteristic(ColmiProtocol.WRITE_V2) : null;
                if (notifyV2 != null) enableNotifications(notifyV2);
                else writeV2 = null;
                ops.add(() -> {
                    startSession();
                    return false;
                });
            } else {
                BluetoothGattService svc = gatt.getService(HR_SERVICE);
                BluetoothGattCharacteristic c = svc != null ? svc.getCharacteristic(HR_MEASUREMENT) : null;
                if (c == null) {
                    notCompatible("Cet appareil n'envoie pas de pouls.");
                    return;
                }
                enableNotifications(c);
            }
            ops.add(() -> {
                if (direct && gatt != null) {
                    prefs().edit().putString(kind, gatt.getDevice().getAddress()).apply();
                    direct = false;
                }
                setState("connected");
                return false;
            });
            pump();
        }

        private void enableNotifications(BluetoothGattCharacteristic c) {
            ops.add(() -> {
                if (gatt == null) return false;
                gatt.setCharacteristicNotification(c, true);
                BluetoothGattDescriptor d = c.getDescriptor(CCCD);
                if (d == null) return false;
                return writeDescriptor(d, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
            });
        }

        @SuppressWarnings("deprecation")
        private boolean writeDescriptor(BluetoothGattDescriptor d, byte[] v) {
            if (Build.VERSION.SDK_INT >= 33) return gatt.writeDescriptor(d, v) == BluetoothStatusCodes.SUCCESS;
            d.setValue(v);
            return gatt.writeDescriptor(d);
        }

        @SuppressWarnings("deprecation")
        private boolean writeCharacteristic(BluetoothGattCharacteristic c, byte[] v) {
            int type = (c.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0
                    ? BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                    : BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT;
            if (Build.VERSION.SDK_INT >= 33) return gatt.writeCharacteristic(c, v, type) == BluetoothStatusCodes.SUCCESS;
            c.setWriteType(type);
            c.setValue(v);
            return gatt.writeCharacteristic(c);
        }

        /** Une seule opération Bluetooth à la fois : la suivante part quand la précédente a répondu. */
        private void pump() {
            while (!busy && !ops.isEmpty()) {
                Op op = ops.poll();
                boolean wait;
                try {
                    wait = op.run();
                } catch (Exception e) {
                    wait = false;
                }
                if (wait) {
                    busy = true;
                    main.postDelayed(opTimeout, OP_TIMEOUT);
                }
            }
        }

        private void opDone() {
            busy = false;
            main.removeCallbacks(opTimeout);
            pump();
        }

        private void write(byte[] packet) {
            ops.add(() -> gatt != null && writeChar != null && writeCharacteristic(writeChar, packet));
            pump();
        }

        // ---------------------------------------------------------- mesures

        private void startSession() {
            session = new ColmiProtocol.Session();
            write(ColmiProtocol.gestureOn());
            if (!ringTesting() && (touchBorrowed || ringGestureOn())) {
                write(ColmiProtocol.touchMode(wantedTouchMode()));
                touchBorrowed = false;
            }
            sync = new RingSync(ctx, main, new RingSync.Link() {
                @Override
                public void sendV1(byte[] packet) {
                    write(packet);
                }

                @Override
                public void sendV2(byte[] packet) {
                    ops.add(() -> gatt != null && writeV2 != null && writeCharacteristic(writeV2, packet));
                    pump();
                }

                @Override
                public boolean hasV2() {
                    return writeV2 != null;
                }

                @Override
                public void progress(String state, int done, int total) {
                    emit(event(kind, "sync").putOpt("state", state).putOpt("done", done).putOpt("total", total));
                }
            });
            // Premier relevé juste après la connexion
            lastSync = System.currentTimeMillis() - SYNC_EVERY + SYNC_DELAY;
            main.removeCallbacks(tick);
            main.postDelayed(tick, 1000);
        }

        void startSync(long now) {
            if (sync == null || sync.running()) return;
            lastSync = now;
            sync.start(now);
        }

        private void stopSession() {
            main.removeCallbacks(tick);
            if (sync != null) sync.stop();
            sync = null;
            session = null;
        }

        private void onValue(UUID id, byte[] v) {
            long now = System.currentTimeMillis();
            if (button) {
                if (!ITAG_PRESS.equals(id)) return;
                if (lastPress > 0 && now - lastPress < DOUBLE_PRESS_MS) {
                    long first = lastPress;
                    lastPress = 0;
                    PulseAlert.get(ctx).trigger(BUTTON, first);
                } else {
                    lastPress = now;
                }
            } else if (ring) {
                if (v.length == 0) return;
                if (ColmiProtocol.NOTIFY_V2.equals(id)) {
                    if (sync != null) sync.onV2(v);
                    return;
                }
                if (!ColmiProtocol.NOTIFY.equals(id)) return;
                // Geste de la bague (celui qui prend les photos dans QRing) : marche aussi appli fermée
                if (onRingMessage(v, now)) return;
                if ((v[0] & 0xff) == 0x03 && v.length >= 3 && (v[1] & 0xff) <= 100) noteRingBattery(v[1] & 0xff, v[2] == 1);
                if (sync != null && sync.onV1(v)) return;
                onUnknownMessage(v);
                if (session == null) return;
                int r = session.receive(v, now);
                if (r > 0) reading(r, null, now);
                else if (r == -2 && now - lastNotice > 30_000) {
                    lastNotice = now;
                    emit(event(kind, "notice").putOpt("message", ColmiProtocol.ERROR_WORN));
                }
            } else if (HR_MEASUREMENT.equals(id)) {
                HeartRate hr = HeartRate.parse(v);
                // Pas de contact avec la peau : la valeur ne veut rien dire
                if (hr == null || Boolean.FALSE.equals(hr.contact) || hr.bpm == 0) return;
                reading(hr.bpm, hr.rr, now);
                logBelt(hr.bpm, hr.rr, now);
            }
        }

        private void reading(int bpm, List<Integer> rr, long now) {
            J e = event(kind, "reading").putOpt("hr", bpm).putOpt("at", now);
            if (rr != null && !rr.isEmpty()) e.putOpt("rr", new JSONArray(rr));
            emit(e);
            onHeartRate(kind, bpm, rr);
        }

        // ---------------------------------------------------------- fin

        /** Arrête tout pour ce capteur ; `message` (s'il y en a un) est envoyé à la page. */
        void end(String message) {
            if (ended) return;
            ended = true;
            stopScan();
            main.removeCallbacks(connectTimeout);
            main.removeCallbacks(opTimeout);
            main.removeCallbacks(tick);
            main.removeCallbacks(retry);
            if (sync != null) sync.stop();
            sync = null;
            ops.clear();
            busy = false;
            BluetoothGatt g = gatt;
            if (g != null) {
                // La bague arrête ses mesures (pour sa batterie) avant qu'on raccroche
                if (session != null && writeChar != null) {
                    try {
                        for (byte[] p : session.stop()) writeCharacteristic(writeChar, p);
                    } catch (Exception ignored) {
                        // tant pis
                    }
                }
                session = null;
                main.postDelayed(() -> {
                    try {
                        g.disconnect();
                    } catch (Exception ignored) {
                        // déjà déconnectée
                    }
                    try {
                        g.close();
                    } catch (Exception ignored) {
                        // déjà fermée
                    }
                }, 300);
                gatt = null;
            }
            removed(this);
            emit(event(kind, "end").putOpt("message", message));
        }
    }

    // ------------------------------------------------------------------ ceinture : paquet 0x2A37

    /** Paquet « Heart Rate Measurement » (même lecture que src/sensors/ble/heartRate.ts). */
    static final class HeartRate {
        int bpm;
        Boolean contact;
        final List<Integer> rr = new ArrayList<>();

        static HeartRate parse(byte[] v) {
            if (v == null || v.length < 2) return null;
            int flags = v[0] & 0xff;
            int o = 1;
            HeartRate h = new HeartRate();
            if ((flags & 0x01) != 0) {
                if (v.length < 3) return null;
                h.bpm = (v[1] & 0xff) | ((v[2] & 0xff) << 8);
                o = 3;
            } else {
                h.bpm = v[1] & 0xff;
                o = 2;
            }
            if ((flags & 0x04) != 0) h.contact = (flags & 0x02) != 0;
            if ((flags & 0x08) != 0) o += 2;
            if ((flags & 0x10) != 0) {
                for (; o + 1 < v.length; o += 2) {
                    int raw = (v[o] & 0xff) | ((v[o + 1] & 0xff) << 8);
                    h.rr.add(Math.round(raw * 1000f / 1024f));
                }
            }
            return h;
        }
    }

    /** JSONObject dont putOpt ne lance pas d'exception (les clés sont toujours valides ici). */
    private static final class J {
        final JSONObject o = new JSONObject();

        J putOpt(String k, Object v) {
            try {
                o.putOpt(k, v);
            } catch (Exception ignored) {
                // impossible avec ces valeurs
            }
            return this;
        }

        @Override
        public String toString() {
            return o.toString();
        }
    }
}
