// Terms of Service + liability disclaimer for RiverRight LLC.
//
// IMPORTANT: This text is boilerplate written for maximum protection of a
// solo-developer outdoor-info app. It is NOT legal advice. You must have a
// licensed attorney in your jurisdiction review and adapt this language
// before publishing the app.

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { COLORS } from "../../src/theme";

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
        <Text style={styles.title}>Terms of Service</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={styles.updated}>Last updated: May 14, 2026</Text>

        {/* ─── SAFETY DISCLAIMER (top, can't miss it) ──────────────────── */}
        <View style={styles.warnBox}>
          <View style={styles.warnHeader}>
            <Ionicons name="warning" size={20} color={COLORS.danger} />
            <Text style={styles.warnTitle}>READ BEFORE PADDLING</Text>
          </View>
          <Text style={styles.warnBody}>
            Whitewater paddling, rafting, kayaking, canoeing, and other river
            activities are inherently dangerous and can result in serious
            injury, drowning, or death. RiverRight is for informational and
            planning purposes only and is{" "}
            <Text style={styles.bold}>
              not a substitute for in-person scouting, professional
              instruction, qualified guides, safety equipment, or your own
              judgment on the water.
            </Text>{" "}
            River conditions, water levels, hazards, access points, rapid
            difficulty ratings, and points of interest can change rapidly,
            without warning, and may be inaccurate, incomplete, or missing
            entirely from this app. You assume all risks associated with
            using this app and any river activity you undertake.
          </Text>
        </View>

        <Section title="1. Acceptance of Terms">
          By downloading, installing, accessing, or using the RiverRight mobile
          application (the &ldquo;App&rdquo;), you agree to be bound by these Terms of
          Service (&ldquo;Terms&rdquo;). If you do not agree, do not use the App. These
          Terms form a binding contract between you and RiverRight LLC, a
          limited liability company (&ldquo;RiverRight,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;).
        </Section>

        <Section title="2. Eligibility">
          You must be at least 18 years old to purchase content within the App
          and to enter into these Terms. By using the App you represent that
          you meet this requirement. Users under 18 may only use the App
          under the supervision of a parent or legal guardian who accepts
          these Terms on the minor&apos;s behalf.
        </Section>

        <Section title="3. Informational Use Only — No Professional Advice">
          The content provided by the App, including but not limited to river
          flow data, river maps, polylines, points of interest, rapid
          classifications, hazard markers, campground locations, access
          points, GPS trip-tracking data, statistics, and descriptions
          (collectively, &ldquo;Content&rdquo;), is provided for{" "}
          <Text style={styles.bold}>
            general informational and recreational planning purposes only
          </Text>{" "}
          and does not constitute professional safety, navigational, medical,
          weather, emergency-response, or legal advice. The Content is not a
          guide, instructor, or substitute for any of these. Always consult
          qualified professionals, local authorities, river managers, and
          permitted outfitters before undertaking any river activity.
        </Section>

        <Section title="4. Assumption of Risk">
          You expressly acknowledge that:
          {"\n\n"}(a) River activities — including but not limited to rafting,
          kayaking, canoeing, packrafting, swimming, fishing, hiking near
          rivers, and operating any watercraft — are inherently dangerous
          and may result in property damage, serious bodily injury, drowning,
          or death;
          {"\n\n"}(b) River conditions including water level, flow rate, water
          temperature, debris, hazards, weather, and access can change
          rapidly and unpredictably;
          {"\n\n"}(c) The Content may be inaccurate, incomplete, outdated,
          stale, missing, or otherwise unreliable;
          {"\n\n"}(d) GPS, cellular service, satellite coverage, and the App
          itself may fail or be unavailable, including without warning,
          while you are on or near the water;
          {"\n\n"}(e) Difficulty ratings (e.g. Class I–VI) reflect general
          observations under typical conditions and may not reflect actual
          difficulty at any given time;
          {"\n\n"}(f){" "}
          <Text style={styles.bold}>
            You voluntarily assume any and all risk of loss, injury, or death
          </Text>{" "}
          arising from your use of the App or your participation in any
          activity informed by the Content.
        </Section>

        <Section title="5. License to Use the App">
          Subject to your compliance with these Terms, RiverRight grants you a
          limited, non-exclusive, non-transferable, non-sublicensable,
          revocable license to use the App on devices you own or control,
          solely for your personal, non-commercial use. You may not: (a)
          copy, modify, reverse-engineer, decompile, disassemble, or attempt
          to derive the source code of the App; (b) sell, rent, lease, sublicense,
          or distribute the App or any Content; (c) remove any proprietary
          notices; (d) use the App in violation of any applicable law; (e)
          use the App to harass, harm, defraud, or impersonate any person;
          (f) use any automated system or scraper to access the App or its
          underlying services; or (g) circumvent any access or in-app
          purchase controls.
        </Section>

        <Section title="6. In-App Purchases">
          Certain river runs, features, or content within the App are made
          available only after a one-time in-app purchase processed through
          the Apple App Store. Pricing is shown in the App before purchase
          and is subject to change. All purchases are{" "}
          <Text style={styles.bold}>final and non-refundable</Text> except
          where required by Apple App Store policy or applicable law.
          Purchases are tied to the Apple ID used to make them and may be
          restored on the same Apple ID. Loss of access due to device
          loss, account closure, transfer to a different Apple ID, or
          deletion of the App is not the responsibility of RiverRight.
          {"\n\n"}For payment, refund, or billing issues, you must contact
          Apple directly per its App Store Terms of Sale.
        </Section>

        <Section title="7. User-Generated Data">
          The App may record GPS-based trip tracking data (location, speed,
          distance, time) on your device. This data is stored locally on
          your device by default; we do not collect or transmit it to our
          servers unless you explicitly opt in to a future cloud-backup
          feature. You are solely responsible for your trip data and any
          loss of that data due to device damage, deletion, or uninstall.
        </Section>

        <Section title='8. "AS IS" — No Warranties'>
          THE APP AND ALL CONTENT ARE PROVIDED{" "}
          <Text style={styles.bold}>&ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;</Text>{" "}
          WITHOUT WARRANTY OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY,
          OR OTHERWISE. TO THE FULLEST EXTENT PERMITTED BY LAW, RIVERRIGHT
          DISCLAIMS ALL WARRANTIES, INCLUDING WITHOUT LIMITATION IMPLIED
          WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
          NON-INFRINGEMENT, ACCURACY, RELIABILITY, COMPLETENESS, TIMELINESS,
          UNINTERRUPTED OPERATION, AND ERROR-FREE PERFORMANCE. RIVERRIGHT
          DOES NOT WARRANT THAT THE CONTENT IS ACCURATE, CURRENT,
          UNINTERRUPTED, SECURE, OR FREE OF HARMFUL COMPONENTS, OR THAT THE
          APP WILL MEET YOUR REQUIREMENTS.
        </Section>

        <Section title="9. Limitation of Liability">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL
          RIVERRIGHT LLC, ITS MEMBERS, OFFICERS, EMPLOYEES, CONTRACTORS,
          AGENTS, LICENSORS, OR SUPPLIERS BE LIABLE FOR ANY{" "}
          <Text style={styles.bold}>
            DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY,
            OR PUNITIVE DAMAGES
          </Text>
          , INCLUDING WITHOUT LIMITATION DAMAGES FOR PERSONAL INJURY, DEATH,
          PROPERTY DAMAGE, LOSS OF PROFITS, LOSS OF DATA, LOSS OF GOODWILL,
          BUSINESS INTERRUPTION, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF
          OR RELATED TO YOUR ACCESS TO OR USE OF (OR INABILITY TO USE) THE
          APP OR THE CONTENT, EVEN IF RIVERRIGHT HAS BEEN ADVISED OF THE
          POSSIBILITY OF SUCH DAMAGES.
          {"\n\n"}IN ANY EVENT, RIVERRIGHT&apos;S AGGREGATE LIABILITY ARISING
          OUT OF OR RELATING TO THESE TERMS OR THE APP SHALL NOT EXCEED THE
          GREATER OF (a) THE AMOUNT YOU ACTUALLY PAID TO RIVERRIGHT FOR THE
          APP CONTENT IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR (b)
          ONE HUNDRED U.S. DOLLARS ($100).
          {"\n\n"}SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR
          LIMITATION OF CERTAIN DAMAGES, SO SOME OF THE ABOVE LIMITATIONS
          MAY NOT APPLY TO YOU. IN SUCH JURISDICTIONS, OUR LIABILITY IS
          LIMITED TO THE FULLEST EXTENT PERMITTED BY LAW.
        </Section>

        <Section title="10. Indemnification">
          You agree to defend, indemnify, and hold harmless RiverRight LLC
          and its members, officers, employees, contractors, agents,
          licensors, and suppliers from and against any and all claims,
          damages, obligations, losses, liabilities, costs, debts, and
          expenses (including reasonable attorneys&apos; fees) arising from or
          relating to: (a) your use or misuse of the App or Content; (b) any
          injury, illness, death, or property damage that you, your guests,
          or any third party suffers in connection with your river
          activities; (c) your violation of these Terms; or (d) your
          violation of any law or third-party right.
        </Section>

        <Section title="11. Third-Party Data Sources">
          The App incorporates data from third parties (including but not
          limited to the U.S. Geological Survey and OpenStreetMap). RiverRight
          does not control, verify, or warrant the accuracy of third-party
          data and disclaims all liability arising from such data. See the
          Attributions section of the App for details and links.
        </Section>

        <Section title="12. Modifications">
          We reserve the right to modify the App, the Content, pricing, and
          these Terms at any time. Material changes to the Terms will be
          surfaced in-app and will become effective when posted. Your
          continued use of the App after a change constitutes your
          acceptance of the revised Terms. If you do not agree, your only
          remedy is to stop using the App.
        </Section>

        <Section title="13. Termination">
          We may suspend or terminate your access to the App, with or without
          notice, for any reason including violation of these Terms. Upon
          termination, all rights granted to you under these Terms cease
          immediately. Sections 4 (Assumption of Risk), 8 (No Warranties), 9
          (Limitation of Liability), 10 (Indemnification), 14 (Governing
          Law), and 15 (Dispute Resolution) survive any termination.
        </Section>

        <Section title="14. Governing Law">
          These Terms are governed by the laws of the State of Wyoming, USA,
          without regard to its conflict-of-laws principles. The United
          Nations Convention on Contracts for the International Sale of
          Goods does not apply.{" "}
          <Text style={styles.bold}>
            [Adjust to the state where RiverRight LLC is formed before
            publishing.]
          </Text>
        </Section>

        <Section title="15. Dispute Resolution & Class-Action Waiver">
          Any dispute arising out of or relating to these Terms or the App
          shall be resolved exclusively by{" "}
          <Text style={styles.bold}>
            individual, binding arbitration
          </Text>{" "}
          administered by the American Arbitration Association under its
          Consumer Arbitration Rules, in the state where RiverRight LLC is
          formed. You and RiverRight each waive any right to a jury trial
          and any right to participate in a{" "}
          <Text style={styles.bold}>class action</Text>, class arbitration,
          or representative action. Either party may seek injunctive relief
          in court for intellectual property or in-app purchase enforcement.
        </Section>

        <Section title="16. Severability">
          If any provision of these Terms is found unenforceable, the
          remaining provisions remain in full effect.
        </Section>

        <Section title="17. Entire Agreement">
          These Terms, together with the Privacy Policy (when published) and
          any in-app purchase terms, constitute the entire agreement between
          you and RiverRight regarding the App.
        </Section>

        <Section title="18. Contact">
          Questions, notices, or concerns may be sent to:
          {"\n\n"}RiverRight LLC
          {"\n"}Email: support@riverright.app
          {"\n"}
          <Text style={styles.bold}>
            [Replace with your company address and email before publishing.]
          </Text>
        </Section>

        <Text style={styles.footerNote}>© 2025 RiverRight LLC. All rights reserved.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{children}</Text>
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
  updated: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 14,
    textAlign: "center",
  },
  warnBox: {
    backgroundColor: COLORS.danger + "10",
    borderWidth: 2,
    borderColor: COLORS.danger,
    borderRadius: 14,
    padding: 14,
    marginBottom: 22,
  },
  warnHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  warnTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.danger,
    letterSpacing: 1,
  },
  warnBody: { fontSize: 13.5, lineHeight: 20, color: COLORS.textMain },
  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.textMain,
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textMain,
  },
  bold: { fontWeight: "900" },
  footerNote: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 18,
    fontWeight: "700",
  },
});
