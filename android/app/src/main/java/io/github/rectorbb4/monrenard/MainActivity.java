package io.github.rectorbb4.monrenard;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * L'appli web « Mon renard » en plein écran. Elle est chargée depuis le site, donc les mises à jour
 * arrivent toutes seules ; une fois ouverte, elle marche hors connexion grâce à son cache.
 * Le pont {@link RenardBridge} permet à la page de mettre le widget à jour.
 */
public class MainActivity extends Activity {

    private static final int FILE_REQUEST = 42;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private boolean pageReady = false;
    private String pendingAction = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Version d'essai seulement : la page peut être inspectée depuis l'ordinateur (tests automatiques)
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.app_bg));
        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.app_bg));
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        fitBetweenSystemBars(root);
        tintSystemBars();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " MonRenardAndroid/" + BuildConfig.VERSION_NAME);

        web.addJavascriptInterface(new RenardBridge(this), "RenardAndroid");
        // Les mesures des capteurs Bluetooth partent vers la page (src/sensors/native.ts)
        BleSensors.get(this).setListener(json -> runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('renard-ble',{detail:" + json + "}))", null);
        }));
        // Tes capteurs reviennent sans rien faire, même juste après une mise à jour de l'appli
        BleSensors.get(this).resumeWanted();
        // L'alerte « ton pouls monte » prévient la page (écran d'alerte, nom du son choisi)
        PulseAlert.get(this).setListener((name, json) -> runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('" + name + "',{detail:" + json + "}))", null);
        }));
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        String action = actionOf(getIntent());
        Uri start = Uri.parse(BuildConfig.START_URL);
        if (action != null) start = start.buildUpon().appendQueryParameter("action", action).build();
        if (savedInstanceState == null || !restoreWeb(savedInstanceState)) web.loadUrl(start.toString());
    }

    private boolean restoreWeb(Bundle state) {
        return web.restoreState(state) != null;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    /** Un appui sur un bouton du widget alors que l'appli est déjà ouverte. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String action = actionOf(intent);
        if (action == null) return;
        if (pageReady) sendAction(action);
        else pendingAction = action;
    }

    private void sendAction(String action) {
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('renard-action',{detail:'" + action + "'}))", null);
    }

    /** « monrenard://action/feel » → « feel » (seules les actions connues sont gardées). */
    static String actionOf(Intent intent) {
        if (intent == null || intent.getData() == null) return null;
        Uri data = intent.getData();
        if (!"monrenard".equals(data.getScheme()) || !"action".equals(data.getHost())) return null;
        String action = data.getLastPathSegment();
        return "feel".equals(action) || "checkin".equals(action) || "alert".equals(action) || "breathe".equals(action) ? action : null;
    }

    private static boolean isOurs(Uri url) {
        Uri start = Uri.parse(BuildConfig.START_URL);
        return start.getScheme().equals(url.getScheme())
                && start.getAuthority().equals(url.getAuthority())
                && url.getPath() != null
                && url.getPath().startsWith(start.getPath());
    }

    private void openOutside(Uri url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (ActivityNotFoundException e) {
            // Rien pour ouvrir ce lien (ex. pas d'appli téléphone sur une tablette)
        }
    }

    void keepScreenOn(boolean on) {
        runOnUiThread(() -> {
            if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    // ------------------------------------------------------------------ affichage

    /** La page reste entre la barre d'état et la barre de navigation, et remonte avec le clavier. */
    @SuppressWarnings("deprecation")
    private void fitBetweenSystemBars(View root) {
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom, left, right;
            if (Build.VERSION.SDK_INT >= 30) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                top = bars.top;
                bottom = bars.bottom;
                left = bars.left;
                right = bars.right;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
                left = insets.getSystemWindowInsetLeft();
                right = insets.getSystemWindowInsetRight();
            }
            v.setPadding(left, top, right, bottom);
            return insets;
        });
    }

    @SuppressWarnings("deprecation")
    private void tintSystemBars() {
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(night ? 0 : light, light);
            }
        } else if (!night) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
        getWindow().setStatusBarColor(getColor(R.color.app_bg));
        getWindow().setNavigationBarColor(getColor(R.color.app_bg));
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        tintSystemBars();
    }

    // ------------------------------------------------------------------ cycle de vie

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        PulseAlert.appVisible = true;
        // La page reprend les mesures en direct
        LiveService.stop(this);
    }

    /**
     * L'appli quitte l'écran : la page arrête ses mesures. Si le widget affiche un pouls en direct,
     * le service prend le relais (démarré ici, tant que l'appli est encore visible, comme Android l'exige).
     */
    @Override
    protected void onPause() {
        PulseAlert.appVisible = false;
        BleSensors.get(this).setRingTest(false);
        LiveService.startIfLive(this);
        web.onPause();
        super.onPause();
    }

    /** Une fois : autorisation d'afficher la notification « Démo en direct » (Android 13 et plus). */
    void askNotificationsOnce() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        android.content.SharedPreferences p = getSharedPreferences("widget", MODE_PRIVATE);
        if (p.getBoolean("askedNotifications", false)) return;
        p.edit().putBoolean("askedNotifications", true).apply();
        runOnUiThread(() -> requestPermissions(new String[] {android.Manifest.permission.POST_NOTIFICATIONS}, 7));
    }

    // ------------------------------------------------------------------ capteurs Bluetooth

    private static final int BLE_PERMISSIONS = 8;
    private static final int BLE_ENABLE = 9;
    /** Capteurs demandés par la page, en attente d'une autorisation ou de l'allumage du Bluetooth. */
    private final java.util.LinkedHashSet<String> pendingSensors = new java.util.LinkedHashSet<>();

    private String[] blePermissions() {
        if (Build.VERSION.SDK_INT >= 31) {
            return new String[] {android.Manifest.permission.BLUETOOTH_SCAN, android.Manifest.permission.BLUETOOTH_CONNECT};
        }
        // Android 10 et 11 : chercher des appareils Bluetooth demande la localisation
        return new String[] {android.Manifest.permission.ACCESS_FINE_LOCATION};
    }

    /** Demandé par la page : autorisations, Bluetooth allumé, puis connexion. */
    void startSensor(String kind) {
        pendingSensors.add(kind);
        askNotificationsOnce();
        java.util.List<String> missing = new java.util.ArrayList<>();
        for (String p : blePermissions()) {
            if (checkSelfPermission(p) != android.content.pm.PackageManager.PERMISSION_GRANTED) missing.add(p);
        }
        if (!missing.isEmpty()) {
            for (String k : pendingSensors) BleSensors.get(this).emitStatus(k, "permission");
            requestPermissions(missing.toArray(new String[0]), BLE_PERMISSIONS);
            return;
        }
        continueSensors();
    }

    @SuppressWarnings("deprecation")
    private void continueSensors() {
        BleSensors ble = BleSensors.get(this);
        if (!ble.isEnabled()) {
            try {
                startActivityForResult(new Intent(android.bluetooth.BluetoothAdapter.ACTION_REQUEST_ENABLE), BLE_ENABLE);
            } catch (Exception e) {
                failPending("Le Bluetooth est éteint : active-le pour brancher tes capteurs.");
            }
            return;
        }
        if (Build.VERSION.SDK_INT < 31) {
            android.location.LocationManager lm = getSystemService(android.location.LocationManager.class);
            if (lm != null && !lm.isLocationEnabled()) {
                failPending("Active la localisation du téléphone : sur cette version d'Android, elle est nécessaire pour trouver les capteurs Bluetooth.");
                return;
            }
        }
        for (String k : pendingSensors) ble.start(k);
        pendingSensors.clear();
    }

    private void failPending(String message) {
        for (String k : pendingSensors) BleSensors.get(this).emitEnd(k, message);
        pendingSensors.clear();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != BLE_PERMISSIONS) return;
        boolean all = results.length > 0;
        for (int r : results) all &= r == android.content.pm.PackageManager.PERMISSION_GRANTED;
        if (all) continueSensors();
        else failPending(Build.VERSION.SDK_INT >= 31
                ? "Sans l'autorisation « Appareils à proximité », l'appli ne peut pas trouver tes capteurs. Tu peux la donner dans les réglages de l'appli."
                : "Sans l'autorisation de localisation, l'appli ne peut pas trouver tes capteurs Bluetooth.");
    }

    @Override
    protected void onDestroy() {
        BleSensors.get(this).setListener(null);
        PulseAlert.get(this).setListener(null);
        web.destroy();
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    /** Le tapotement de la bague arrive comme une touche média : il ne doit pas changer de chanson ici. */
    @Override
    public boolean dispatchKeyEvent(android.view.KeyEvent e) {
        android.view.InputDevice device = e.getDevice();
        String name = device != null ? device.getName() : null;
        boolean down = e.getAction() == android.view.KeyEvent.ACTION_DOWN;
        if (BleSensors.get(this).onRingKey(name, e.getKeyCode(), down, e.getRepeatCount())) return true;
        return super.dispatchKeyEvent(e);
    }

    // ------------------------------------------------------------------ son de l'alerte

    private static final int PICK_RINGTONE = 10;
    private static final int PICK_MUSIC = 11;

    /** Sonneries du téléphone, ou une musique (fichier audio) gardée ensuite par l'appli. */
    @SuppressWarnings("deprecation")
    void pickAlertSound(boolean music) {
        Intent pick;
        if (music) {
            pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("audio/*");
        } else {
            pick = new Intent(android.media.RingtoneManager.ACTION_RINGTONE_PICKER)
                    .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_TYPE, android.media.RingtoneManager.TYPE_ALARM)
                    .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_TITLE, "Son de l'alerte")
                    .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
                    .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
                    .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI,
                            android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM));
            Uri current = PulseAlert.get(this).soundUri();
            if (current != null) pick.putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, current);
        }
        try {
            startActivityForResult(pick, music ? PICK_MUSIC : PICK_RINGTONE);
        } catch (ActivityNotFoundException e) {
            // Pas de sélecteur sur ce téléphone : le son par défaut reste
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PICK_RINGTONE || requestCode == PICK_MUSIC) {
            if (resultCode != RESULT_OK || data == null) return;
            if (requestCode == PICK_MUSIC) {
                Uri uri = data.getData();
                if (uri == null) return;
                try {
                    // La musique doit rester lisible plus tard, appli fermée
                    getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (SecurityException e) {
                    return;
                }
                PulseAlert.get(this).setSound(uri, true);
            } else {
                Uri uri = data.getParcelableExtra(android.media.RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
                boolean byDefault = uri == null || uri.equals(android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM));
                PulseAlert.get(this).setSound(byDefault ? null : uri, false);
            }
            return;
        }
        if (requestCode == BLE_ENABLE) {
            if (resultCode == RESULT_OK) continueSensors();
            else failPending("Le Bluetooth est éteint : active-le pour brancher tes capteurs.");
            return;
        }
        if (requestCode == FILE_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // ------------------------------------------------------------------ navigateur intégré

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            // Une nouvelle version de l'appli (.apk) se télécharge avec le navigateur du téléphone
            boolean apk = url.getPath() != null && url.getPath().endsWith(".apk");
            if (isOurs(url) && !apk) return false;
            // Téléphone (3114, 15…), crédits, tout le reste : dans l'appli adaptée
            openOutside(url);
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (!isOurs(Uri.parse(url))) return;
            pageReady = true;
            if (pendingAction != null) {
                sendAction(pendingAction);
                pendingAction = null;
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            pageReady = false;
            String retry = BuildConfig.START_URL;
            String html = "<!doctype html><html lang='fr'><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                    + "<style>body{font-family:sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;text-align:center;"
                    + "padding:24px;box-sizing:border-box;background:#edf2f1;color:#16232c}"
                    + "@media(prefers-color-scheme:dark){body{background:#13202b;color:#e8eef1}}"
                    + "a{display:inline-block;margin-top:16px;padding:14px 24px;border-radius:999px;background:#c9551f;color:#fff;"
                    + "text-decoration:none;font-weight:700}</style></head><body><div><h1>Pas de connexion</h1>"
                    + "<p>La toute première ouverture de Mon renard a besoin d'internet.<br>Ensuite, il marche aussi hors connexion.</p>"
                    + "<a href='" + retry + "'>Réessayer</a></div></body></html>";
            view.loadDataWithBaseURL(retry, html, "text/html", "UTF-8", null);
        }
    }

    private class Chrome extends WebChromeClient {
        /** « Restaurer une sauvegarde » : ouvre le sélecteur de fichiers d'Android. */
        @Override
        @SuppressWarnings("deprecation")
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            pick.setType("*/*");
            pick.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {"application/json", "text/plain", "application/octet-stream"});
            try {
                startActivityForResult(Intent.createChooser(pick, "Choisir une sauvegarde"), FILE_REQUEST);
                return true;
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                return false;
            }
        }
    }
}
