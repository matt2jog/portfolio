import assert from "node:assert/strict";
import test from "node:test";
import { publicGeoIpHint } from "../../backend/geoip";

test("application GeoIP is explicitly unknown and contains no visitor identifier", () => {
  const hint = publicGeoIpHint();
  assert.deepEqual(hint, {
    country_code: null,
    status: "unknown",
  });
  assert.deepEqual(Object.keys(hint).sort(), ["country_code", "status"]);
});
