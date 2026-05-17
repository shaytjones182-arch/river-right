// Body of the Terms of Service document.
//
// Extracted into a standalone component so the same source-of-truth text
// can be rendered both on the dedicated `/about/terms` page AND embedded
// inline inside the first-launch acceptance modal's expandable dropdown.
// If you need to update the legal copy, edit it here once.
//
// NOTE: This component renders ONLY the document body (warning + numbered
// sections + footer). The caller is responsible for the screen chrome
// (SafeAreaView, header, back button, etc.) and for wrapping it in a
// ScrollView if it's the only thing on screen.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "./theme";

export default function TermsOfServiceContent() {
  return (
    <View>
      <Text style={styles.updated}>Last updated: May 17, 2026</Text>

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
          difficulty ratings, and points of interest{" "}
          <Text style={styles.bold}>
            can change in a matter of hours
          </Text>
          , without warning, and may be inaccurate, incomplete, or missing
          entirely from this app. You assume all risks associated with
          using this app and any river activity you undertake.{" "}
          <Text style={styles.bold}>
            Always perform your own visual scout of every rapid from shore
            — your eyes on the water always override anything you see in
            this app.
          </Text>
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

      <Section title="4. Assumption of Risk & Static-Data Disclaimer">
        You expressly acknowledge, understand, and agree that:
        {"\n\n"}<Text style={styles.bold}>(a) River activities are inherently dangerous.</Text>{" "}
        Whitewater rafting, kayaking, canoeing, packrafting, stand-up
        paddleboarding, swimming, fishing, hiking near rivers, and the
        operation of any watercraft are inherently dangerous activities.
        They may result in property damage, equipment loss, capsize,
        entrapment, hypothermia, drowning, serious bodily injury, permanent
        disability, or <Text style={styles.bold}>death</Text>. You
        voluntarily choose to participate in these activities with full
        knowledge of these risks.
        {"\n\n"}<Text style={styles.bold}>(b) River conditions change without warning.</Text>{" "}
        Water level, flow rate, water temperature, strainers, sieves,
        newly-fallen wood, undercuts, rockfall, ice, lightning, wildfire
        smoke, dam releases, access restrictions, and other hazards can
        appear, disappear, or shift dramatically — sometimes within hours
        and without any prior notice — between the time the Content in
        this App was last compiled and the moment you are on the water.
        {"\n\n"}<Text style={styles.bold}>
          (c) THE APP IS A STATIC DIGITAL GUIDEBOOK, NOT A LIVE SAFETY
          SYSTEM.
        </Text>{" "}
        You expressly acknowledge that:
        {"\n\n"}(i) All river maps, polylines, mileages, rapid locations,
        rapid classifications (Class I–VI), hazard markers, points of
        interest, campground locations, access points, portage notes, and
        descriptive content (collectively, the{" "}
        <Text style={styles.bold}>&ldquo;Map Data&rdquo;</Text>) are compiled by
        RiverRight from{" "}
        <Text style={styles.bold}>
          manual, historical, third-party, and crowd-sourced reference
          materials
        </Text>
        , including but not limited to printed and electronic guidebooks,
        OpenStreetMap, U.S. Geological Survey datasets, and the personal
        observations of contributors who may have visited the river
        months, years, or decades before you;
        {"\n\n"}(ii) The Map Data is{" "}
        <Text style={styles.bold}>
          NOT updated on any fixed, scheduled, real-time, or guaranteed
          cadence.
        </Text>{" "}
        RiverRight makes no promise that the Map Data reflects the river
        as it exists today, this week, this season, or this year. Map Data
        may be{" "}
        <Text style={styles.bold}>
          months, years, or decades out of date
        </Text>{" "}
        at the time you view it;
        {"\n\n"}(iii) The App functions as a{" "}
        <Text style={styles.bold}>digital guidebook</Text>. It is{" "}
        <Text style={styles.bold}>not</Text> a real-time scout, a live
        hazard-detection system, a guide service, a safety-monitoring
        system, a search-and-rescue tool, an emergency-response platform,
        or a substitute for any of the foregoing. The App is{" "}
        <Text style={styles.bold}>blind to real-time river changes</Text>,
        including but not limited to new strainers, recent rockfall,
        shifted gravel bars, flood-rearranged channels, debris jams,
        changed put-ins or take-outs, recent fatalities, closures,
        permits, or land-access changes;
        {"\n\n"}(iv) USGS gauge readings and flow-related data displayed
        in the App are sourced from third-party APIs that may be{" "}
        <Text style={styles.bold}>
          delayed, cached, stale, throttled, missing, or temporarily
          unavailable
        </Text>
        , and any such data is provided for informational reference only;
        {"\n\n"}(v) Rapid class ratings shown in the App are{" "}
        <Text style={styles.bold}>
          subjective, source-dependent, and flow-dependent
        </Text>
        . A rapid rated Class III at one flow may be Class IV or V — or
        unrunnable — at another flow, in another season, or after a single
        high-water event;
        {"\n\n"}(vi) You will{" "}
        <Text style={styles.bold}>
          NOT rely on the App as your sole or primary source of
          decision-making information
        </Text>{" "}
        for any river activity, and you will independently verify current
        conditions through in-person scouting from shore, local guides,
        local outfitters, river managers, recent trip reports, current
        flow gauges, weather forecasts, and any other sources a reasonable
        paddler would consult.
        {"\n\n"}<Text style={styles.bold}>
          (d) Offline use carries additional risks you assume.
        </Text>{" "}
        When you use the App in &ldquo;offline&rdquo; or &ldquo;downloaded map&rdquo; mode
        (i.e., away from cellular or Wi-Fi coverage), you expressly
        acknowledge and assume the following additional risks, and you
        agree that RiverRight has{" "}
        <Text style={styles.bold}>no liability</Text> for any of the
        following:
        {"\n\n"}(i) Failure, drain, depletion, swelling, overheating,
        water damage, cold-weather shutdown, or any other malfunction of
        your device&apos;s <Text style={styles.bold}>battery</Text>,
        including unexpected shutdowns that leave you without access to
        any map data;
        {"\n\n"}(ii) Loss, degradation, drift, jamming, inaccuracy, or
        total unavailability of{" "}
        <Text style={styles.bold}>GPS, GNSS, or location services</Text>{" "}
        on your device, whether due to canyon walls, tree cover, weather,
        satellite geometry, atmospheric interference, hardware failure,
        software failure, operating-system update, airplane mode,
        low-power mode, or any other cause;
        {"\n\n"}(iii) Device damage, water intrusion, drop damage,
        freezing, overheating, theft, loss overboard, or any other
        physical failure of the device on which the App is installed;
        {"\n\n"}(iv) Out-of-date cached or downloaded Map Data that no
        longer reflects current river conditions, including downloaded
        map tiles that were captured months or years before your trip;
        {"\n\n"}(v) Loss of GPS-recorded trip data, breadcrumb tracks,
        waypoints, or any other user-generated content due to device
        failure, App crash, uninstall, operating-system update, or
        storage exhaustion.
        {"\n\n"}You agree to carry, and to know how to use,{" "}
        <Text style={styles.bold}>
          independent paper maps, a paper guidebook, a compass, a backup
          means of communication (such as a satellite messenger or PLB),
          appropriate safety gear, and a written trip plan filed with a
          responsible third party
        </Text>
        , and you will not depend on the App or your device as your sole
        means of navigation, communication, or emergency response.
        {"\n\n"}<Text style={styles.bold}>
          (e) You voluntarily assume all risk.
        </Text>{" "}
        <Text style={styles.bold}>
          YOU EXPRESSLY AND VOLUNTARILY ASSUME ANY AND ALL RISK
        </Text>{" "}
        of loss, damage, injury, illness, disability, or death — to
        yourself, to anyone in your party, to your equipment, and to any
        third party — arising from or related to: your use of the App;
        your reliance on the Map Data or any other Content; your
        participation in any river activity informed in any way by the
        App; the failure, inaccuracy, or unavailability of the App or
        your device; and any condition of the river that differs from
        what the App depicts.
      </Section>

      <Section title='5. "Ground Truth" — Your Eyes Override the App'>
        The App is a planning and reference aid. It is{" "}
        <Text style={styles.bold}>
          not a real-time scout, guide, or safety system
        </Text>
        . You must always perform your own visual scout of every rapid,
        horizon line, strainer, and hazard from shore before committing to
        a line. If what you see on the water disagrees with anything shown
        in the App — including a rapid&apos;s class, its location, its
        marked line, its name, the presence or absence of hazards, or any
        other detail —{" "}
        <Text style={styles.bold}>
          your own on-the-ground (or on-the-water) observation always wins
        </Text>
        . Portage when in doubt. Do not run anything you have not visually
        confirmed.
      </Section>

      <Section title="6. No Warranty of Accuracy">
        GPS coordinates, distance and mileage calculations, river flow
        values, gauge readings, weather information, and{" "}
        <Text style={styles.bold}>
          rapid classifications (e.g. Class I, II, III, IV, V, VI)
        </Text>{" "}
        shown in the App are provided{" "}
        <Text style={styles.bold}>for reference only</Text>. Rapid grades
        reflect general observations at typical flows and may not reflect
        the actual difficulty of any given rapid at the flow, weather,
        time of year, or condition you encounter. Class ratings are
        subjective, vary between sources, and change with water level —
        a Class III at one flow can become a Class IV or V at another.
        The App makes{" "}
        <Text style={styles.bold}>no representation or warranty</Text>{" "}
        that any data point is accurate, current, complete, or fit for
        any purpose, and you agree not to rely on the App as your sole
        source of decision-making information for any river activity.
      </Section>

      <Section title="7. License to Use the App">
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

      <Section title="8. In-App Purchases">
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

      <Section title="9. User-Generated Data">
        The App may record GPS-based trip tracking data (location, speed,
        distance, time) on your device. This data is stored locally on
        your device by default; we do not collect or transmit it to our
        servers unless you explicitly opt in to a future cloud-backup
        feature. You are solely responsible for your trip data and any
        loss of that data due to device damage, deletion, or uninstall.
      </Section>

      <Section title='10. "AS IS" — No Warranties'>
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

      <Section title="11. Release of Liability and Covenant Not to Sue">
        <Text style={styles.bold}>
          PLEASE READ THIS SECTION CAREFULLY. IT AFFECTS YOUR LEGAL
          RIGHTS, INCLUDING YOUR RIGHT TO SUE. BY ACCEPTING THESE TERMS
          AND USING THE APP, YOU ARE AGREEING TO RELEASE LEGAL CLAIMS
          AGAINST RIVERRIGHT LLC.
        </Text>
        {"\n\n"}<Text style={styles.bold}>(a) Release.</Text> To the
        maximum extent permitted by the laws of the State of Colorado,{" "}
        <Text style={styles.bold}>
          you, on behalf of yourself, your heirs, executors,
          administrators, personal representatives, spouse, children,
          assigns, and anyone else who could bring a claim derivative of
          yours (collectively, &ldquo;Releasors&rdquo;), hereby RELEASE, WAIVE,
          DISCHARGE, AND COVENANT NOT TO SUE
        </Text>{" "}
        RiverRight LLC and its members, managers, officers, employees,
        contractors, agents, licensors, data providers, and suppliers
        (collectively, <Text style={styles.bold}>&ldquo;Released Parties&rdquo;</Text>)
        from any and all liability, claims, demands, actions, causes of
        action, suits, damages, losses, costs, or expenses of any kind —
        whether known or unknown, anticipated or unanticipated, foreseen
        or unforeseen — arising out of or in any way related to:
        {"\n\n"}(i) Your access to, download of, installation of, or use
        of the App;
        {"\n\n"}(ii) Your reliance on the Map Data, Content, flow data,
        gauge readings, rapid classifications, hazard markers, GPS
        tracking, or any other information provided by or through the
        App;
        {"\n\n"}(iii) Any river activity you undertake, plan, scout,
        attempt, or complete, whether or not the App played any role in
        your decisions;
        {"\n\n"}(iv) Any failure, inaccuracy, staleness, delay,
        unavailability, or malfunction of the App, the Map Data, your
        device, your device&apos;s battery, GPS or location services,
        cellular service, satellite service, or any third-party data
        source the App incorporates;
        {"\n\n"}(v) Any property damage, equipment loss, bodily injury,
        illness, disability, emotional distress, wrongful death, or other
        harm of any kind suffered by you, by any member of your party, or
        by any third party,
        {"\n\n"}<Text style={styles.bold}>
          INCLUDING WITHOUT LIMITATION ANY CLAIMS BASED IN WHOLE OR IN
          PART ON THE ORDINARY NEGLIGENCE OF ANY RELEASED PARTY.
        </Text>
        {"\n\n"}<Text style={styles.bold}>
          (b) Scope of Release — what is and is not waived.
        </Text>{" "}
        You acknowledge that under Colorado law (see{" "}
        <Text style={styles.bold}>Jones v. Dressel</Text>, 623 P.2d 370
        (Colo. 1981) and its progeny), pre-injury releases of liability
        for <Text style={styles.bold}>ordinary negligence</Text> are valid
        and enforceable when knowingly and voluntarily agreed to, but a
        party <Text style={styles.bold}>cannot prospectively release</Text>{" "}
        another party from liability for{" "}
        <Text style={styles.bold}>
          willful and wanton conduct, gross negligence, or intentional
          misconduct
        </Text>
        , nor from liability that cannot be released as a matter of
        public policy or statute.
        {"\n\n"}Accordingly, this release{" "}
        <Text style={styles.bold}>DOES</Text> waive:
        {"\n\n"}• claims arising from{" "}
        <Text style={styles.bold}>ordinary negligence</Text> of any
        Released Party;
        {"\n"}• claims arising from breach of any warranty (express,
        implied, statutory, or otherwise) to the maximum extent
        disclaimable by law;
        {"\n"}• claims arising from strict liability to the maximum extent
        waivable by law;
        {"\n"}• claims for inaccurate, incomplete, stale, missing, or
        out-of-date Map Data or Content;
        {"\n"}• claims for any device, battery, GPS, connectivity, or
        third-party-service failure.
        {"\n\n"}This release <Text style={styles.bold}>DOES NOT</Text>{" "}
        waive:
        {"\n\n"}• claims arising from the{" "}
        <Text style={styles.bold}>
          willful and wanton conduct, gross negligence, or intentional
          misconduct
        </Text>{" "}
        of a Released Party;
        {"\n"}• claims that, as a matter of Colorado public policy or
        non-waivable statute, cannot be released in advance;
        {"\n"}• claims arising under consumer-protection statutes to the
        extent such statutes prohibit pre-dispute waiver.
        {"\n\n"}<Text style={styles.bold}>
          (c) Limitation of Liability (Cap).
        </Text>{" "}
        To the maximum extent permitted by law, and{" "}
        <Text style={styles.bold}>
          without limiting subsection (b) above
        </Text>
        , the aggregate liability of the Released Parties to you for all
        claims, in the aggregate, arising out of or related to these
        Terms, the App, or the Content — whether based in contract, tort
        (including negligence), strict liability, statute, or any other
        legal theory —{" "}
        <Text style={styles.bold}>
          shall not exceed the greater of (i) the total amount you have
          actually paid to RiverRight LLC in the twelve (12) months
          preceding the event giving rise to the claim, or (ii) one
          hundred U.S. dollars ($100.00).
        </Text>{" "}
        This cap shall not apply to liability that cannot be capped under
        Colorado law, including willful and wanton conduct.
        {"\n\n"}<Text style={styles.bold}>
          (d) Knowing and voluntary waiver.
        </Text>{" "}
        You acknowledge and represent that:
        {"\n\n"}(i) You have{" "}
        <Text style={styles.bold}>read this entire release</Text>,
        including subsection (b), and understand that you are giving up
        substantial legal rights, including the right to sue Released
        Parties for ordinary negligence;
        {"\n\n"}(ii) You are entering into this release{" "}
        <Text style={styles.bold}>
          freely, knowingly, and voluntarily
        </Text>
        , without duress and without reliance on any oral statement,
        inducement, or representation not contained in these Terms;
        {"\n\n"}(iii) You have had the opportunity to seek independent
        legal counsel of your choosing before accepting these Terms;
        {"\n\n"}(iv) You are at least 18 years of age and legally
        competent to enter into this release; and
        {"\n\n"}(v) You{" "}
        <Text style={styles.bold}>
          intend this release to be as broad and inclusive as is permitted
          by the laws of the State of Colorado
        </Text>
        , and if any portion is held invalid, the remainder shall continue
        in full legal force and effect.
        {"\n\n"}<Text style={styles.bold}>(e) Covenant Not to Sue.</Text>{" "}
        Releasors covenant and agree not to commence, prosecute, maintain,
        or finance any lawsuit, class action, or representative action
        against any Released Party, except as strictly necessary to compel
        or participate in binding arbitration as required by Section 17
        of these Terms. If a Releasor brings any such action in breach of
        this covenant, that Releasor shall indemnify the Released Parties
        for their reasonable attorneys&apos; fees and costs incurred in
        defending the action, to the maximum extent permitted by law.
        {"\n\n"}<Text style={styles.bold}>(f) Survival.</Text> This
        Section 11 survives termination of these Terms, deletion of the
        App, expiration of any in-app purchase, and the cessation of your
        use of the App, and binds your heirs, assigns, personal
        representatives, and next of kin.
      </Section>

      <Section title="12. Indemnification">
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

      <Section title="13. Third-Party Data Sources">
        The App incorporates data from third parties (including but not
        limited to the U.S. Geological Survey and OpenStreetMap). RiverRight
        does not control, verify, or warrant the accuracy of third-party
        data and disclaims all liability arising from such data. See the
        Attributions section of the App for details and links.
      </Section>

      <Section title="14. Modifications">
        We reserve the right to modify the App, the Content, pricing, and
        these Terms at any time. Material changes to the Terms will be
        surfaced in-app and will become effective when posted. Your
        continued use of the App after a change constitutes your
        acceptance of the revised Terms. If you do not agree, your only
        remedy is to stop using the App.
      </Section>

      <Section title="15. Termination">
        We may suspend or terminate your access to the App, with or without
        notice, for any reason including violation of these Terms. Upon
        termination, all rights granted to you under these Terms cease
        immediately. Sections 4 (Assumption of Risk &amp; Static-Data
        Disclaimer), 5 (Ground Truth), 6 (No Warranty of Accuracy), 10
        (No Warranties), 11 (Release of Liability and Covenant Not to
        Sue), 12 (Indemnification), 16 (Governing Law), and 17 (Dispute
        Resolution) survive any termination.
      </Section>

      <Section title="16. Governing Law">
        These Terms are governed by the laws of the{" "}
        <Text style={styles.bold}>State of Colorado, USA</Text>, without
        regard to its conflict-of-laws principles. The United Nations
        Convention on Contracts for the International Sale of Goods does
        not apply.
      </Section>

      <Section title="17. Dispute Resolution & Class-Action Waiver">
        Any dispute arising out of or relating to these Terms or the App
        shall be resolved exclusively by{" "}
        <Text style={styles.bold}>individual, binding arbitration</Text>{" "}
        administered by the American Arbitration Association under its
        Consumer Arbitration Rules, seated in the State of Colorado. You
        and RiverRight each waive any right to a jury trial and any right
        to participate in a{" "}
        <Text style={styles.bold}>class action</Text>, class arbitration,
        or representative action. Either party may seek injunctive relief
        in a court of competent jurisdiction in Colorado for intellectual
        property or in-app purchase enforcement.
      </Section>

      <Section title="18. Severability">
        If any provision of these Terms is found unenforceable, the
        remaining provisions remain in full effect.
      </Section>

      <Section title="19. Entire Agreement">
        These Terms, together with the Privacy Policy (when published) and
        any in-app purchase terms, constitute the entire agreement between
        you and RiverRight regarding the App.
      </Section>

      <Section title="20. Contact">
        Questions, notices, or concerns may be sent to:
        {"\n\n"}RiverRight LLC
        {"\n"}State of Colorado, USA
        {"\n"}Email:{" "}
        <Text style={styles.bold}>[support@riverright.app]</Text>{" "}
        (placeholder — replace before publishing)
      </Section>

      <Text style={styles.footerNote}>© 2025 RiverRight LLC. All rights reserved.</Text>
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
