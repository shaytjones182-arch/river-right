// Reusable circular profile button + dropdown menu used in every tab header.
// Surfaces local features (past trips, restore purchases, about).

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "./theme";
import { restorePurchasesLocally } from "./iap/useUnlocks";

type ProfileMenuProps = {
  testID?: string;
};

export default function ProfileMenu({ testID }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  // Snapshot the tab the user is currently viewing so destinations opened
  // from the profile menu (Past Trips, About, etc.) can route the user back
  // to that same tab when they tap the back arrow — instead of always
  // popping out to the Home tab.
  const tabRoot = (() => {
    if (pathname?.startsWith("/map")) return "/map";
    if (pathname?.startsWith("/track")) return "/track";
    return "/";
  })();

  const go = (path: string) => {
    setOpen(false);
    const sep = path.includes("?") ? "&" : "?";
    const url = `${path}${sep}from=${encodeURIComponent(tabRoot)}`;
    setTimeout(() => router.push(url as any), 60);
  };

  return (
    <>
      <TouchableOpacity
        testID={testID || "profile-menu-btn"}
        style={styles.btn}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        hitSlop={8}
      >
        <Ionicons name="person" size={18} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          {/* Stop propagation by intercepting inner taps */}
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={[
              styles.menu,
              { top: insets.top + 56 },
            ]}
            testID="profile-menu"
          >
            <MenuRow
              testID="profile-menu-trips"
              icon="time-outline"
              label="Past trips"
              onPress={() => go("/trips")}
            />
            <MenuRow
              testID="profile-menu-restore"
              icon="refresh-outline"
              label="Restore Purchases"
              onPress={async () => {
                setOpen(false);
                // Small delay so the dropdown close animation finishes
                // before the Alert pops.
                setTimeout(async () => {
                  try {
                    const count = await restorePurchasesLocally();
                    Alert.alert(
                      "Restore Purchases",
                      count > 0
                        ? `Restored ${count} run${count === 1 ? "" : "s"}.`
                        : "No previous purchases found on this device."
                    );
                  } catch (e: any) {
                    Alert.alert(
                      "Restore failed",
                      e?.message || "Please try again."
                    );
                  }
                }, 120);
              }}
            />
            <MenuRow
              testID="profile-menu-about"
              icon="information-circle-outline"
              label="About RiverRight"
              onPress={() => go("/about")}
              divider={false}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function MenuRow({
  icon,
  label,
  hint,
  onPress,
  divider = true,
  testID,
}: {
  icon: any;
  label: string;
  hint?: string;
  onPress: () => void;
  divider?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.row, divider && styles.rowDivider]}
    >
      <Ionicons name={icon} size={18} color={COLORS.textMain} />
      <Text style={styles.rowLabel}>{label}</Text>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.18)" },
  menu: {
    position: "absolute",
    right: 16,
    minWidth: 230,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "700", color: COLORS.textMain },
  rowHint: { fontSize: 11, color: COLORS.textMuted, fontWeight: "700" },
});
