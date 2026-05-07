import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { COLORS, API } from "../src/theme";

type River = {
  id: string;
  name: string;
  state: string;
  class_rating: string;
  type: "whitewater" | "calm" | "mixed" | string;
  description: string;
  image: string;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "whitewater", label: "Whitewater" },
  { key: "mixed", label: "Mixed" },
  { key: "calm", label: "Calm" },
];

export default function Rivers() {
  const router = useRouter();
  const [rivers, setRivers] = useState<River[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/rivers/featured`);
      const j = await r.json();
      setRivers(j.rivers || []);
    } catch (e) {
      console.warn("rivers load", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = rivers.filter((r) => (filter === "all" ? true : r.type === filter));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="rivers-screen">
      <View style={styles.header}>
        <Text style={styles.h1}>Rivers</Text>
        <Text style={styles.sub}>Curated runs across the United States</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            testID={`rivers-filter-${f.key}`}
            onPress={() => setFilter(f.key)}
            style={[styles.filter, filter === f.key && styles.filterActive]}
          >
            <Text style={[styles.filterText, filter === f.key && { color: "#fff" }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={COLORS.primary}
            />
          }
        >
          {visible.map((r) => (
            <TouchableOpacity
              key={r.id}
              testID={`river-card-${r.id}`}
              style={styles.card}
              onPress={() => router.push(`/river/${r.id}`)}
              activeOpacity={0.9}
            >
              <Image source={{ uri: r.image }} style={styles.img} />
              <View style={styles.overlay} />
              <View style={styles.content}>
                <View style={styles.row}>
                  <View
                    style={[
                      styles.classBadge,
                      {
                        backgroundColor:
                          r.type === "whitewater"
                            ? COLORS.danger
                            : r.type === "calm"
                            ? COLORS.safe
                            : COLORS.warning,
                      },
                    ]}
                  >
                    <Text style={styles.classText}>CLASS {r.class_rating}</Text>
                  </View>
                  <Text style={styles.state}>{r.state}</Text>
                </View>
                <Text style={styles.name}>{r.name}</Text>
                <Text style={styles.desc} numberOfLines={2}>
                  {r.description}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          {visible.length === 0 && <Text style={styles.empty}>No rivers in this category.</Text>}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  h1: { fontSize: 28, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
  sub: { color: COLORS.textMuted, marginTop: 2, fontSize: 14 },
  filterRow: { paddingHorizontal: 20, paddingVertical: 14, gap: 10 },
  filter: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 10,
    minHeight: 46,
    minWidth: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  filterActive: { backgroundColor: COLORS.textMain, borderColor: COLORS.textMain },
  filterText: { fontWeight: "800", color: COLORS.textMain, letterSpacing: 0.3, fontSize: 14 },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  card: {
    height: 200,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 14,
    backgroundColor: "#222",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  img: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,17,40,0.45)" },
  content: { flex: 1, justifyContent: "flex-end", padding: 18 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  classBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  classText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  state: { color: "#fff", fontWeight: "800", letterSpacing: 1, fontSize: 13 },
  name: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  desc: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4 },
  empty: { textAlign: "center", color: COLORS.textMuted, marginTop: 32 },
});
