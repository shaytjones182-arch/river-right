// Body of the Privacy Policy document.
//
// Extracted into a standalone component so the same source-of-truth text
// can be rendered both on the dedicated `/about/terms` page (below the
// Terms of Service) AND embedded inline inside the first-launch
// acceptance modal's expandable dropdown.
//
// NOTE: This component renders ONLY the document body. The caller is
// responsible for the screen chrome (SafeAreaView, header, back button,
// etc.) and for wrapping it in a ScrollView if it's the only thing on
// screen.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS } from "./theme";

export default function PrivacyPolicyContent() {
  return (
    <View>
      <Text style={styles.updated}>Last updated: June 3, 2026</Text>

      <Section title="Overview">
        RiverRight LLC (&ldquo;RiverRight,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) does
        <Text style={styles.bold}> not collect, store, or transmit</Text>{" "}
        personal information through the RiverRight mobile application
        (the &ldquo;App&rdquo;). The App is designed to function entirely
        on your device, including in fully offline conditions. This
        Privacy Policy explains what limited data the App interacts with
        and how that data stays on your device.
      </Section>

      <Section title="GPS Trip Data">
        The App can record GPS-based trip-tracking data (location,
        speed, distance, time, and your breadcrumb track) when you
        actively use the Trip Tracker feature.
        {"\n\n"}
        This GPS data is stored{" "}
        <Text style={styles.bold}>only on your device</Text>, in the
        App&apos;s private storage. It is never transmitted to
        RiverRight, never uploaded to any server we operate, and never
        shared with any third party. We have no ability to read your
        trip data, recover it, or back it up. If you delete the App, lose
        the device, or clear the App&apos;s storage, the trip data is
        gone.
      </Section>

      <Section title="Location Permission">
        To enable GPS trip tracking, the App requests the iOS{" "}
        <Text style={styles.bold}>Location</Text> permission (foreground
        and, optionally, background). The App uses this permission{" "}
        <Text style={styles.bold}>only on-device</Text> to draw your
        position on the map and to compute trip statistics. Location
        coordinates never leave your device. You may revoke Location
        access at any time from{" "}
        <Text style={styles.bold}>Settings &rarr; Privacy &amp;
        Security &rarr; Location Services &rarr; RiverRight</Text>; trip
        tracking will stop functioning, but the rest of the App will
        keep working.
      </Section>

      <Section title="USGS Flow Data Requests">
        When you view a river run, the App makes anonymous network
        requests to the public U.S. Geological Survey Water Services
        endpoint (
        <Text style={styles.bold}>waterservices.usgs.gov</Text>) to
        retrieve live streamflow data. These requests contain no
        personal identifier — only the USGS gauge site you are
        viewing. USGS handles such requests under its own privacy
        practices, which are independent of RiverRight.
      </Section>

      <Section title="In-App Purchases">
        In-app purchases (currently for unlocking individual river runs)
        are processed by Apple&apos;s App Store. RiverRight does not
        receive your name, email address, payment card, or any other
        personal billing information. We receive only an anonymous
        confirmation from StoreKit that a purchase associated with your
        Apple ID was successful. That confirmation is then used by the
        App, on your device, to mark the corresponding river as
        unlocked. Apple&apos;s handling of your purchase is governed by{" "}
        <Text style={styles.bold}>Apple&apos;s Privacy Policy</Text> at
        apple.com/legal/privacy.
      </Section>

      <Section title="Apple Analytics & Diagnostics">
        If you have enabled &ldquo;Share With App Developers&rdquo; in{" "}
        <Text style={styles.bold}>
          iOS Settings &rarr; Privacy &amp; Security &rarr; Analytics
          &amp; Improvements
        </Text>
        , Apple may independently collect anonymized crash reports and
        diagnostic data about the App and forward them to us as the
        developer. This is controlled entirely by Apple and your iOS
        settings, not by RiverRight, and is governed by Apple&apos;s
        Privacy Policy.
      </Section>

      <Section title="Children">
        RiverRight is intended for adults aged 18 and over. We do{" "}
        <Text style={styles.bold}>not</Text> knowingly collect
        information from any user, and the App is{" "}
        <Text style={styles.bold}>not directed to children</Text> under
        13 (for purposes of the U.S. Children&apos;s Online Privacy
        Protection Act, &ldquo;COPPA&rdquo;) or to minors under 16 (for
        purposes of the EU General Data Protection Regulation,
        &ldquo;GDPR&rdquo;). If you are under 18, please do not download or
        use the App.
      </Section>

      <Section title="No Sale or Sharing of Personal Information">
        Because we do not collect personal information from you, we have
        nothing to sell, rent, share, or disclose to advertisers, data
        brokers, or any third party. We do not embed third-party
        advertising SDKs, third-party analytics SDKs, or any cross-app
        tracking technology in the App.
      </Section>

      <Section title="Data Retention">
        RiverRight retains{" "}
        <Text style={styles.bold}>no</Text> personal information about
        users because none is collected. Trip data on your device is
        retained for as long as you keep it; you may delete individual
        trips, or all trip data, from within the App at any time.
      </Section>

      <Section title="Your Rights">
        Where applicable law (for example California&apos;s CCPA / CPRA,
        or the EU&apos;s GDPR) grants you rights to access, correct,
        port, or delete personal information about you held by a
        business, those rights only apply to information that business
        actually holds. Because RiverRight holds{" "}
        <Text style={styles.bold}>no personal information about you</Text>
        , there is no record for us to provide, correct, or delete. If
        you believe we are mistaken, you may contact us using the
        details below and we will respond promptly.
      </Section>

      <Section title="Changes to This Policy">
        We may update this Privacy Policy from time to time. Material
        changes will be surfaced in-app and you will be asked to{" "}
        <Text style={styles.bold}>affirmatively re-accept</Text> the
        Terms of Service and Privacy Policy before continuing to use
        the App. Non-material changes (typos, contact-info updates,
        formatting) take effect when posted.
      </Section>

      <Section title="Contact">
        Questions about this Privacy Policy may be sent to:
        {"\n\n"}RiverRight LLC
        {"\n"}State of Colorado, USA
        {"\n"}Email:{" "}
        <Text style={styles.bold}>contact@riverrightwhitewater.com</Text>
      </Section>

      <Text style={styles.footerNote}>
        © 2026 RiverRight LLC. All rights reserved.
      </Text>
    </View>
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
  updated: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 14,
    textAlign: "center",
  },
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
