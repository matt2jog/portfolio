export type PublicGeoIpHint = {
  country_code: null;
  status: "unknown";
};

export function publicGeoIpHint(): PublicGeoIpHint {
  return {
    country_code: null,
    status: "unknown",
  };
}
