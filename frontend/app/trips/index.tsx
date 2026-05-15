// Past trips list screen — accessed via the profile menu.

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  getAllTrips,
  deleteTrip,
  fmtDate,
  fmtDuration,
  SavedTrip,
} from "../../src/storage";
import { COLORS } from "../../src/theme";

export default function PastTrips() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Return to whichever tab the user opened Past Trips from. With bottom
  // tabs, router.back() always pops to the default tab (Home), which feels
  // wrong if they came from Map or Trip Tracker. The originating route is
  // passed in as a ?from=… query param by ProfileMenu.
  const handleBack = () => {
    const raw = (typeof params.from === "string" && params.from) || "/";
    const target = ["/", "/map", "/track"].includes(raw) ? raw : "/";
    router.replace(target as any);
  };

  const load = useCallback(async () => {
    const all = await getAllTrips();
    setTrips(all);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh whenever the screen regains focus (e.g. after ending a trip).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const confirmDelete = (trip: SavedTrip) => {
    Alert.alert(
      "Delete trip?",
      `This will remove the ${fmtDate(trip.createdAt)} trip from this device.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteTrip(trip.id);
            await load();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="trips-screen">
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          activeOpacity={0.7}
          testID="trips-back"
          hitSlop={10}
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.textMain} />
        </TouchableOpacity>
        <Text style={styles.title}>Past trips</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="time-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>No past trips yet</Text>
            <Text style={styles.emptySub}>
              Start a trip from the Track tab to see it here.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`trip-card-${item.id}`}
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => router.push(`/trips/${item.id}`)}
            onLongPress={() => confirmDelete(item)}
          >
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardDate}>{fmtDate(item.createdAt)}</Text>
                <Text style={styles.cardRiver} numberOfLines={1}>
                  {item.riverName || "Free run"}
                </Text>
              </View>
              <View style={styles.dayPill}>
                <Text style={styles.dayPillText}>
                  {item.days.length}
                  {item.days.length === 1 ? " day" : " days"}
                </Text>
              </View>
            </View>
            <View style={styles.statRow}>
              <Stat label="Distance" value={`${item.totalDistMiles.toFixed(1)} mi`} />
              <Stat label="Avg speed" value={`${item.avgMph.toFixed(1)} mph`} />
              <Stat label="Max" value={`${item.maxMph.toFixed(1)} mph`} />
              <Stat label="Moving" value={fmtDuration(item.totalMovingSec)} />
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  cardDate: { fontSize: 12, color: COLORS.textMuted, fontWeight: "800", letterSpacing: 1 },
  cardRiver: { fontSize: 17, fontWeight: "900", color: COLORS.textMain, marginTop: 2 },
  dayPill: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dayPillText: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.textMain,
    letterSpacing: 0.5,
  },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  stat: { minWidth: "21%" },
  statValue: { fontSize: 15, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.3 },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.textMuted,
    marginTop: 2,
    letterSpacing: 1,
  },
  emptyWrap: { alignItems: "center", paddingVertical: 64, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: COLORS.textMain },
  emptySub: { fontSize: 13, color: COLORS.textMuted, textAlign: "center" },
});
