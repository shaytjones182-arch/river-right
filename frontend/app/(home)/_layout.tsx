// Home-tab stack. Lives inside the (home) group so the URL stays at the root
// (/) and tab-switching preserves the user's exact in-tab navigation history:
// if you tap a river card → /river/desolation, switch to Map, then switch
// back to Home, you land back on /river/desolation — not the Home list.

import { Stack } from "expo-router";

export default function HomeStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    />
  );
}
