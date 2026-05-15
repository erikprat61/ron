import { describe, expect, it } from "bun:test";
import { getAllowedGoogleOidcAudiences, getAllowedGooglePrincipal } from "./refresh-trigger.ts";

describe("refresh trigger helpers", () => {
  it("accepts both the explicit refresh URL and the Cloud Run service root audience", () => {
    expect(getAllowedGoogleOidcAudiences("https://ron-api.example.run.app/internal/refresh")).toEqual([
      "https://ron-api.example.run.app/internal/refresh",
      "https://ron-api.example.run.app",
      "https://ron-api.example.run.app/",
      "http://ron-api.example.run.app/internal/refresh",
      "http://ron-api.example.run.app",
      "http://ron-api.example.run.app/"
    ]);
  });

  it("matches Google service-account principals from email, subject, or authorized party", () => {
    expect(
      getAllowedGooglePrincipal(
        {
          sub: "116453908564999028868",
          azp: "116453908564999028868",
          email: "staging-ron-refresh@ron-burgundy-staging.iam.gserviceaccount.com"
        },
        [
          "staging-ron-refresh@ron-burgundy-staging.iam.gserviceaccount.com",
          "116453908564999028868"
        ]
      )
    ).toBe("staging-ron-refresh@ron-burgundy-staging.iam.gserviceaccount.com");

    expect(
      getAllowedGooglePrincipal(
        {
          sub: "116453908564999028868",
          azp: "116453908564999028868"
        },
        ["116453908564999028868"]
      )
    ).toBe("116453908564999028868");

    expect(
      getAllowedGooglePrincipal(
        {
          azp: "116453908564999028868"
        },
        ["116453908564999028868"]
      )
    ).toBe("116453908564999028868");
  });
});
