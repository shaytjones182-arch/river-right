// Terms of Service + liability disclaimer for RiverRight LLC.
//
// IMPORTANT: This text is boilerplate written for maximum protection of a
// solo-developer outdoor-info app. It is NOT legal advice. You must have a
// licensed attorney in your jurisdiction review and adapt this language
// before publishing the app.
//
// The actual document body lives in /src/TermsOfServiceContent.tsx so it
// can be shared with the first-launch acceptance modal's expandable
// dropdown. Edit copy there, not here.

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../src/theme";
import TermsOfServiceContent from "../../src/TermsOfServiceContent";
import PrivacyPolicyContent from "../../src/PrivacyPolicyContent";

// Enable LayoutAnimation on Android (no-op on iOS where it's on by default).
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function TermsOfService() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  // Each document collapsed by default — user picks which one to expand.
  const [tosOpen, setTosOpen] = useState(false);
  const [privOpen, setPrivOpen] = useState(false);

  // Mirror the behavior used by `/trips` — return the user to whichever
  // tab they opened this screen from (passed in via `?from=…` by
  // ProfileMenu). Without this, router.back() always pops out to the
  // Home tab regardless of where the menu was tapped.
  const handleBack = () => {
    const raw = (typeof params.from === "string" && params.from) || "/";
    const target = ["/", "/map", "/track"].includes(raw) ? raw : "/";
    router.replace(target as any);
  };

  const toggleTos = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTosOpen((v) => !v);
  };
  const togglePriv = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPrivOpen((v) => !v);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="terms-screen">
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          activeOpacity={0.7}
          hitSlop={10}
          testID="terms-back"
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.textMain} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          Terms & Privacy
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity
          testID="tos-dropdown-header"
          style={styles.dropdownHeader}
          onPress={toggleTos}
          activeOpacity={0.8}
        >
          <Ionicons
            name={tosOpen ? "chevron-down" : "chevron-forward"}
            size={20}
            color={COLORS.textMain}
          />
          <Text style={styles.dropdownLabel}>Terms of Service</Text>
        </TouchableOpacity>
        {tosOpen ? (
          <View style={styles.dropdownBody}>
            <TermsOfServiceContent />
          </View>
        ) : null}

        <View style={{ height: 14 }} />

        <TouchableOpacity
          testID="privacy-dropdown-header"
          style={styles.dropdownHeader}
          onPress={togglePriv}
          activeOpacity={0.8}
        >
          <Ionicons
            name={privOpen ? "chevron-down" : "chevron-forward"}
            size={20}
            color={COLORS.textMain}
          />
          <Text style={styles.dropdownLabel}>Privacy Policy</Text>
        </TouchableOpacity>
        {privOpen ? (
          <View style={styles.dropdownBody}>
            <PrivacyPolicyContent />
          </View>
        ) : null}
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
  scroll: { padding: 20, paddingBottom: 60 },
  dropdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dropdownLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.textMain,
    letterSpacing: -0.2,
  },
  dropdownBody: {
    paddingTop: 14,
    paddingHorizontal: 4,
  },
});
