import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { COLORS, STATUS_COLORS, API } from "../src/theme";

type Site = {
  site_id: string;
  name: string;
  lat: number;
  lon: number;
  cfs: number | null;
  gauge_height_ft: number | null;
  status: string;
  label: string;
  distance_miles?: number;
  updated_at?: string;
};

const STATES = ["CO", "CA", "OR", "WA", "AZ", "UT", "MT", "ID", "WY", "NM", "TX", "TN", "NC", "WV", "PA", "NY", "VT", "ME", "AK"];

export default function Gauges() {
  const router = useRouter();
  const [mode, setMode] = useState<"nearby" | "browse">("nearby");
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeState, setActiveState] = useState("CO");
  const [error, setError] = useState<string | null>(null);

  const loadNearby = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let lat = 39.5501,
        lon = -105.7821; // CO default
      if (status === "granted") {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = loc.coords.latitude;
          lon = loc.coords.longitude;
        } catch {}
      }
      const r = await fetch(`${API}/usgs/sites/nearby?lat=${lat}&lon=${lon}&radius_miles=50`);
      const j = await r.json();
      setSites(j.sites || []);
    } catch (e: any) {
      setError("Could not load nearby gauges");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadByState = useCallback(async (st: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/usgs/sites/search?q=${st}`);
      const j = await r.json();
      setSites(j.sites || []);
    } catch {
      setError("Could not load gauges");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "nearby") loadNearby();
    else loadByState(activeState);
  }, [mode, activeState, loadNearby, loadByState]);

  const filtered = sites.filter((s) =>
    search ? s.name?.toLowerCase().includes(search.toLowerCase()) || s.site_id.includes(search) : true
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="gauges-screen">
      <View style={styles.header}>
        <Text style={styles.h1}>USGS Gauges</Text>
        <Text style={styles.sub}>Live streamflow across the U.S.</Text>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          testID="gauges-tab-nearby"
          style={[styles.toggle, mode === "nearby" && styles.toggleActive]}
          onPress={() => setMode("nearby")}
        >
          <Ionicons name="locate" size={16} color={mode === "nearby" ? "#fff" : COLORS.textMain} />
          <Text style={[styles.toggleText, mode === "nearby" && styles.toggleTextActive]}>Nearby</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="gauges-tab-browse"
          style={[styles.toggle, mode === "browse" && styles.toggleActive]}
          onPress={() => setMode("browse")}
        >
          <Ionicons name="grid" size={16} color={mode === "browse" ? "#fff" : COLORS.textMain} />
          <Text style={[styles.toggleText, mode === "browse" && styles.toggleTextActive]}>By State</Text>
        </TouchableOpacity>
      </View>

      {mode === "browse" && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stateRow}>
          {STATES.map((st) => (
            <TouchableOpacity
              key={st}
              testID={`gauges-state-${st}`}
              onPress={() => setActiveState(st)}
              style={[styles.stateChip, activeState === st && styles.stateChipActive]}
            >
              <Text style={[styles.stateChipText, activeState === st && { color: "#fff" }]}>{st}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput
          testID="gauges-search-input"
          value={search}
          onChangeText={setSearch}
          placeholder="Filter by river name or site ID"
          placeholderTextColor={COLORS.textMuted}
          style={styles.searchInput}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.countText}>{filtered.length} gauges</Text>
          {filtered.map((s) => (
            <TouchableOpacity
              key={s.site_id}
              testID={`gauge-item-${s.site_id}`}
              style={styles.card}
              onPress={() => router.push(`/gauge/${s.site_id}`)}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName} numberOfLines={2}>
                  {s.name}
                </Text>
                <Text style={styles.cardMeta}>
                  Site #{s.site_id}
                  {s.distance_miles !== undefined ? ` · ${s.distance_miles.toFixed(1)} mi away` : ""}
                </Text>
                <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[s.status] || COLORS.textMuted }]}>
                  <Text style={styles.statusPillText}>{s.label?.toUpperCase()}</Text>
                </View>
              </View>
              <View style={styles.cfsBlock}>
                <Text style={styles.cfsValue}>{s.cfs !== null && s.cfs !== undefined ? Math.round(s.cfs).toLocaleString() : "—"}</Text>
                <Text style={styles.cfsUnit}>CFS</Text>
              </View>
            </TouchableOpacity>
          ))}
          {filtered.length === 0 && <Text style={styles.empty}>No gauges found.</Text>}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  h1: { fontSize: 28, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
  sub: { color: COLORS.textMuted, marginTop: 2, fontSize: 14 },
  toggleRow: { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 8 },
  toggle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  toggleText: { fontWeight: "700", color: COLORS.textMain, letterSpacing: 0.5 },
  toggleTextActive: { color: "#fff" },
  stateRow: { paddingHorizontal: 20, gap: 8, paddingVertical: 8 },
  stateChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
  },
  stateChipActive: { backgroundColor: COLORS.textMain, borderColor: COLORS.textMain },
  stateChipText: { fontWeight: "800", color: COLORS.textMain, letterSpacing: 1 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginVertical: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.textMain },
  list: { paddingHorizontal: 20, paddingBottom: 32 },
  countText: { color: COLORS.textMuted, fontWeight: "700", marginVertical: 8, fontSize: 13 },
  card: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    alignItems: "center",
    gap: 10,
  },
  cardName: { fontWeight: "800", color: COLORS.textMain, fontSize: 15 },
  cardMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  statusPill: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  cfsBlock: { alignItems: "flex-end", minWidth: 78 },
  cfsValue: { fontSize: 26, fontWeight: "900", color: COLORS.textMain, letterSpacing: -1 },
  cfsUnit: { fontSize: 11, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 1 },
  empty: { textAlign: "center", color: COLORS.textMuted, marginTop: 32 },
  errorText: { textAlign: "center", color: COLORS.danger, marginTop: 32, paddingHorizontal: 20 },
});
