// Attributions screen — credits all third-party data sources and libraries.

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { COLORS } from "../../src/theme";

type Credit = {
  title: string;
  blurb: string;
  license?: string;
  url?: string;
  required?: boolean;
};

const DATA_SOURCES: Credit[] = [
  {
    title: "U.S. Geological Survey — Water Services",
    blurb:
      "Real-time and historical streamflow data (discharge, gauge height) for every USGS gauge used in the app. We query the Instantaneous Values service via waterservices.usgs.gov to power our flow readouts and gauge pages.",
    license: "U.S. Government public domain (USGS work)",
    url: "https://waterservices.usgs.gov/",
  },
  {
    title: "U.S. Geological Survey — The National Map (USGSTopo)",
    blurb:
      "Topographic basemap tiles served from basemap.nationalmap.gov, used as the primary map background throughout the app.",
    license: "U.S. Government public domain (USGS work)",
    url: "https://www.usgs.gov/programs/national-geospatial-program/national-map",
  },
  {
    title: "OpenStreetMap contributors",
    blurb:
      "We use OpenStreetMap data — not OSM map tiles — as a source for points of interest (rapids, campgrounds, boat ramps, hazards) queried via the Overpass API. POI data only; map tiles come exclusively from USGS. © OpenStreetMap contributors.",
    license: "Open Database License (ODbL) 1.0",
    url: "https://www.openstreetmap.org/copyright",
    required: true,
  },
  {
    title: "Bureau of Land Management (BLM)",
    blurb:
      "Primary reference for the seasonal CFS flow ranges (Very low / Low / Normal / High) used on individual river runs, supplemented by community consensus and standard river-safety guidance.",
    url: "https://www.blm.gov/",
  },
  {
    title:
      "Guide to the Green River in Desolation and Gray Canyons — Duwain Whitis & Barbara Vinson (RiverMaps LLC, 2009)",
    blurb:
      "Used as a reference for rapid locations, rapid classifications, and campsite locations on the Green River — Desolation Canyon run.",
  },
  {
    title:
      "Belknap's Waterproof Desolation Canyon River Guide — Buzz Belknap & Loie Belknap Evans (Westwater Books, 2013)",
    blurb:
      "Used as a reference for rapid locations and campsite locations on the Green River — Desolation Canyon run.",
  },
];

const SOFTWARE: Credit[] = [
  {
    title: "Leaflet",
    blurb: "Open-source JavaScript library for interactive maps.",
    license: "BSD 2-Clause",
    url: "https://leafletjs.com/",
  },
  {
    title: "Expo & React Native",
    blurb: "The application framework and toolchain.",
    license: "MIT",
    url: "https://expo.dev/",
  },
  {
    title: "Ionicons",
    blurb: "Icon set used throughout the interface.",
    license: "MIT",
    url: "https://ionic.io/ionicons",
  },
  {
    title: "react-native-svg",
    blurb: "Used to render the custom map legend icons.",
    license: "MIT",
    url: "https://github.com/software-mansion/react-native-svg",
  },
  {
    title: "Open Source Community",
    blurb:
      "Thanks to the broader open-source ecosystem (FastAPI, httpx, pyproj, Unsplash photographers, and many others) that makes a small app like this possible.",
  },
];

export default function Attributions() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="attributions-screen">
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={10}
          testID="attributions-back"
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.textMain} />
        </TouchableOpacity>
        <Text style={styles.title}>Attributions</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={styles.intro}>
          RiverRight is built on the work of public agencies, open-data
          communities, and open-source developers. The credits below honor
          that work and satisfy our license obligations.
        </Text>

        <Text style={styles.h2}>Data sources</Text>
        {DATA_SOURCES.map((c) => (
          <CreditCard key={c.title} credit={c} />
        ))}

        <Text style={styles.h2}>Software & libraries</Text>
        {SOFTWARE.map((c) => (
          <CreditCard key={c.title} credit={c} />
        ))}

        <View style={styles.osmFootnote}>
          <Text style={styles.osmFootnoteText}>
            <Text style={styles.bold}>Note on OpenStreetMap:</Text> map and POI
            data sourced from OpenStreetMap is licensed under the Open Database
            License. You are free to copy, distribute, transmit and adapt the
            data, as long as you credit OpenStreetMap and its contributors.
          </Text>
        </View>

        <Text style={styles.footerNote}>
          If you believe a source is missing or misattributed, please contact
          us at{" "}
          <Text style={styles.bold}>[support@riverright.app]</Text>{" "}
          (placeholder) and we&apos;ll correct it promptly.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function CreditCard({ credit }: { credit: Credit }) {
  const open = () => credit.url && Linking.openURL(credit.url);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{credit.title}</Text>
      {credit.license ? (
        <View style={styles.licensePill}>
          <Text style={styles.licenseText}>{credit.license}</Text>
        </View>
      ) : null}
      <Text style={styles.cardBlurb}>{credit.blurb}</Text>
      {credit.url ? (
        <TouchableOpacity onPress={open} activeOpacity={0.7} style={styles.linkRow}>
          <Ionicons name="open-outline" size={14} color={COLORS.primary} />
          <Text style={styles.linkText} numberOfLines={1}>
            {credit.url.replace(/^https?:\/\//, "")}
          </Text>
        </TouchableOpacity>
      ) : null}
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
  intro: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textMain,
    marginBottom: 22,
  },
  h2: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.textMuted,
    letterSpacing: 1.4,
    marginTop: 8,
    marginBottom: 10,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.textMain,
    letterSpacing: -0.2,
  },
  licensePill: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  licenseText: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  cardBlurb: {
    fontSize: 12.5,
    lineHeight: 19,
    color: COLORS.textMain,
    marginTop: 8,
  },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  linkText: { fontSize: 12, color: COLORS.primary, fontWeight: "800", flexShrink: 1 },
  bold: { fontWeight: "900" },
  osmFootnote: {
    backgroundColor: COLORS.info + "10",
    borderWidth: 1,
    borderColor: COLORS.info + "33",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  osmFootnoteText: { fontSize: 12, lineHeight: 18, color: COLORS.textMain },
  footerNote: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 22,
    fontWeight: "700",
  },
});
