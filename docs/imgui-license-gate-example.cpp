// Sample implementation blueprint for ImGui + Theos integration.
// Replace HTTP stubs with NSURLSession/cURL depending on your environment.

#include <string>
#include "imgui.h"

static bool g_licenseVerified = false;
static char g_licenseKeyInput[128] = "";
static std::string g_licenseMessage = "Please enter a valid key to continue.";
static bool g_isVerifying = false;
static std::string g_expiresAt = "-";
static std::string g_plan = "-";
static std::string g_serverHost = "https://admin.aovpro.com"; // only update this host

struct VerifyResponse {
    bool ok = false;
    std::string reason;
    std::string expiresAt;
    std::string plan;
};

// Implement this with your own HTTP layer:
// POST {HOST}/api/licenses/verify
static bool VerifyKeyWithServer(
    const std::string& host,
    const std::string& key,
    const std::string& deviceId,
    VerifyResponse& out
) {
    // endpoint = host + "/api/licenses/verify"
    // body = { "licenseKey": key, "deviceId": deviceId, "packageId": "...", "appVersion": "..." }
    // parse JSON response into out.{ok,reason,expiresAt,plan}
    // ------------------------------------------------------
    // Demo logic only:
    if (key == "AOVP-9AF3-CX00-21HH") {
      out.ok = true;
      out.plan = "pro";
      out.expiresAt = "2026-12-31T23:59:59Z";
      return true;
    }
    out.ok = false;
    out.reason = "Invalid key";
    return false;
}

static void RenderLicenseGateUI() {
    ImGui::Begin("License Activation");
    ImGui::Text("Enter your activation key");
    ImGui::Text("Host: %s", g_serverHost.c_str());
    ImGui::InputText("License Key", g_licenseKeyInput, IM_ARRAYSIZE(g_licenseKeyInput));

    if (g_isVerifying) {
      ImGui::Text("Verifying...");
    } else if (ImGui::Button("Verify Key")) {
      g_isVerifying = true;
      VerifyResponse resp;
      const std::string key = std::string(g_licenseKeyInput);
      const std::string deviceId = "ios-device-hash";

      bool ok = VerifyKeyWithServer(g_serverHost, key, deviceId, resp);
      g_isVerifying = false;
      if (ok) {
        g_licenseVerified = true;
        g_plan = resp.plan;
        g_expiresAt = resp.expiresAt;
        g_licenseMessage = "License activated.";
      } else {
        g_licenseMessage = "Activation failed: " + resp.reason;
      }
    }

    ImGui::Spacing();
    ImGui::Text("Plan: %s", g_plan.c_str());
    ImGui::Text("Expires At: %s", g_expiresAt.c_str());
    ImGui::TextWrapped("%s", g_licenseMessage.c_str());
    ImGui::End();
}

void RenderMainMenu() {
    if (!g_licenseVerified) {
      RenderLicenseGateUI();
      return;
    }

    // Your protected app menu only appears after license verification.
    ImGui::Begin("AOV Pro");
    ImGui::Text("Premium features unlocked.");
    // Draw actual cheat/tweak controls here.
    ImGui::End();
}
