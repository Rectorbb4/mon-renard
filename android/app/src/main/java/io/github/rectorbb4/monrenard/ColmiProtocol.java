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

    /** Pouls en continu (≈ 1 valeur/s). Données : 1 = démarrer, 2 = arrêter, 3 = continuer. */
    static final int CMD_REALTIME_HR = 0x1e;
    /** Mesure ponctuelle. Données : type (1 = pouls), action (1 = démarrer). */
    static final int CMD_MEASURE = 0x69;
    static final int CMD_MEASURE_STOP = 0x6a;

    /** La bague coupe le pouls en continu après 60 s sans « continuer ». */
    static final long KEEP_ALIVE_MS = 25_000;
    static final long FALLBACK_MS = 15_000;

    /** Noms Bluetooth des bagues compatibles (repris de Gadgetbridge). */
    static final Pattern NAME = Pattern.compile("^(R02_|R03_|R06_|R09_|R10_|R11C?_|COLMI R07_|COLMI R10_|COLMI R12_).*");

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

    /** Quoi envoyer à la bague, et quand (sans Bluetooth). */
    static final class Session {
        private long startedAt;
        private long lastKeepAlive;
        private long lastHrAt;
        private boolean fallback;

        List<byte[]> start(long now) {
            startedAt = now;
            lastKeepAlive = now;
            lastHrAt = 0;
            fallback = false;
            List<byte[]> out = new ArrayList<>();
            out.add(packet(CMD_REALTIME_HR, 1));
            return out;
        }

        /** Appelé chaque seconde. */
        List<byte[]> tick(long now) {
            List<byte[]> out = new ArrayList<>();
            if (!fallback && lastHrAt == 0 && now - startedAt >= FALLBACK_MS) {
                fallback = true;
                out.add(packet(CMD_MEASURE, 1, 1));
            }
            if (now - lastKeepAlive >= KEEP_ALIVE_MS) {
                lastKeepAlive = now;
                out.add(packet(CMD_REALTIME_HR, 3));
                if (fallback) out.add(packet(CMD_MEASURE, 1, 1));
            }
            return out;
        }

        int receive(byte[] value, long now) {
            int r = parse(value);
            if (r > 0) lastHrAt = now;
            return r;
        }

        List<byte[]> stop() {
            List<byte[]> out = new ArrayList<>();
            out.add(packet(CMD_REALTIME_HR, 2));
            if (fallback) out.add(packet(CMD_MEASURE_STOP, 1, 0, 0));
            return out;
        }
    }
}
