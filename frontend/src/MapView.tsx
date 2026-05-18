import React, { useEffect, useRef, useState } from "react";
import { Platform, View, StyleSheet, ViewStyle } from "react-native";
import { WebView } from "react-native-webview";
// We import from the legacy entry point to match the rest of the app
// (Expo SDK 54's top-level expo-file-system throws on the older
// download/info APIs we rely on elsewhere).
import * as FileSystem from "expo-file-system/legacy";

type Props = {
  html: string;
  style?: ViewStyle;
  testID?: string;
  webViewRef?: React.Ref<WebView>;
  iframeRef?: React.Ref<HTMLIFrameElement>;
  onMessage?: (data: string) => void;
};

// Document directory on native, undefined on web.
const DOC_DIR: string | undefined =
  Platform.OS === "web" ? undefined : FileSystem.documentDirectory || undefined;

// Module-level counter so each MapView instance gets a unique temp filename.
let __mapInstanceSeq = 0;

/**
 * Cross-platform Leaflet/OSM map.
 *
 * Native:
 *   We write the supplied `html` string to a temp file inside the app's
 *   documentDirectory and load the WebView via `source={{ uri: file:// … }}`.
 *   This is the ONLY reliable way to convince WKWebView to allow Leaflet's
 *   <img src="file://…/offlineTiles/…"> tile reads — when the host HTML is
 *   served as an `about:blank` injected string (the prior `source={{ html }}`
 *   path), iOS refuses to load local file:// images even with
 *   allowFileAccessFromFileURLs + allowUniversalAccessFromFileURLs set.
 *   Hosting the HTML from a file:// URL makes the page origin a file://
 *   origin, which (combined with allowingReadAccessToURL pointing at
 *   documentDirectory) lets the offline tile images load.
 *
 * Web:
 *   Renders an <iframe srcDoc=...>.
 */
export default function MapView({
  html,
  style,
  testID,
  webViewRef,
  iframeRef,
  onMessage,
}: Props) {
  if (Platform.OS === "web") {
    return (
      <View style={[styles.fill, style]} testID={testID}>
        {/* @ts-ignore - iframe is a valid web-only DOM element */}
        <iframe
          ref={iframeRef as any}
          srcDoc={html}
          style={{ border: 0, width: "100%", height: "100%", display: "block" }}
          // @ts-ignore
          sandbox="allow-scripts allow-same-origin"
          title="map"
        />
      </View>
    );
  }

  return (
    <NativeMapView
      html={html}
      style={style}
      testID={testID}
      webViewRef={webViewRef}
      onMessage={onMessage}
    />
  );
}

/**
 * Native-only inner component. Splitting it out keeps the React hooks
 * out of the conditional render path in the cross-platform wrapper.
 */
function NativeMapView({
  html,
  style,
  testID,
  webViewRef,
  onMessage,
}: Omit<Props, "iframeRef">) {
  // Stable temp file path for this component's lifetime.
  const tempPathRef = useRef<string | null>(null);
  if (tempPathRef.current === null && DOC_DIR) {
    __mapInstanceSeq += 1;
    tempPathRef.current = `${DOC_DIR}rrmap_${Date.now()}_${__mapInstanceSeq}.html`;
  }

  // `tick` increments after each successful write so we can force-remount
  // the WebView (the file is fixed but Leaflet needs a fresh load).
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);

  // Whenever html changes, rewrite the temp file and bump the key.
  useEffect(() => {
    let cancelled = false;
    const path = tempPathRef.current;
    if (!path) return;
    (async () => {
      try {
        await FileSystem.writeAsStringAsync(path, html, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (!cancelled) {
          setReady(true);
          setTick((n) => n + 1);
        }
      } catch (err) {
        // If writing the temp file fails for any reason, fall back to
        // injected HTML (worst-case: same behavior we had before).
        // eslint-disable-next-line no-console
        console.warn("[MapView] failed to write temp html:", err);
        if (!cancelled) {
          setReady(true);
          setTick((n) => n + 1);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [html]);

  // Clean up the temp file on unmount.
  useEffect(() => {
    return () => {
      const path = tempPathRef.current;
      if (!path) return;
      FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {
        /* swallow */
      });
    };
  }, []);

  if (!ready) {
    // Render nothing for the first instant while we write the temp file.
    // (Usually <16 ms.) This avoids briefly painting an `about:blank`
    // WebView and then swapping it for the file:// one.
    return <View style={[styles.fill, style]} testID={testID} />;
  }

  const path = tempPathRef.current;
  // FileSystem.documentDirectory ALREADY has a `file://` prefix on native,
  // so `path` is already a valid file:// URI — DO NOT double-prefix.
  const fileUri = path;

  // If we somehow couldn't get a path, render the legacy injected-html
  // WebView so the map at least appears.
  if (!fileUri) {
    return (
      <WebView
        key={`fallback-${tick}`}
        ref={webViewRef}
        originWhitelist={["*", "file://"]}
        source={{ html }}
        style={[styles.fill, style]}
        javaScriptEnabled
        domStorageEnabled
        scalesPageToFit={false}
        mixedContentMode="always"
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        onMessage={(e) => {
          if (onMessage && e?.nativeEvent?.data) onMessage(e.nativeEvent.data);
        }}
        testID={testID}
      />
    );
  }

  return (
    <WebView
      // key forces a fresh WebView when html content changes (same reload
      // semantics we had when using source={{ html }}).
      key={`map-${tick}`}
      ref={webViewRef}
      originWhitelist={["*", "file://"]}
      source={{ uri: fileUri }}
      // CRITICAL (iOS / WKWebView): without this, the WebView is sandboxed
      // to ONLY the directory of the html file, which means file:// reads
      // of sibling subdirectories (offlineTiles/, etc.) are denied.
      // Granting read access to documentDirectory lets Leaflet load the
      // offline tile images.
      allowingReadAccessToURL={DOC_DIR}
      style={[styles.fill, style]}
      javaScriptEnabled
      domStorageEnabled
      scalesPageToFit={false}
      mixedContentMode="always"
      allowFileAccess
      allowFileAccessFromFileURLs
      allowUniversalAccessFromFileURLs
      onMessage={(e) => {
        if (onMessage && e?.nativeEvent?.data) onMessage(e.nativeEvent.data);
      }}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
