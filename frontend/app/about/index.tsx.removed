// About landing screen — links to Terms of Service and Attributions.

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { COLORS } from "../../src/theme";

export default function AboutIndex() {
  const router = useRouter();
  const version =
    (Constants.expoConfig as any)?.version ||
    (Constants as any).manifest?.version ||
    "1.0.0";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="about-screen">
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={10}
          testID="about-back"
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.textMain} />
        </TouchableOpacity>
        <Text style={styles.title}>About RiverRight</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={styles.brandWrap}>
          <View style={styles.logoCircle}>
            <Ionicons name="water" size={28} color="#fff" />
          </View>
          <Text style={styles.appName}>RiverRight</Text>
          <Text style={styles.tagline}>Read the river. Run it right.</Text>
          <Text style={styles.versionText}>Version {version}</Text>
        </View>

        <Text style={styles.blurb}>
          RiverRight is a curated guide and GPS companion for American rivers —
          built for paddlers, by paddlers. We pair live USGS flow data with
          hand-verified river maps, rapids, and access points so you can plan
          smarter and paddle with confidence.
        </Text>

        <TouchableOpacity
          testID="about-link-terms"
          style={styles.linkCard}
          activeOpacity={0.85}
          onPress={() => router.push("/about/terms")}
        >
          <View style={[styles.linkIcon, { backgroundColor: COLORS.danger + "22" }]}>
            <Ionicons name="document-text-outline" size={22} color={COLORS.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.linkTitle}>Terms of Service</Text>
            <Text style={styles.linkSub}>
              Disclaimers, assumption of risk, and license to use the app
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="about-link-attributions"
          style={styles.linkCard}
          activeOpacity={0.85}
          onPress={() => router.push("/about/attributions")}
        >
          <View style={[styles.linkIcon, { backgroundColor: COLORS.info + "22" }]}>
            <Ionicons name="library-outline" size={22} color={COLORS.info} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.linkTitle}>Attributions</Text>
            <Text style={styles.linkSub}>
              Data sources, basemaps, and open-source libraries we rely on
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2025 RiverRight LLC</Text>
          <Text style={styles.footerText}>Made with ❤️ for the river community</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.textMain,
    letterSpacing: -0.3,
  },
  brandWrap: { alignItems: "center", marginBottom: 28, marginTop: 8 },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 4,
  },
  appName: {
    fontSize: 28,
    fontWeight: "900",
    color: COLORS.textMain,
    letterSpacing: -0.8,
  },
  tagline: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "700",
    marginTop: 4,
    letterSpacing: 0.3,
  },
  versionText: { fontSize: 11, color: COLORS.textMuted, marginTop: 8, fontWeight: "700" },
  blurb: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.textMain,
    marginBottom: 24,
  },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  linkIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  linkTitle: { fontSize: 16, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.3 },
  linkSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 3, lineHeight: 17 },
  footer: { alignItems: "center", marginTop: 32, gap: 4 },
  footerText: { fontSize: 11, color: COLORS.textMuted, fontWeight: "700" },
});
