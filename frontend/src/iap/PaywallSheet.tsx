// Paywall bottom sheet.
//
// Shown when the user taps a locked river. Today the purchase flow is
// MOCKED — `unlockRunLocally()` just writes to AsyncStorage. When we wire
// real Apple StoreKit IAP, only the `onPurchase` handler swaps to:
//
//   const r = await RNIap.requestPurchase({ skus: [product.productId] });
//   await RNIap.finishTransaction({ purchase: r, isConsumable: false });
//   await unlockRunLocally(riverId);
//
// Everything else here (UI, copy, animation, "Restore Purchases" link)
// stays identical between mock and production.

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../theme";
import { productForRiver } from "./products";
import { unlockRunLocally, restorePurchasesLocally } from "./useUnlocks";
import { prefetchRiverBundle } from "../offlineCache";

type Props = {
  visible: boolean;
  onClose: () => void;
  riverId: string | null;
  riverName: string | null;
  onUnlocked?: (riverId: string) => void;
};

export default function PaywallSheet({
  visible,
  onClose,
  riverId,
  riverName,
  onUnlocked,
}: Props) {
  const [busy, setBusy] = useState<"purchase" | "restore" | null>(null);
  const insets = useSafeAreaInsets();
  const product = riverId ? productForRiver(riverId) : null;

  const handlePurchase = async () => {
    if (!riverId || busy) return;
    setBusy("purchase");
    try {
      // === MOCKED PURCHASE ===
      // Production: await RNIap.requestPurchase({ skus: [product.productId] })
      // and only call unlockRunLocally on a successful, finished transaction.
      await new Promise((r) => setTimeout(r, 700)); // fake StoreKit latency
      await unlockRunLocally(riverId);
      // Pre-cache the curated data so the user is offline-ready immediately
      // after the purchase, before they ever leave cell coverage.
      prefetchRiverBundle(riverId).catch(() => {});
      onUnlocked?.(riverId);
      onClose();
    } catch (e: any) {
      Alert.alert("Purchase failed", e?.message || "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    if (busy) return;
    setBusy("restore");
    try {
      // Production: const purchases = await RNIap.getAvailablePurchases();
      // For each Apple-confirmed entitlement, call unlockRunLocally(riverId).
      const count = await restorePurchasesLocally();
      Alert.alert(
        "Restore Purchases",
        count > 0
          ? `Restored ${count} run${count === 1 ? "" : "s"}.`
          : "No previous purchases found on this device."
      );
    } catch (e: any) {
      Alert.alert("Restore failed", e?.message || "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID="paywall-sheet"
    >
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
          onPress={(e) => e.stopPropagation?.()}
        >
          {/* Drag handle */}
          <View style={styles.grabber} />

          {/* Header icon */}
          <View style={styles.iconWrap}>
            <Ionicons name="lock-closed" size={28} color={COLORS.primary} />
          </View>

          <Text style={styles.title}>{riverName || "This run"}</Text>
          <Text style={styles.subtitle}>
            Unlock the full curated map, rapids, hazards, and points of interest
            for this run.
          </Text>

          {/* What you get */}
          <View style={styles.benefits}>
            <Benefit text="Hand-verified river polyline with mile markers" />
            <Benefit text="Rapids, hazards, campsites, and access points" />
            <Benefit text="Lifetime access — one-time purchase, no subscription" />
          </View>

          {/* Price + buy */}
          <TouchableOpacity
            testID="paywall-buy-btn"
            style={[styles.buyBtn, busy && styles.buyBtnDim]}
            onPress={handlePurchase}
            disabled={!riverId || busy !== null}
            activeOpacity={0.85}
          >
            {busy === "purchase" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.buyBtnLabel}>Unlock this Run</Text>
                <View style={styles.buyBtnPrice}>
                  <Text style={styles.buyBtnPriceText}>
                    {product?.displayPrice ?? "$5.00"}
                  </Text>
                </View>
              </>
            )}
          </TouchableOpacity>

          {/* Secondary actions */}
          <View style={styles.secondaryRow}>
            <TouchableOpacity
              testID="paywall-restore-btn"
              onPress={handleRestore}
              disabled={busy !== null}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryLink}>
                {busy === "restore" ? "Restoring…" : "Restore Purchases"}
              </Text>
            </TouchableOpacity>
            <Text style={styles.secondaryDivider}>•</Text>
            <TouchableOpacity
              testID="paywall-cancel-btn"
              onPress={onClose}
              disabled={busy !== null}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryLink}>Not now</Text>
            </TouchableOpacity>
          </View>

          {/* Fine print */}
          <Text style={styles.fineprint}>
            One-time purchase via the App Store. No subscription. Tied to your
            Apple ID — restore anytime on the same Apple ID.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Benefit({ text }: { text: string }) {
  return (
    <View style={styles.benefitRow}>
      <Ionicons name="checkmark-circle" size={18} color={COLORS.safe} />
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(10,17,40,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    paddingHorizontal: 20,
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary + "18",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.textMain,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13.5,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  benefits: { marginBottom: 18, gap: 8 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  benefitText: { flex: 1, fontSize: 13.5, color: COLORS.textMain, lineHeight: 18 },
  buyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    minHeight: 54,
    gap: 10,
  },
  buyBtnDim: { opacity: 0.7 },
  buyBtnLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  buyBtnPrice: {
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  buyBtnPriceText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  secondaryRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    marginBottom: 4,
  },
  secondaryLink: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "800",
    paddingVertical: 6,
  },
  secondaryDivider: { color: COLORS.textMuted, fontSize: 13 },
  fineprint: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 16,
  },
});
