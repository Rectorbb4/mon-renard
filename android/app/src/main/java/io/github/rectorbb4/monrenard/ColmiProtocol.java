package io.github.rectorbb4.monrenard;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Le protocole de la bague Colmi (R02, R03, R06, R09, R10, R12… celles de l'appli QRing).
 * Même logique que src/sensors/ble/colmi.ts côté web : garder les deux d'accord.
 * Sources : github.com/tahnok/colmi_r02_client et Gadgetbridge (appareils « Yawell ring »).
 *
 * Paquet de 16 octets : octet 0 = commande, 1 à 14 = données, 15 = somme des 15 premiers (mod 256).
 */
final class ColmiProtocol {

    static final UUID SERVICE = UUID.fromString("6e40fff0-b5a3-f393-e0a9-e50e24dcca9e");
    static final UUID WRITE = UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e");
    static final UUID NOTIFY = UUID.fromString("6e400003-b5a3-f393-e0a9-e50e24dcca9e");
    /** Second service, pour les gros relevés (sommeil, oxygène). */
    static final UUID SERVICE_V2 = UUID.fromString("de5bf728-d711-4e47-af26-65e3012a5dc7");
    static final UUID WRITE_V2 = UUID.fromString("de5bf72a-d711-4e47-af26-65e3012a5dc7");
    static final UUID NOTIFY_V2 = UUID.fromString("de5bf729-d711-4e47-af26-65e3012a5dc7");

    /** Pouls en continu (≈ 1 valeur/s). Données : 1 = démarrer, 2 = arrêter, 3 = continuer. */
    static final int CMD_REALTIME_HR = 0x1e;
    /** Mesure ponctuelle. Données : type (1 = pouls), action (1 = démarrer). */
    static final int CMD_MEASURE = 0x69;
    static final int CMD_MEASURE_STOP = 0x6a;
    /**
     * Geste « photo » (un coup sec de la main) : il faut l'activer avec 02 04, puis chaque geste arrive
     * en 02 02. Source : DavidWAbrahams/ha-colmi-ble (mesuré sur R02) ; à confirmer sur la R03.
     */
    static final int CMD_GESTURE = 0x02;
    /** Fait clignoter la bague deux fois (même source). */
    static final int CMD_BLINK = 0x10;
    /**
     * Réponses connues : 0x03 batterie, 0x73 « nouvelles données », 0x9e refus de 1E 03 par ta bague,
     * 0x01 heure, 0x10 clignotement, puis les relevés (pas, pouls, stress, variabilité).
     */
    private static final int[] KNOWN = {CMD_REALTIME_HR, CMD_MEASURE, CMD_MEASURE_STOP, 0x03, 0x73, 0x9e, 0x01, CMD_BLINK, 0x43, 0x15, 0x37, 0x39};

    static boolean isKnown(byte cmd) {
        for (int k : KNOWN) if ((cmd & 0xff) == k) return true;
        return false;
    }

    /** La bague coupe le pouls en continu après 60 s sans « continuer ». */
    static final long KEEP_ALIVE_MS = 25_000;
    /** Sans pouls depuis ce délai, on relance la mesure. */
    static final long RESTART_MS = 10_000;

    /** Noms Bluetooth des bagues compatibles (repris de Gadgetbridge). */
    static final Pattern NAME = Pattern.compile("^(COLMI )?R(02|03|06|07|09|10|11C?|12)_.*");

    static final String ERROR_WORN = "La bague est mal placée : capteurs côté paume, bien contre la peau.";

    private ColmiProtocol() {}

    static boolean isRing(String name) {
        return name != null && NAME.matcher(name).matches();
    }

    static byte[] packet(int... bytes) {
        if (bytes.length > 15) throw new IllegalArgumentException("Paquet trop long");
        byte[] p = new byte[16];
        int sum = 0;
        for (int i = 0; i < bytes.length; i++) {
            p[i] = (byte) bytes[i];
            sum += bytes[i] & 0xff;
        }
        p[15] = (byte) (sum & 0xff);
        return p;
    }

    static byte[] gestureOn() {
        return packet(CMD_GESTURE, 0x04);
    }

    static byte[] blink() {
        return packet(CMD_BLINK);
    }

    static boolean isGesture(byte[] v) {
        return v != null && v.length >= 2 && (v[0] & 0xff) == CMD_GESTURE && (v[1] & 0xff) == 0x02;
    }

    /** Pouls lu dans une notification (30-230), -1 s'il n'y en a pas, -2 si la bague est mal placée. */
    static int parse(byte[] v) {
        if (v == null || v.length < 2) return -1;
        int cmd = v[0] & 0xff;
        if (cmd == CMD_REALTIME_HR) return plausible(v[1] & 0xff);
        if (cmd == CMD_MEASURE && v.length >= 4) {
            if ((v[1] & 0xff) != 1) return -1;
            int code = v[2] & 0xff;
            if (code == 1) return -2;
            if (code != 0) return -1;
            return plausible(v[3] & 0xff);
        }
        return -1;
    }

    private static int plausible(int bpm) {
        return bpm >= 30 && bpm <= 230 ? bpm : -1;
    }

    /**
     * Le pouls en direct, seulement quand il sert : sa LED verte vide vite une aussi petite batterie.
     * Ta bague refuse 1E 03 (réponse 9E EE) : on suit colmi_r02_client, 69 01 01 puis 1E 33.
     */
    static final class Session {
        private long lastKeepAlive;
        private long lastHrAt;
        private boolean measuring;

        boolean measuring() {
            return measuring;
        }

        List<byte[]> start(long now) {
            measuring = true;
            lastKeepAlive = now;
            lastHrAt = now;
            List<byte[]> out = new ArrayList<>();
            out.add(packet(CMD_MEASURE, 1, 1));
            return out;
        }

        /** Appelé chaque seconde. */
        List<byte[]> tick(long now) {
            List<byte[]> out = new ArrayList<>();
            if (!measuring || now - lastKeepAlive < KEEP_ALIVE_MS) return out;
            lastKeepAlive = now;
            out.add(packet(CMD_REALTIME_HR, 0x33));
            if (now - lastHrAt > RESTART_MS) out.add(packet(CMD_MEASURE, 1, 1));
            return out;
        }

        int receive(byte[] value, long now) {
            int r = parse(value);
            if (r > 0) lastHrAt = now;
            return r;
        }

        List<byte[]> stop() {
            List<byte[]> out = new ArrayList<>();
            if (measuring) out.add(packet(CMD_MEASURE_STOP, 1, 0, 0));
            measuring = false;
            return out;
        }
    }
}
