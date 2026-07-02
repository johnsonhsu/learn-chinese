// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  redeemCode,
  isFeatureUnlocked,
  getUnlockedFeatures,
  setUnlockedFeatures,
} from "../unlocks.js";

// The two-tier, prerequisite-chained unlock scheme (issue #40). Codes:
//   9000 → 'premium-prereq' (prerequisite; reveals nothing)
//   9900 → 'theme-silver'  (requires premium-prereq)
//   9901 → 'theme-gold'    (requires premium-prereq)
//   8000 → 'admin-prereq'  (prerequisite; reveals nothing)
//   8001 → 'admin'         (requires admin-prereq)
// Removed: 9999, 8888 (no longer redeem). Unlocks are device-scoped (localStorage).
//
// SECURITY BY OBSCURITY (issue #40 revision): a valid-but-locked code entered
// before its prerequisite (e.g. 9900 before 9000, or 8001 before 8000) must be
// INDISTINGUISHABLE from a genuinely invalid code in the UI — same "Invalid
// code", no hint the code is real or that a prerequisite exists. redeemCode
// still returns the distinct 'prerequisite-missing' status here so the GATING
// logic stays explicit and asserted; the keypad (CodeEntry) is what renders it
// identically to 'unknown'. The invariant these tests pin is the one that makes
// that safe: prerequisite-missing GRANTS NOTHING, exactly like unknown.

beforeEach(() => {
  localStorage.clear();
});

describe("redeemCode — premium series", () => {
  it("9000 grants the premium prerequisite and reveals no theme on its own", () => {
    expect(redeemCode("9000")).toEqual({ status: "granted", feature: "premium-prereq" });
    expect(isFeatureUnlocked("premium-prereq")).toBe(true);
    expect(isFeatureUnlocked("theme-silver")).toBe(false);
    expect(isFeatureUnlocked("theme-gold")).toBe(false);
  });

  it("9000 then 9900 → Silver granted, Gold NOT", () => {
    redeemCode("9000");
    expect(redeemCode("9900")).toEqual({ status: "granted", feature: "theme-silver" });
    expect(isFeatureUnlocked("theme-silver")).toBe(true);
    expect(isFeatureUnlocked("theme-gold")).toBe(false);
  });

  it("9000 then 9901 → Gold granted, Silver NOT", () => {
    redeemCode("9000");
    expect(redeemCode("9901")).toEqual({ status: "granted", feature: "theme-gold" });
    expect(isFeatureUnlocked("theme-gold")).toBe(true);
    expect(isFeatureUnlocked("theme-silver")).toBe(false);
  });

  // 9900 before its prerequisite grants nothing — and, like an unknown code, the
  // keypad shows the generic "Invalid code" (UI equivalence is in CodeEntry).
  it("9900 WITHOUT 9000 → prerequisite-missing, grants nothing (treated as invalid)", () => {
    expect(redeemCode("9900")).toEqual({
      status: "prerequisite-missing",
      required: "premium-prereq",
    });
    expect(isFeatureUnlocked("theme-silver")).toBe(false);
    expect(getUnlockedFeatures()).toEqual([]);
  });

  it("9901 WITHOUT 9000 → prerequisite-missing, grants nothing (treated as invalid)", () => {
    expect(redeemCode("9901")).toEqual({
      status: "prerequisite-missing",
      required: "premium-prereq",
    });
    expect(isFeatureUnlocked("theme-gold")).toBe(false);
    expect(getUnlockedFeatures()).toEqual([]);
  });

  it("a rejected dependent code does not leave partial state, then succeeds after the prerequisite", () => {
    expect(redeemCode("9900").status).toBe("prerequisite-missing");
    expect(getUnlockedFeatures()).toEqual([]);
    redeemCode("9000");
    expect(redeemCode("9900")).toEqual({ status: "granted", feature: "theme-silver" });
  });
});

describe("redeemCode — admin series", () => {
  it("8000 grants the admin prerequisite and reveals no admin on its own", () => {
    expect(redeemCode("8000")).toEqual({ status: "granted", feature: "admin-prereq" });
    expect(isFeatureUnlocked("admin-prereq")).toBe(true);
    expect(isFeatureUnlocked("admin")).toBe(false);
  });

  it("8000 then 8001 → admin granted (the admin-menu reveal 8888 used to do)", () => {
    redeemCode("8000");
    expect(redeemCode("8001")).toEqual({ status: "granted", feature: "admin" });
    expect(isFeatureUnlocked("admin")).toBe(true);
  });

  it("8001 WITHOUT 8000 → prerequisite-missing, grants nothing (treated as invalid)", () => {
    expect(redeemCode("8001")).toEqual({
      status: "prerequisite-missing",
      required: "admin-prereq",
    });
    expect(isFeatureUnlocked("admin")).toBe(false);
    expect(getUnlockedFeatures()).toEqual([]);
  });
});

// The behavioral invariant that backs the "no hint" UI (issue #40 revision): a
// valid-but-locked code (prerequisite-missing) leaves the device in the SAME
// state as a genuinely unknown code — nothing granted. The keypad then renders
// both as the identical "Invalid code", so neither leaks that the code is real.
describe("prerequisite-missing is indistinguishable from unknown (grants nothing)", () => {
  it("9900-before-9000 and an unknown code both leave no unlocks", () => {
    expect(redeemCode("9900").status).toBe("prerequisite-missing");
    const afterLocked = getUnlockedFeatures();
    localStorage.clear();
    expect(redeemCode("5555").status).toBe("unknown");
    const afterUnknown = getUnlockedFeatures();
    expect(afterLocked).toEqual(afterUnknown);
    expect(afterLocked).toEqual([]);
  });

  it("8001-before-8000 and an unknown code both leave no unlocks", () => {
    expect(redeemCode("8001").status).toBe("prerequisite-missing");
    const afterLocked = getUnlockedFeatures();
    localStorage.clear();
    expect(redeemCode("5555").status).toBe("unknown");
    const afterUnknown = getUnlockedFeatures();
    expect(afterLocked).toEqual(afterUnknown);
    expect(afterLocked).toEqual([]);
  });
});

describe("redeemCode — removed codes", () => {
  it("9999 no longer redeems", () => {
    expect(redeemCode("9999")).toEqual({ status: "unknown" });
    expect(getUnlockedFeatures()).toEqual([]);
  });

  it("8888 no longer redeems", () => {
    expect(redeemCode("8888")).toEqual({ status: "unknown" });
    expect(getUnlockedFeatures()).toEqual([]);
  });

  it("an arbitrary unknown code returns unknown and grants nothing", () => {
    expect(redeemCode("1234")).toEqual({ status: "unknown" });
    expect(getUnlockedFeatures()).toEqual([]);
  });
});

describe("back-compat — pre-stored device flags", () => {
  it('a device pre-loaded with legacy "premium" still reports it unlocked', () => {
    setUnlockedFeatures(["premium"]);
    expect(isFeatureUnlocked("premium")).toBe(true);
  });

  it('a device pre-loaded with legacy "admin" still reports it unlocked', () => {
    setUnlockedFeatures(["admin"]);
    expect(isFeatureUnlocked("admin")).toBe(true);
  });
});

describe("device-scoped persistence", () => {
  it("redeemed features persist (survive a re-read) and accumulate", () => {
    redeemCode("9000");
    redeemCode("9900");
    redeemCode("8000");
    redeemCode("8001");
    const set = getUnlockedFeatures();
    expect(set).toContain("premium-prereq");
    expect(set).toContain("theme-silver");
    expect(set).toContain("admin-prereq");
    expect(set).toContain("admin");
  });

  it("redeeming the same code twice does not duplicate the feature", () => {
    redeemCode("8000");
    redeemCode("8000");
    expect(getUnlockedFeatures().filter((f) => f === "admin-prereq")).toHaveLength(1);
  });
});

describe("redeemCode — seasonal all-year unlock (issue #128)", () => {
  it("9980 grants theme-christmas-allyear with NO prerequisite", () => {
    expect(redeemCode("9980")).toEqual({ status: "granted", feature: "theme-christmas-allyear" });
    expect(isFeatureUnlocked("theme-christmas-allyear")).toBe(true);
  });
});
