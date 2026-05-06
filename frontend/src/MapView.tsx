import React from "react";
import { Platform, View, StyleSheet, ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

type Props = {
  html: string;
  style?: ViewStyle;
  testID?: string;
  webViewRef?: React.Ref<WebView>;
};

/**
 * Cross-platform Leaflet/OSM map.
 * - Native: renders a react-native-webview
 * - Web: renders an <iframe srcDoc=...> so the map actually shows
 */
export default function MapView({ html, style, testID, webViewRef }: Props) {
  if (Platform.OS === "web") {
    return (
      <View style={[styles.fill, style]} testID={testID}>
        {/* @ts-ignore - iframe is a valid web-only DOM element */}
        <iframe
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
      originWhitelist={["*"]}
      source={{ html }}
      style={[styles.fill, style]}
      javaScriptEnabled
      domStorageEnabled
      scalesPageToFit={false}
      mixedContentMode="always"
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
