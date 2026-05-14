// First-launch terms acknowledgement modal.
//
// Apple App Store reviewers (and many real users) appreciate seeing a clear
// "you take risk, app is for reference only" gate before they tap around.
// This modal blocks the rest of the app until the user explicitly accepts.

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { COLORS } from "./theme";

type Props = {
  visible: boolean;
  onAccept: () => void;
};

export default function TermsAcceptanceModal({ visible, onAccept }: Props) {
  const [checked, setChecked] = useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      // No onRequestClose handler — Android back press cannot dismiss this.
      // The user MUST accept the terms to use the app.
      statusBarTranslucent
      testID="terms-acceptance-modal"
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* Header band */}
        <View style={styles.headerBand}>
          <View style={styles.logoCircle}>
            <Ionicons name="water" size={28} color="#fff" />
          </View>
          <Text style={styles.title}>Welcome to RiverRight</Text>
          <Text style={styles.subtitle}>Read the river. Run it right.</Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollPad}
          showsVerticalScrollIndicator={false}
        >
          {/* Warning headline */}
          <View style={styles.warnBox}>
            <View style={styles.warnHeader}>
              <Ionicons name="warning" size={20} color={COLORS.danger} />
              <Text style={styles.warnHeaderText}>
                BEFORE YOU PADDLE — READ THIS
              </Text>
            </View>
            <Text style={styles.warnBody}>
              Whitewater paddling can cause serious injury or death. RiverRight
              is for{" "}
              <Text style={styles.bold}>
                informational and planning purposes only
              </Text>{" "}
              and does not replace scouting, instruction, or your own judgment
              on the water.
            </Text>
          </View>

          {/* Key points */}
          <Text style={styles.h2}>Key points</Text>

          <Bullet
            color={COLORS.danger}
            icon="time-outline"
            title="Conditions can change in hours"
            body="Water levels, hazards, weather, and access points can change rapidly and without warning."
          />
          <Bullet
            color={COLORS.warning}
            icon="alert-circle-outline"
            title="Data is for reference only"
            body="GPS, river flows, and rapid classifications (Class I–VI) may be inaccurate or out of date. A Class III at one flow can be a Class V at another."
          />
          <Bullet
            color={COLORS.primary}
            icon="eye-outline"
            title="Your eyes always win"
            body="Always scout rapids from shore. If what you see disagrees with the app, trust your eyes. Portage when in doubt."
          />
          <Bullet
            color={COLORS.textMuted}
            icon="document-text-outline"
            title="You assume all risk"
            body="By using RiverRight you accept these terms and assume full responsibility for your safety and your group's safety."
          />

          {/* Link to full ToS */}
          <TouchableOpacity
            testID="terms-acceptance-read-full"
            style={styles.linkBtn}
            activeOpacity={0.7}
            onPress={() => {
              router.push("/about/terms");
            }}
          >
            <Ionicons name="open-outline" size={16} color={COLORS.primary} />
            <Text style={styles.linkBtnText}>Read the full Terms of Service</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Footer: checkbox + accept button */}
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
          ]}
        >
          <TouchableOpacity
            testID="terms-acceptance-checkbox-row"
            style={styles.checkRow}
            onPress={() => setChecked((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, checked && styles.checkboxOn]}>
              {checked ? (
                <Ionicons name="checkmark" size={16} color="#fff" />
              ) : null}
            </View>
            <Text style={styles.checkText}>
              I have read and accept these Terms, and I understand that I use
              RiverRight at my own risk.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="terms-acceptance-accept-btn"
            disabled={!checked}
            onPress={onAccept}
            activeOpacity={0.85}
            style={[
              styles.acceptBtn,
              !checked && styles.acceptBtnDisabled,
            ]}
          >
            <Text
              style={[
                styles.acceptBtnText,
                !checked && styles.acceptBtnTextDisabled,
              ]}
            >
              Accept & Continue
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Bullet({
  icon,
  title,
  body,
  color,
}: {
  icon: any;
  title: string;
  body: string;
  color: string;
}) {
  return (
    <View style={styles.bullet}>
      <View style={[styles.bulletIcon, { backgroundColor: color + "1A" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.bulletTitle}>{title}</Text>
        <Text style={styles.bulletBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  headerBand: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.textMain,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginTop: 2,
  },
  scrollPad: { paddingHorizontal: 20, paddingBottom: 24 },
  warnBox: {
    backgroundColor: COLORS.danger + "12",
    borderWidth: 1.5,
    borderColor: COLORS.danger,
    borderRadius: 14,
    padding: 14,
    marginTop: 6,
    marginBottom: 18,
  },
  warnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  warnHeaderText: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.danger,
    letterSpacing: 1,
  },
  warnBody: { fontSize: 13, lineHeight: 19, color: COLORS.textMain },
  bold: { fontWeight: "900" },
  h2: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.textMuted,
    letterSpacing: 1.4,
    marginBottom: 12,
  },
  bullet: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
    alignItems: "flex-start",
  },
  bulletIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  bulletTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.textMain,
    letterSpacing: -0.2,
  },
  bulletBody: {
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.textMain,
    marginTop: 2,
  },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 8,
    marginTop: 4,
  },
  linkBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.primary,
    textDecorationLine: "underline",
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.textMuted,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxOn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textMain,
    fontWeight: "600",
  },
  acceptBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  acceptBtnDisabled: {
    backgroundColor: COLORS.border,
  },
  acceptBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  acceptBtnTextDisabled: { color: COLORS.textMuted },
});
