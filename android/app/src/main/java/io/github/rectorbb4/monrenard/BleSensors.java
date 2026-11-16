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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

    private static final long SCAN_TIMEOUT = 20_000;
    /** Si l'appareil déjà connu n'apparaît pas, on prend le premier autre trouvé au bout de ce délai. */
    private static final long KNOWN_GRACE = 4_000;
    private static final long CONNECT_TIMEOUT = 15_000;
    private static final long OP_TIMEOUT = 3_000;
    private static final long WIDGET_EVERY = 5_000;
    /** Tant que la ceinture donne un pouls (moins de 5 s), celui de la bague est ignoré : elle est plus précise. */
    private static final long PREFER_BELT_MS = 5_000;

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

    /** Le bouton pause est branché (il doit pouvoir rester connecté toute la journée). */
    boolean hasButton() {
        return sensors.containsKey(BUTTON);
    }

    static String label(String kind) {
        return BELT.equals(kind) ? "ceinture" : RING.equals(kind) ? "bague" : "bouton pause";
    }

    /** Un iTag : son nom (« iTAG ») ou son service FFE0. */
    static boolean isButton(String name, List<ParcelUuid> uuids) {
        if (name != null && name.trim().toLowerCase(java.util.Locale.ROOT).contains("itag")) return true;
        return uuids != null && uuids.contains(new ParcelUuid(ITAG_SERVICE));
    }

    /** Paquets de la bague que l'appli ne connaît pas encore (pour comprendre son geste au premier essai). */
    String unknownPackets() {
        return ctx.getSharedPreferences("capteurs", Context.MODE_PRIVATE).getString("inconnus", "");
    }

    private void logUnknown(byte[] v) {
        SharedPreferences p = ctx.getSharedPreferences("capteurs", Context.MODE_PRIVATE);
        StringBuilder hex = new StringBuilder(new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.FRANCE).format(new java.util.Date()));
        hex.append(' ');
        for (byte b : v) hex.append(String.format("%02x", b));
        String[] old = p.getString("inconnus", "").split("\n");
        StringBuilder all = new StringBuilder(hex);
        for (int i = 0; i < Math.min(old.length, 11); i++) if (!old[i].isEmpty()) all.append('\n').append(old[i]);
        p.edit().putString("inconnus", all.toString()).apply();
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
    }

    private void onHeartRate(String kind, int bpm) {
        long now = System.currentTimeMillis();
        if (BELT.equals(kind)) lastBeltHr = now;
        else if (now - lastBeltHr < PREFER_BELT_MS) return;
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
        if (BELT.equals(s.kind)) lastBeltHr = 0;
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
        private boolean ended;
        private boolean everConnected;
        private int attempts;
        private final ArrayDeque<Op> ops = new ArrayDeque<>();
        private boolean busy;
        private ColmiProtocol.Session session;
        private long lastNotice;

        private final Runnable scanTimeout = this::nothingFound;
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
                for (byte[] p : session.tick(System.currentTimeMillis())) write(p);
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

        void scan() {
            refreshActive();
            emitStatus();
            BluetoothAdapter a = adapter();
            if (a == null || !a.isEnabled()) {
                end("Le Bluetooth est éteint : active-le pour brancher tes capteurs.");
                return;
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

        private void nothingFound() {
            end(button
                    ? "Aucun bouton trouvé. Appuie une fois dessus pour le réveiller, et vérifie qu'il n'est pas connecté à une autre appli (iSearching…)."
                    : ring
                    ? "Aucune bague trouvée. Vérifie qu'elle est chargée et que l'appli QRing est fermée (la bague ne parle qu'à une appli à la fois)."
                    : "Aucune ceinture trouvée. Vérifie qu'elle est bien mise, électrodes mouillées : elle ne s'allume qu'au contact de la peau.");
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
            prefs().edit().putString(kind, d.getAddress()).apply();
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
        }

        private void setup() {
            if (gatt == null) return;
            if (button) {
                BluetoothGattService svc = gatt.getService(ITAG_SERVICE);
                BluetoothGattCharacteristic press = svc != null ? svc.getCharacteristic(ITAG_PRESS) : null;
                if (press == null) {
                    end("Ce bouton n'est pas compatible : il faut un porte-clés Bluetooth « iTag ».");
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
                    end("Cette bague n'est pas compatible (elle doit s'utiliser avec l'appli QRing).");
                    return;
                }
                enableNotifications(notify);
                ops.add(() -> {
                    startSession();
                    return false;
                });
            } else {
                BluetoothGattService svc = gatt.getService(HR_SERVICE);
                BluetoothGattCharacteristic c = svc != null ? svc.getCharacteristic(HR_MEASUREMENT) : null;
                if (c == null) {
                    end("Cet appareil n'envoie pas de pouls.");
                    return;
                }
                enableNotifications(c);
            }
            ops.add(() -> {
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
            for (byte[] p : session.start(System.currentTimeMillis())) write(p);
            main.removeCallbacks(tick);
            main.postDelayed(tick, 1000);
        }

        private void stopSession() {
            main.removeCallbacks(tick);
            session = null;
        }

        private void onValue(UUID id, byte[] v) {
            long now = System.currentTimeMillis();
            if (button) {
                if (!ITAG_PRESS.equals(id)) return;
                if (lastPress > 0 && now - lastPress < DOUBLE_PRESS_MS) {
                    lastPress = 0;
                    PulseAlert.get(ctx).trigger(BUTTON);
                } else {
                    lastPress = now;
                }
            } else if (ring) {
                if (!ColmiProtocol.NOTIFY.equals(id) || v.length == 0) return;
                // Geste de la bague (celui qui prend les photos dans QRing) : à l'essai, d'après Gadgetbridge
                if ((v[0] & 0xff) == ColmiProtocol.CMD_GESTURE) {
                    PulseAlert.get(ctx).trigger(RING);
                    return;
                }
                if (!ColmiProtocol.isKnown(v[0])) logUnknown(v);
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
            }
        }

        private void reading(int bpm, List<Integer> rr, long now) {
            J e = event(kind, "reading").putOpt("hr", bpm).putOpt("at", now);
            if (rr != null && !rr.isEmpty()) e.putOpt("rr", new JSONArray(rr));
            emit(e);
            onHeartRate(kind, bpm);
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
