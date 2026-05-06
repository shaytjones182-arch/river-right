import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { COLORS, STATUS_COLORS, API } from "../src/theme";

type River = {
  id: string;
  name: string;
  state: string;
  class_rating: string;
  type: string;
  description: string;
  image: string;
};

export default function Home() {
  const router = useRouter();
  const [rivers, setRivers] = useState<River[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/rivers/featured`);
      const j = await r.json();
      setRivers(j.rivers || []);
    } catch (e) {
      console.warn("featured rivers", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="home-screen">
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.overline}>RIVERRUNNER</Text>
          <Text style={styles.h1}>Read the river.{"\n"}Run it well.</Text>
          <Text style={styles.subtitle}>
            Live USGS flow data, GPS tracking, and curated American rivers — from glassy floats to gnarly whitewater.
          </Text>
        </View>

        <View style={styles.quickRow}>
          <TouchableOpacity
            testID="home-start-trip-btn"
            style={[styles.quickCard, { backgroundColor: COLORS.primary }]}
            onPress={() => router.push("/track")}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate" size={26} color="#fff" />
            <Text style={[styles.quickTitle, { color: "#fff" }]}>Start Trip</Text>
            <Text style={[styles.quickSub, { color: "rgba(255,255,255,0.8)" }]}>GPS track</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="home-gauges-btn"
            style={styles.quickCard}
            onPress={() => router.push("/gauges")}
            activeOpacity={0.85}
          >
            <Ionicons name="water" size={26} color={COLORS.primary} />
            <Text style={styles.quickTitle}>Gauges</Text>
            <Text style={styles.quickSub}>Live flows</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="home-rivers-btn"
            style={styles.quickCard}
            onPress={() => router.push("/rivers")}
            activeOpacity={0.85}
          >
            <Ionicons name="map" size={26} color={COLORS.primary} />
            <Text style={styles.quickTitle}>Rivers</Text>
            <Text style={styles.quickSub}>Guidebook</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.h3}>Featured rivers</Text>
          <Text style={styles.muted}>{rivers.length} runs</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 32 }} />
        ) : (
          rivers.slice(0, 4).map((r) => (
            <TouchableOpacity
              key={r.id}
              testID={`home-river-card-${r.id}`}
              style={styles.riverCard}
              onPress={() => router.push(`/river/${r.id}`)}
              activeOpacity={0.9}
            >
              <Image source={{ uri: r.image }} style={styles.riverImg} />
              <View style={styles.riverOverlay} />
              <View style={styles.riverContent}>
                <View style={styles.riverBadgeRow}>
                  <View
                    style={[
                      styles.classBadge,
                      { backgroundColor: r.type === "whitewater" ? COLORS.danger : r.type === "calm" ? COLORS.safe : COLORS.warning },
                    ]}
                  >
                    <Text style={styles.classBadgeText}>CLASS {r.class_rating}</Text>
                  </View>
                  <Text style={styles.riverState}>{r.state}</Text>
                </View>
                <Text style={styles.riverName}>{r.name}</Text>
                <Text style={styles.riverDesc} numberOfLines={2}>
                  {r.description}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        {!loading && rivers.length > 4 && (
          <TouchableOpacity
            testID="home-see-all-rivers"
            style={styles.seeAllBtn}
            onPress={() => router.push("/rivers")}
          >
            <Text style={styles.seeAllText}>See all rivers</Text>
            <Ionicons name="arrow-forward" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 24 },
  overline: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 3,
    color: COLORS.primary,
    marginBottom: 8,
  },
  h1: {
    fontSize: 34,
    fontWeight: "900",
    color: COLORS.textMain,
    lineHeight: 38,
    letterSpacing: -1,
  },
  h3: { fontSize: 20, fontWeight: "800", color: COLORS.textMain, letterSpacing: -0.3 },
  subtitle: {
    marginTop: 12,
    fontSize: 15,
    color: COLORS.textMuted,
    lineHeight: 22,
  },
  quickRow: { flexDirection: "row", gap: 10, marginBottom: 28 },
  quickCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 16,
    minHeight: 110,
    justifyContent: "space-between",
  },
  quickTitle: { fontSize: 15, fontWeight: "800", color: COLORS.textMain, marginTop: 8 },
  quickSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 14,
  },
  muted: { color: COLORS.textMuted, fontSize: 13, fontWeight: "600" },
  riverCard: {
    height: 200,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 14,
    backgroundColor: "#222",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  riverImg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  riverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,17,40,0.45)",
  },
  riverContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 18,
  },
  riverBadgeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  classBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  classBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  riverState: { color: "#fff", fontWeight: "800", fontSize: 13, letterSpacing: 1 },
  riverName: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  riverDesc: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4 },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 4,
  },
  seeAllText: { color: COLORS.primary, fontSize: 15, fontWeight: "800" },
});
