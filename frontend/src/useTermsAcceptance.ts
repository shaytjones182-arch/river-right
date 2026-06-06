// AsyncStorage-backed hook that tracks whether the user has accepted the
// current version of the Terms of Service.
//
// Bump TERMS_VERSION whenever the legal text changes in a material way.
// Existing users will then be re-prompted to accept the new terms.

import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const TERMS_VERSION = "3.2.0";
const STORAGE_KEY = "@riverright:terms_accepted_version";

type Status = "loading" | "accepted" | "needs-acceptance";

export function useTermsAcceptance() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!mounted) return;
        setStatus(stored === TERMS_VERSION ? "accepted" : "needs-acceptance");
      } catch {
        // If AsyncStorage fails we err on the safe side and force acceptance.
        if (mounted) setStatus("needs-acceptance");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const accept = useCallback(async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, TERMS_VERSION);
    } catch {
      // Best-effort: if save fails we still let the user in for this session.
    }
    setStatus("accepted");
  }, []);

  return { status, accept };
}
