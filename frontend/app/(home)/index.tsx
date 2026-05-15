import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import ProfileMenu from "../../src/ProfileMenu";
import { COLORS, API } from "../../src/theme";
import PaywallSheet from "../../src/iap/PaywallSheet";
import { useUnlocks } from "../../src/iap/useUnlocks";
import { productForRiver } from "../../src/iap/products";
import { getHomeScrollY, setHomeScrollY } from "../../src/tabState";
import { fetchFeaturedWithCache } from "../../src/offlineCache";

type River = {
  id: string;
  name: string;
  state: string;
  class_rating: string;
  type: "whitewater" | "calm" | "mixed" | string;
  description: string;
  image: string;
  /** Optional — set on backend river dicts to gate behind an IAP. */
  locked?: boolean;
};

export default function Home() {
  const router = useRouter();
  const [rivers, setRivers] = useState<River[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const { isUnlocked } = useUnlocks();
  const [paywallRiver, setPaywallRiver] = useState<River | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Restore scroll position whenever this tab regains focus. On native this
  // is a no-op (ScrollView retains its own position), but on the web preview
  // the component remounts so we restore manually.
  useFocusEffect(
    useCallback(() => {
      const y = getHomeScrollY();
      if (y > 0) {
        // requestAnimationFrame so the ScrollView has laid out its children
        const id = requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ y, animated: false });
        });
        return () => cancelAnimationFrame(id);
      }
    }, [])
  );

  const load = useCallback(async () => {
    try {
      const j = await fetchFeaturedWithCache();
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Alphabetized by name (case-insensitive, locale-aware)
    const sorted = [...rivers].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
    if (!q) return sorted;
    return sorted.filter((r) => r.name.toLowerCase().includes(q));
  }, [rivers, query]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="home-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={64}
          onScroll={(e) => setHomeScrollY(e.nativeEvent.contentOffset.y)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <Text style={styles.overline}>RIVERRIGHT</Text>
              <ProfileMenu testID="home-profile-btn" />
            </View>
            <Text style={styles.h1}>Read the river.{"\n"}Run it right.</Text>
            <Text style={styles.subtitle}>
              Live USGS flow data, GPS tracking, and curated American rivers — from
              glassy floats to gnarly whitewater.
            </Text>
          </View>

          <View style={styles.searchWrap} testID="home-search-wrap">
            <Ionicons
              name="search"
              size={18}
              color={COLORS.textMuted}
              style={{ marginRight: 8 }}
            />
            <TextInput
              testID="home-search-input"
              style={styles.searchInput}
              placeholder="Search rivers by name…"
              placeholderTextColor={COLORS.textMuted}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <TouchableOpacity
                testID="home-search-clear"
                onPress={() => setQuery("")}
                hitSlop={8}
                style={styles.clearBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 40 }} />
          ) : visible.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="water-outline" size={36} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No rivers found</Text>
              <Text style={styles.emptySub}>
                Try a different search.
              </Text>
            </View>
          ) : (
            visible.map((r) => {
              const locked = !!r.locked && !isUnlocked(r.id);
              return (
                <TouchableOpacity
                  key={r.id}
                  testID={`home-river-card-${r.id}`}
                  style={styles.riverCard}
                  onPress={() => {
                    if (locked) {
                      setPaywallRiver(r);
                    } else {
                      router.push(`/river/${r.id}`);
                    }
                  }}
                  activeOpacity={0.9}
                >
                  <Image source={{ uri: r.image }} style={styles.riverImg} />
                  <View style={styles.riverOverlay} />
                  {locked ? (
                    <View style={styles.lockBadgeRow}>
                      <View style={styles.lockBadge}>
                        <Ionicons name="lock-closed" size={11} color="#fff" />
                        <Text style={styles.lockBadgeText}>
                          {productForRiver(r.id).displayPrice}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.riverContent}>
                    <View style={styles.riverBadgeRow}>
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
                        <Text style={styles.classBadgeText}>
                          CLASS {r.class_rating}
                        </Text>
                      </View>
                      <Text style={styles.riverState}>{r.state}</Text>
                    </View>
                    <Text style={styles.riverName}>{r.name}</Text>
                    <Text style={styles.riverDesc} numberOfLines={2}>
                      {r.description}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <PaywallSheet
        visible={paywallRiver !== null}
        riverId={paywallRiver?.id ?? null}
        riverName={paywallRiver?.name ?? null}
        onClose={() => setPaywallRiver(null)}
        onUnlocked={(rid) => {
          setPaywallRiver(null);
          // Tiny defer so the modal-close animation finishes first.
          setTimeout(() => router.push(`/river/${rid}`), 220);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  header: { marginBottom: 8 },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
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
  subtitle: {
    marginTop: 12,
    fontSize: 15,
    color: COLORS.textMuted,
    lineHeight: 22,
  },
  filterRow: { paddingVertical: 16, gap: 10 },
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
  filterText: {
    fontWeight: "800",
    color: COLORS.textMain,
    letterSpacing: 0.3,
    fontSize: 14,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 18,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textMain,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        // @ts-ignore
        outlineWidth: 0,
      },
    }),
  },
  clearBtn: { paddingLeft: 6 },
  riverCard: {
    height: 200,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 14,
    backgroundColor: "#222",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  riverImg: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  riverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,17,40,0.45)",
  },
  riverContent: { flex: 1, justifyContent: "flex-end", padding: 18 },
  riverBadgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  classBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  classBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  riverState: {
    color: "#fff",
    fontWeight: "800",
    letterSpacing: 1,
    fontSize: 13,
  },
  riverName: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  riverDesc: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    marginTop: 4,
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.textMain,
    marginTop: 4,
  },
  emptySub: { fontSize: 13, color: COLORS.textMuted, textAlign: "center" },
  lockBadgeRow: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 5,
  },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(10,17,40,0.85)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  lockBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
});
