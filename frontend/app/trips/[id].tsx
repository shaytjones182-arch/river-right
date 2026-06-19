// Single trip detail — shows trip-wide rollup + per-day breakdown.

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  getTrip,
  deleteTrip,
  fmtDate,
  fmtDuration,
  fmtClockDuration,
  SavedTrip,
  TripDay,
} from "../../src/storage";
import { COLORS } from "../../src/theme";
import TripMapView from "../../src/TripMapView";

export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<SavedTrip | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const t = await getTrip(id as string);
      setTrip(t);
      setLoading(false);
    })();
  }, [id]);

  const confirmDelete = () => {
    if (!trip) return;
    Alert.alert("Delete this trip?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteTrip(trip.id);
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }
  if (!trip) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <BackBtn onPress={() => router.back()} />
          <Text style={styles.title}>Trip</Text>
          <View style={{ width: 36 }} />
        </View>
        <Text style={{ textAlign: "center", marginTop: 40, color: COLORS.textMuted }}>
          Trip not found.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="trip-detail-screen">
      <View style={styles.header}>
        <BackBtn onPress={() => router.back()} />
        <Text style={styles.title} numberOfLines={1}>
          {trip.riverName || "Free run"}
        </Text>
        <TouchableOpacity
          onPress={confirmDelete}
          activeOpacity={0.7}
          hitSlop={8}
          style={styles.deleteBtn}
          testID="trip-delete-btn"
        >
          <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={styles.subdate}>{fmtDate(trip.createdAt)}</Text>

        {/* Combined route map — concatenates all daily point arrays. */}
        {(() => {
          const allPoints = trip.days.flatMap((d) =>
            (d.points || []).map((p) => ({ lat: p.lat, lon: p.lon }))
          );
          if (allPoints.length < 2) return null;
          return (
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.overline}>Your route</Text>
              <TripMapView points={allPoints} />
            </View>
          );
        })()}

        {/* Trip-wide totals */}
        <View style={styles.totalsCard}>
          <Text style={styles.overline}>Trip totals</Text>
          <View style={styles.bigRow}>
            <BigStat value={trip.totalDistMiles.toFixed(2)} unit="MI" label="Distance" />
            <BigStat value={trip.avgMph.toFixed(1)} unit="MPH" label="Avg speed" />
          </View>
          <View style={styles.bigRow}>
            <BigStat value={trip.maxMph.toFixed(1)} unit="MPH" label="Max speed" />
            <BigStat
              value={fmtDuration(trip.totalMovingSec)}
              unit=""
              label="Moving time"
              small
            />
          </View>
          <Text style={styles.totalsFoot}>
            {trip.days.length}
            {trip.days.length === 1 ? " day" : " days"}
            {" · "}
            Total elapsed {fmtClockDuration(trip.totalSec)}
          </Text>
        </View>

        {/* Per-day breakdown — only shown when the user actually used
            the "Log Day" button at least once during the trip. For
            single-leg trips, the overall stats + route map above
            already tell the full story. */}
        {(() => {
          // New trips set `wasLogged` explicitly per-day. Legacy trips
          // (saved before this field existed) have no `wasLogged`
          // anywhere — fall back to the heuristic that a trip with
          // more than one day necessarily had at least one log tap.
          const hasNewFlag = trip.days.some((d) => typeof d.wasLogged === "boolean");
          const anyLogged = hasNewFlag
            ? trip.days.some((d) => d.wasLogged === true)
            : trip.days.length > 1;
          if (!anyLogged) return null;
          return (
            <>
              <Text style={styles.sectionH}>By day</Text>
              {trip.days.map((d) => (
                <DayCard key={d.dayNumber} day={d} />
              ))}
            </>
          );
        })()}
      </ScrollView>
    </SafeAreaView>
  );
}

function BackBtn({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.backBtn}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={10}
      testID="trip-detail-back"
    >
      <Ionicons name="arrow-back" size={22} color={COLORS.textMain} />
    </TouchableOpacity>
  );
}

function BigStat({
  value,
  unit,
  label,
  small,
}: {
  value: string;
  unit: string;
  label: string;
  small?: boolean;
}) {
  return (
    <View style={styles.bigStat}>
      <Text style={styles.bigLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
        <Text style={[styles.bigValue, small && { fontSize: 24 }]}>{value}</Text>
        {unit ? <Text style={styles.bigUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function DayCard({ day }: { day: TripDay }) {
  // Build a points list for this single day's mini-map. We deliberately
  // re-shape from the storage TripPoint -> { lat, lon } so we don't
  // pull TripPoint.t/speed all the way down into the Leaflet HTML
  // builder (which doesn't need it).
  const dayPoints = (day.points || []).map((p) => ({ lat: p.lat, lon: p.lon }));
  return (
    <View style={styles.dayCard} testID={`trip-day-${day.dayNumber}`}>
      <View style={styles.dayHeader}>
        <View style={styles.dayBadge}>
          <Text style={styles.dayBadgeText}>DAY {day.dayNumber}</Text>
        </View>
        <Text style={styles.daySub}>{fmtDate(day.startedAt)}</Text>
      </View>
      {dayPoints.length >= 2 && (
        <TripMapView points={dayPoints} style={styles.dayMap} />
      )}
      <View style={styles.dayStatRow}>
        <DayStat label="Distance" value={`${day.distMiles.toFixed(2)} mi`} />
        <DayStat label="Avg" value={`${day.avgMph.toFixed(1)} mph`} />
        <DayStat label="Max" value={`${day.maxMph.toFixed(1)} mph`} />
      </View>
      <View style={styles.dayStatRow}>
        <DayStat label="Moving time" value={fmtDuration(day.movingSec)} />
        <DayStat label="Total elapsed" value={fmtClockDuration(day.totalSec)} />
      </View>
    </View>
  );
}

function DayStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dayStat}>
      <Text style={styles.dayStatValue}>{value}</Text>
      <Text style={styles.dayStatLabel}>{label}</Text>
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
  deleteBtn: {
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
  subdate: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 10,
    textAlign: "center",
  },
  overline: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  totalsCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: 18,
    marginBottom: 18,
  },
  bigRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  bigStat: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bigLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  bigValue: { fontSize: 28, fontWeight: "900", color: COLORS.textMain, letterSpacing: -1 },
  bigUnit: { fontSize: 11, fontWeight: "800", color: COLORS.textMuted, paddingBottom: 4 },
  totalsFoot: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: "center",
  },

  sectionH: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.textMain,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  dayCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  dayHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  dayMap: {
    // Per-day mini-map sits between the header and stat rows. Shorter
    // than the trip-wide route map (which is 220px) to keep the list
    // compact when the user has many logged days.
    height: 160,
    marginBottom: 12,
  },
  dayBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dayBadgeText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  daySub: { marginLeft: 10, fontSize: 12, color: COLORS.textMuted, fontWeight: "700" },
  dayStatRow: { flexDirection: "row", gap: 12, marginBottom: 8 },
  dayStat: { flex: 1 },
  dayStatValue: { fontSize: 15, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.3 },
  dayStatLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});
