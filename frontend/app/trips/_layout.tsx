// Trips-tab stack. Wraps /trips and /trips/[id] in a single Stack navigator so
// that pressing back from a trip detail returns to the Past Trips list
// instead of falling back to whichever tab was previously active. Without
// this, each route would be its own tab-level screen with an empty back
// history.

import { Stack } from "expo-router";

export default function TripsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    />
  );
}
