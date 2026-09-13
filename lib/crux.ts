import type { Field } from "./types";
export async function getCrux(
  url: string,
  device: "PHONE" | "DESKTOP",
): Promise<Field> {
  if (!process.env.CRUX_API_KEY)
    return {
      status: "not-configured",
      message:
        "Real User Data is not configured. Add a CrUX API key in the server environment.",
    };
  try {
    const response = await fetch(
      `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(process.env.CRUX_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          formFactor: device,
          metrics: [
            "largest_contentful_paint",
            "interaction_to_next_paint",
            "cumulative_layout_shift",
          ],
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (response.status === 404)
      return {
        status: "unavailable",
        message: "Not enough Chrome UX Report data is available for this URL.",
      };
    if (!response.ok)
      return {
        status: "error",
        message: `CrUX request failed (${response.status}). No field metrics are inferred.`,
      };
    const data = await response.json();
    return {
      status: "available",
      message: "Chrome UX Report · 75th percentile",
      record: data.record,
    };
  } catch {
    return {
      status: "error",
      message: "CrUX request failed. No field metrics are inferred.",
    };
  }
}
