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

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { COLORS } from "../../src/theme";
import TermsOfServiceContent from "../../src/TermsOfServiceContent";
import PrivacyPolicyContent from "../../src/PrivacyPolicyContent";

export default function TermsOfService() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="terms-screen">
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
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

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={styles.docHeading}>Terms of Service</Text>
        <TermsOfServiceContent />

        <View style={styles.divider} />

        <Text style={styles.docHeading}>Privacy Policy</Text>
        <PrivacyPolicyContent />
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
  docHeading: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.textMain,
    letterSpacing: -0.5,
    marginBottom: 14,
    textAlign: "center",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 32,
  },
});
