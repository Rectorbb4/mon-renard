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
        return "feel".equals(action) || "checkin".equals(action) ? action : null;
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
        // La page reprend les mesures en direct
        LiveService.stop(this);
    }

    /**
     * L'appli quitte l'écran : la page arrête ses mesures. Si le widget affiche un pouls en direct,
     * le service prend le relais (démarré ici, tant que l'appli est encore visible, comme Android l'exige).
     */
    @Override
    protected void onPause() {
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

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
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
