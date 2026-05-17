import React from "react";
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

// Anchor the WebView's effective origin at the app's document directory
// so Leaflet's <img src="file://…/offlineTiles/…">  loads aren't treated
// as cross-origin by iOS WKWebView. Without this, even with all three
// allow-file-access flags set, iOS silently refuses to load file://
// images from an `about:blank`-hosted HTML payload — which is exactly
// what was happening to the downloaded USGS tiles. `documentDirectory`
// is undefined on web (and there we use an <iframe> srcDoc anyway), so
// we fall back to an empty string and skip baseUrl in that branch.
const FS_BASE_URL: string | undefined =
  Platform.OS === "web" ? undefined : FileSystem.documentDirectory || undefined;

/**
 * Cross-platform Leaflet/OSM map.
 * - Native: renders a react-native-webview (with file:// baseUrl so
 *   on-disk USGS tiles load correctly)
 * - Web: renders an <iframe srcDoc=...> so the map actually shows
 * - onMessage: called with postMessage payload from inside the map (string).
 * - Both webViewRef and iframeRef are exposed so callers can push commands in.
 */
export default function MapView({ html, style, testID, webViewRef, iframeRef, onMessage }: Props) {
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
    <WebView
      ref={webViewRef}
      originWhitelist={["*", "file://"]}
      source={{ html, baseUrl: FS_BASE_URL }}
      style={[styles.fill, style]}
      javaScriptEnabled
      domStorageEnabled
      scalesPageToFit={false}
      mixedContentMode="always"
      // Required so offline USGS Topo tiles stored via expo-file-system can
      // be loaded by Leaflet via file:// URLs.
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
