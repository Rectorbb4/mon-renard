package io.github.rectorbb4.monrenard;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Après une mise à jour de l'appli ou un redémarrage du téléphone : les capteurs se rebranchent tout seuls. */
public class SensorsRestart extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_MY_PACKAGE_REPLACED.equals(action) && !Intent.ACTION_BOOT_COMPLETED.equals(action)) return;
        BleSensors ble = BleSensors.get(context);
        ble.resumeWanted();
        if (ble.anyActive()) LiveService.startIfLive(context);
    }
}
