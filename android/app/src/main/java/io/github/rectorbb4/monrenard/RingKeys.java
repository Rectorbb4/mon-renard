package io.github.rectorbb4.monrenard;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioPlaybackConfiguration;
import android.media.AudioTrack;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.InputDevice;
import android.view.KeyEvent;

import java.util.List;

/**
 * Reçoit les tapotements de la bague quand l'appli n'est pas à l'écran, ou écran éteint.
 * Android envoie une touche média à la dernière appli qui a joué du son : on joue donc un instant de silence
 * (sans couper la musique) pour être cette appli. Les touches d'un casque sont rendues aussitôt à la musique.
 * Fil principal.
 */
final class RingKeys {

    private static final int SILENCE_RATE = 8000;
    private static final int SILENCE_MS = 250;
    private static final long CLAIM_GAP_MS = 4_000;
    private static final long AFTER_MUSIC_MS = 1_500;
    private static final long GIVE_BACK_MS = 1_500;

    private final Context ctx;
    private final BleSensors ble;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AudioManager audio;
    private MediaSession session;
    private long lastClaim;

    private final Runnable claimIfMusic = () -> {
        if (audioPlaying()) claim();
    };
    private final Runnable takeBack = () -> {
        if (session != null) session.setActive(true);
    };

    private final BroadcastReceiver screenOff = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            ble.reapplyTouch();
            claim();
        }
    };

    private final AudioManager.AudioPlaybackCallback playback = new AudioManager.AudioPlaybackCallback() {
        @Override
        public void onPlaybackConfigChanged(List<AudioPlaybackConfiguration> configs) {
            main.removeCallbacks(claimIfMusic);
            main.postDelayed(claimIfMusic, AFTER_MUSIC_MS);
        }
    };

    RingKeys(Context ctx, BleSensors ble) {
        this.ctx = ctx;
        this.ble = ble;
        audio = ctx.getSystemService(AudioManager.class);
    }

    private boolean audioPlaying() {
        return audio != null && audio.isMusicActive();
    }

    void setOn(boolean on) {
        if (on == (session != null) || audio == null) return;
        if (on) start();
        else stop();
    }

    private void start() {
        session = new MediaSession(ctx, "BagueRenard");
        session.setCallback(new MediaSession.Callback() {
            @Override
            public boolean onMediaButtonEvent(Intent intent) {
                return onButton(intent);
            }
        }, main);
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS)
                .setState(PlaybackState.STATE_PLAYING, 0, 0)
                .build());
        session.setActive(true);
        IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_OFF);
        if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(screenOff, filter, Context.RECEIVER_NOT_EXPORTED);
        else ctx.registerReceiver(screenOff, filter);
        audio.registerAudioPlaybackCallback(playback, main);
        claim();
    }

    private void stop() {
        main.removeCallbacks(claimIfMusic);
        main.removeCallbacks(takeBack);
        audio.unregisterAudioPlaybackCallback(playback);
        ctx.unregisterReceiver(screenOff);
        session.setActive(false);
        session.release();
        session = null;
    }

    @SuppressWarnings("deprecation")
    private boolean onButton(Intent intent) {
        KeyEvent e = Build.VERSION.SDK_INT >= 33
                ? intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent.class)
                : intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
        if (e == null) return false;
        InputDevice device = InputDevice.getDevice(e.getDeviceId());
        String name = device != null ? device.getName() : null;
        if (ble.onRingKey(name, e.getKeyCode(), e.getAction() == KeyEvent.ACTION_DOWN, e.getRepeatCount())) return true;
        // Pas la bague (un casque, par exemple) : la touche revient à l'appli de musique
        session.setActive(false);
        audio.dispatchMediaKeyEvent(e);
        main.removeCallbacks(takeBack);
        main.postDelayed(takeBack, GIVE_BACK_MS);
        return true;
    }

    /** Un quart de seconde de silence, sans demander la main sur le son : la musique continue. */
    private void claim() {
        long now = System.currentTimeMillis();
        if (session == null || now - lastClaim < CLAIM_GAP_MS) return;
        lastClaim = now;
        int bytes = SILENCE_RATE * 2 * SILENCE_MS / 1000;
        AudioTrack track;
        try {
            track = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(SILENCE_RATE)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build())
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .setBufferSizeInBytes(bytes)
                    .build();
            track.write(new byte[bytes], 0, bytes);
            track.play();
        } catch (Exception e) {
            return; // son indisponible : les touches arriveront quand l'appli sera à l'écran
        }
        main.postDelayed(() -> {
            try {
                track.stop();
            } catch (IllegalStateException ignored) {
                // déjà arrêté
            }
            track.release();
        }, SILENCE_MS + 100);
    }
}
