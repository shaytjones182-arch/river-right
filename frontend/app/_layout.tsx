import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import TermsAcceptanceModal from "../src/TermsAcceptanceModal";
import { useTermsAcceptance } from "../src/useTermsAcceptance";

export default function RootLayout() {
  const { status, accept } = useTermsAcceptance();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Tabs
          screenOptions={{
            headerShown: false,
            // Keep state when switching tabs. These match React Navigation's
            // defaults but we set them explicitly so this never regresses.
            unmountOnBlur: false,
            freezeOnBlur: false,
            lazy: true,
            tabBarActiveTintColor: "#0077B6",
            tabBarInactiveTintColor: "#5C6B73",
            tabBarStyle: {
              backgroundColor: "#FFFFFF",
              borderTopColor: "#E0E1DD",
              borderTopWidth: 1,
              height: 84,
              paddingBottom: 26,
              paddingTop: 8,
            },
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 0.4,
              textTransform: "uppercase",
            },
          }}
        >
          <Tabs.Screen
            name="(home)"
            options={{
              title: "Home",
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="home" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="map"
            options={{
              title: "Map",
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="map" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="track"
            options={{
              title: "Track",
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="navigate" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="trips/index"
            options={{ href: null }}
          />
          <Tabs.Screen
            name="trips/[id]"
            options={{ href: null }}
          />
          <Tabs.Screen
            name="about/index"
            options={{ href: null }}
          />
          <Tabs.Screen
            name="about/terms"
            options={{ href: null }}
          />
          <Tabs.Screen
            name="about/attributions"
            options={{ href: null }}
          />
        </Tabs>
        <TermsAcceptanceModal
          visible={status === "needs-acceptance"}
          onAccept={accept}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
