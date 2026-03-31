#import <UIKit/UIKit.h>
#import <Metal/Metal.h>
#import <MetalKit/MetalKit.h>
#import <Foundation/Foundation.h>
#import <signal.h>
#import <execinfo.h>
#import <fcntl.h>
#import <errno.h>
#include <unistd.h>
#include <string.h>
#import "Hooks/CaptainHook.h"
#import "UI/ViewControllerHelper.h"
#import "UI/AOVLicenseGateManager.h"
#import "UI/ImGuiDrawView.h"
#import "Vendor/ImGui/imgui.h"
#import "Vendor/ImGui/imgui_impl_metal.h"
#import "Vendor/ImGui/zzz.h"
#import "Core/MonoString.h"
#include "Hooks/DobbyHook.h"
#include "GameLogic/BinaryPatcher.h"
#include "Core/Obfuscate.h"
#include "Hooks/HookEntry.h"
#include <cmath>
#include <unordered_map>
#include <dispatch/dispatch.h>
#include <mutex>
#include <exception>
#include <cstdlib>
#include <atomic>
#include "GameLogic/AnortPatch.h"
#include "GameLogic/PatchEngine.h"

// Debug crash menu: trong Makefile thêm $(TWEAK_NAME)_CCFLAGS += -DAOVPRO_DISABLE_ESP_HOOK=1 (chỉ resolve, không HOOK ESP).
#ifndef AOVPRO_DISABLE_ESP_HOOK
#define AOVPRO_DISABLE_ESP_HOOK 0
#endif

// Tùy chọn: độ trễ (giây) trước khi resolve+hook ESP trên serial queue — giảm trùng timing với frame mở menu.
#ifndef AOVPRO_ESP_HOOK_DELAY_SEC
#define AOVPRO_ESP_HOOK_DELAY_SEC 2.5
#endif

static std::once_flag g_espHooksOnce;

bool  espEnabled       = false;
bool  espInitialized   = false;
bool  espReady         = false;
float espLineThickness = 1.0f;
ImU32 espLineColor     = IM_COL32(255, 255, 255, 255);
float screenWidth      = 0;
float screenHeight     = 0;
int   debugFrameCount  = 0;

bool  camXa   = false;
bool  lockCam = false;
bool  cam3nac = false;
float cameras = 0.6f;

bool  hackMap          = false;
bool  aimEnabled       = false;
std::atomic<bool> aimSkill1{false};
std::atomic<bool> aimSkill2{false};
std::atomic<bool> aimSkill3{false};
bool  drawAimLine      = false;
int   aimType          = 0;
float aimDistance       = 60.0f;
float aimSmooth        = 1.0f;
int   skillSlot        = 0;
EntityInfo enemyTarget = {};

bool  autoPhuTro       = false;
bool  autoBocPha       = false;
bool  autoTrungTri     = false;
bool  ttBua            = false;
bool  ttBosst          = false;
bool  ttAll            = false;
float ttBossHP         = 1500.f;
float ttBuffHP         = 0.f;
float enemyHPThreshold = 50.0f;
float myHPThreshold    = 50.0f;

AutoCastEngine g_autoCast = {};
HeroProfile    g_activeProfile = {};
std::unordered_map<int, HeroProfile> g_heroProfiles;
std::mutex g_profileMutex;

int heroSet    = 0;
int resetSkill = -1;
static int menuTab = 0;

static bool isSkinHooked        = false;
static bool skinHookInstalling  = false;
static bool profileHookInstalling = false;
static dispatch_queue_t g_hookQueue = nil;

static dispatch_queue_t GetHookQueue() {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        g_hookQueue = dispatch_queue_create("com.aovpro.hookqueue", DISPATCH_QUEUE_SERIAL);
    });
    return g_hookQueue;
}

// --- GAMING HUD PRO PALETTE ---
#define HUD_ACCENT       IM_COL32(88, 133, 255, 255)
#define HUD_ACCENT_DIM   IM_COL32(88, 133, 255, 40)
#define HUD_ACCENT_GLOW  IM_COL32(88, 133, 255, 15)
#define HUD_SUCCESS      IM_COL32(67, 181, 129, 255)
#define HUD_WARNING      IM_COL32(250, 166, 26, 255)
#define HUD_DANGER       IM_COL32(237, 66, 69, 255)
#define HUD_BG           IM_COL32(18, 18, 24, 250)
#define HUD_BG_RAISED    IM_COL32(26, 26, 35, 245)
#define HUD_BG_HOVER     IM_COL32(32, 32, 42, 250)
#define HUD_SURFACE      IM_COL32(22, 22, 30, 240)
#define HUD_FRAME        IM_COL32(35, 35, 48, 240)
#define HUD_FRAME_HOV    IM_COL32(42, 42, 55, 250)
#define HUD_FRAME_ACT    IM_COL32(88, 133, 255, 40)
#define HUD_TEXT         IM_COL32(235, 235, 245, 255)
#define HUD_TEXT_SEC     IM_COL32(148, 148, 168, 255)
#define HUD_TEXT_DIM     IM_COL32(85, 85, 105, 255)
#define HUD_BORDER       IM_COL32(48, 48, 65, 120)
#define HUD_DIVIDER      IM_COL32(48, 48, 65, 80)
#define HUD_TAB_BG       IM_COL32(20, 20, 28, 255)

static constexpr float kPI = 3.14159265f;
static float g_time = 0.f;
static struct {
    float s1_2, s1_5, s1_8, s2_0, s2_5, s3_0, s4_0, s5_0;
    void update(float t) {
        s1_2 = sinf(t * 1.2f); s1_5 = sinf(t * 1.5f);
        s1_8 = sinf(t * 1.8f); s2_0 = sinf(t * 2.0f);
        s2_5 = sinf(t * 2.5f); s3_0 = sinf(t * 3.0f);
        s4_0 = sinf(t * 4.0f); s5_0 = sinf(t * 5.0f);
    }
} g_pulse;

static ImVec4 CV(ImU32 c) {
    return ImVec4(((c)&0xFF)/255.f, ((c>>8)&0xFF)/255.f, ((c>>16)&0xFF)/255.f, ((c>>24)&0xFF)/255.f);
}

static ImU32 LerpColor(ImU32 a, ImU32 b, float t) {
    int ra = (a)&0xFF, ga = (a>>8)&0xFF, ba = (a>>16)&0xFF, aa = (a>>24)&0xFF;
    int rb = (b)&0xFF, gb = (b>>8)&0xFF, bb = (b>>16)&0xFF, ab = (b>>24)&0xFF;
    return IM_COL32(
        ra + (int)((rb-ra)*t), ga + (int)((gb-ga)*t),
        ba + (int)((bb-ba)*t), aa + (int)((ab-aa)*t));
}

static float SmoothLerp(float cur, float target, float speed) {
    float diff = target - cur;
    if (fabsf(diff) < 0.001f) return target;
    return cur + diff * fminf(speed * ImGui::GetIO().DeltaTime, 1.f);
}

static void DrawHUDBorder(ImDrawList* dl, ImVec2 tl, ImVec2 br) {
    dl->AddRect(tl, br, HUD_BORDER, 6.f, 0, 1.f);
    float L = 16.f;
    dl->AddLine(tl, ImVec2(tl.x + L, tl.y), HUD_ACCENT, 2.f);
    dl->AddLine(tl, ImVec2(tl.x, tl.y + L), HUD_ACCENT, 2.f);
}

static void DrawNeonSep(ImDrawList* dl, float x1, float x2, float y) {
    if (x2 - x1 < 1.f) return;
    dl->AddLine(ImVec2(x1, y), ImVec2(x2, y), HUD_DIVIDER, 1.f);
}

static void DrawSectionLabel(ImDrawList* dl, const char* txt, float x, float y, float w) {
    dl->AddRectFilled(ImVec2(x, y + 2), ImVec2(x + 3, y + 12), HUD_ACCENT, 1.f);
    dl->AddText(ImVec2(x + 10, y), HUD_TEXT, txt);
    float tw = ImGui::CalcTextSize(txt).x;
    DrawNeonSep(dl, x + tw + 18, x + w, y + 7);
}

static std::unordered_map<ImGuiID, float> g_toggleAnim;

static bool CyberToggle(const char* label, bool* v) {
    ImDrawList* dl = ImGui::GetWindowDrawList();
    ImGuiID id = ImGui::GetID(label);

    float W = 32.f, H = 16.f;
    ImVec2 p = ImGui::GetCursorScreenPos();

    ImGui::InvisibleButton(label, ImVec2(W, H + 2));
    bool clicked = ImGui::IsItemClicked(0);
    if (clicked) *v = !(*v);
    bool on = *v;
    bool hov = ImGui::IsItemHovered();

    float& anim = g_toggleAnim[id];
    anim = SmoothLerp(anim, on ? 1.f : 0.f, 12.f);

    float r = H * 0.5f;
    float bgY = p.y + 1.f;
    ImVec2 bgMin(p.x, bgY);
    ImVec2 bgMax(p.x + W, bgY + H);

    ImU32 bgOff = IM_COL32(30, 30, 40, 200);
    ImU32 bgOn  = HUD_ACCENT_DIM;
    ImU32 bgCol = LerpColor(bgOff, bgOn, anim);
    dl->AddRectFilled(bgMin, bgMax, bgCol, r);

    ImU32 borderOff = IM_COL32(55, 55, 70, 150);
    ImU32 borderOn  = HUD_ACCENT;
    ImU32 borderCol = LerpColor(borderOff, borderOn, anim);
    dl->AddRect(bgMin, bgMax, borderCol, r, 0, 1.2f);

    float knobX = p.x + r + anim * (W - H);
    float knobY = bgY + r;
    float knobR = r - 2.5f;

    ImU32 knobOff = IM_COL32(100, 100, 120, 255);
    ImU32 knobOn  = HUD_ACCENT;
    dl->AddCircleFilled(ImVec2(knobX, knobY), knobR, LerpColor(knobOff, knobOn, anim));

    if (hov) {
        dl->AddCircle(ImVec2(knobX, knobY), knobR + 1.5f, IM_COL32(88,133,255,30), 0, 1.f);
    }

    ImGui::SameLine(0, 8);
    ImU32 txtOff = HUD_TEXT_SEC;
    ImU32 txtOn  = HUD_TEXT;
    ImGui::TextColored(CV(LerpColor(txtOff, txtOn, anim)), "%s", label);

    return clicked;
}

static std::unordered_map<ImGuiID, float> g_sliderAnim;

static bool CyberSlider(const char* label, float* v, float vMin, float vMax, const char* fmt = "%.1f") {
    ImDrawList* dl = ImGui::GetWindowDrawList();
    ImGuiID id = ImGui::GetID(label);

    float availW = ImGui::GetContentRegionAvail().x;
    float labelW = ImGui::CalcTextSize(label).x;
    float sliderW = availW - labelW - 55;
    if (sliderW < 60.f) sliderW = 60.f;
    float h = 18.f;

    ImGui::TextColored(CV(HUD_TEXT_DIM), "%s", label);
    ImGui::SameLine();

    ImVec2 p = ImGui::GetCursorScreenPos();
    char sid[64];
    snprintf(sid, sizeof(sid), "##cs_%s", label);
    ImGui::InvisibleButton(sid, ImVec2(sliderW, h));

    bool active = ImGui::IsItemActive();
    bool hov = ImGui::IsItemHovered();

    if (active) {
        float t = (ImGui::GetIO().MousePos.x - p.x) / sliderW;
        if (t < 0.f) t = 0.f; if (t > 1.f) t = 1.f;
        *v = vMin + t * (vMax - vMin);
    }

    float range = vMax - vMin;
    float tgt = (fabsf(range) > 1e-8f) ? ((*v - vMin) / range) : 0.f;
    if (tgt < 0.f) tgt = 0.f; if (tgt > 1.f) tgt = 1.f;

    float& animT = g_sliderAnim[id];
    animT = SmoothLerp(animT, tgt, active ? 25.f : 10.f);

    float grabX = p.x + animT * sliderW;
    float midY = p.y + h * 0.5f;
    float trackH = 3.f;

    dl->AddRectFilled(
        ImVec2(p.x, midY - trackH * 0.5f),
        ImVec2(p.x + sliderW, midY + trackH * 0.5f),
        HUD_FRAME, trackH);

    if (grabX > p.x + 1) {
        dl->AddRectFilled(
            ImVec2(p.x, midY - trackH * 0.5f),
            ImVec2(grabX, midY + trackH * 0.5f),
            HUD_ACCENT, trackH);
    }

    float knobR = active ? 6.f : (hov ? 5.5f : 4.5f);
    dl->AddCircleFilled(ImVec2(grabX, midY), knobR, IM_COL32(235,235,245,255));
    dl->AddCircle(ImVec2(grabX, midY), knobR, HUD_ACCENT, 0, 1.5f);

    ImGui::SameLine(0, 8);
    char buf[32];
    snprintf(buf, sizeof(buf), fmt, *v);
    ImGui::TextColored(CV(active ? HUD_ACCENT : HUD_TEXT_DIM), "%s", buf);

    return active;
}

static void PushHUDStyle() {
    ImGuiStyle& s = ImGui::GetStyle();
    s.WindowRounding    = 6.f;
    s.ChildRounding     = 4.f;
    s.FrameRounding     = 4.f;
    s.GrabRounding      = 12.f;
    s.TabRounding       = 3.f;
    s.ScrollbarRounding = 10.f;
    s.WindowBorderSize  = 0.f;
    s.ChildBorderSize   = 0.f;
    s.FrameBorderSize   = 0.f;
    s.TabBorderSize     = 0.f;
    s.WindowPadding     = ImVec2(10, 10);
    s.FramePadding      = ImVec2(8, 5);
    s.ItemSpacing       = ImVec2(8, 5);
    s.ItemInnerSpacing  = ImVec2(6, 4);
    s.GrabMinSize       = 14.f;
    s.ScrollbarSize     = 24.f;

    s.Colors[ImGuiCol_WindowBg]             = CV(HUD_BG);
    s.Colors[ImGuiCol_ChildBg]              = CV(HUD_SURFACE);
    s.Colors[ImGuiCol_PopupBg]              = CV(IM_COL32(20,20,28,250));
    s.Colors[ImGuiCol_Border]               = CV(HUD_BORDER);
    s.Colors[ImGuiCol_BorderShadow]         = CV(IM_COL32(0,0,0,0));
    s.Colors[ImGuiCol_Text]                 = CV(HUD_TEXT);
    s.Colors[ImGuiCol_TextDisabled]         = CV(HUD_TEXT_DIM);
    s.Colors[ImGuiCol_FrameBg]              = CV(HUD_FRAME);
    s.Colors[ImGuiCol_FrameBgHovered]       = CV(HUD_FRAME_HOV);
    s.Colors[ImGuiCol_FrameBgActive]        = CV(HUD_FRAME_ACT);
    s.Colors[ImGuiCol_TitleBg]              = CV(IM_COL32(18,18,24,252));
    s.Colors[ImGuiCol_TitleBgActive]        = CV(IM_COL32(22,22,30,252));
    s.Colors[ImGuiCol_TitleBgCollapsed]     = CV(IM_COL32(18,18,24,200));
    s.Colors[ImGuiCol_Tab]                  = CV(HUD_TAB_BG);
    s.Colors[ImGuiCol_TabHovered]           = CV(HUD_BG_HOVER);
    s.Colors[ImGuiCol_TabActive]            = CV(HUD_ACCENT_GLOW);
    s.Colors[ImGuiCol_TabUnfocused]         = CV(HUD_TAB_BG);
    s.Colors[ImGuiCol_TabUnfocusedActive]   = CV(HUD_ACCENT_GLOW);
    s.Colors[ImGuiCol_CheckMark]            = CV(HUD_ACCENT);
    s.Colors[ImGuiCol_SliderGrab]           = CV(HUD_ACCENT);
    s.Colors[ImGuiCol_SliderGrabActive]     = CV(IM_COL32(110,155,255,255));
    s.Colors[ImGuiCol_Button]               = CV(IM_COL32(28,28,38,230));
    s.Colors[ImGuiCol_ButtonHovered]        = CV(IM_COL32(88,133,255,30));
    s.Colors[ImGuiCol_ButtonActive]         = CV(IM_COL32(88,133,255,55));
    s.Colors[ImGuiCol_Header]               = CV(IM_COL32(88,133,255,18));
    s.Colors[ImGuiCol_HeaderHovered]        = CV(IM_COL32(88,133,255,30));
    s.Colors[ImGuiCol_HeaderActive]         = CV(IM_COL32(88,133,255,45));
    s.Colors[ImGuiCol_Separator]            = CV(HUD_DIVIDER);
    s.Colors[ImGuiCol_SeparatorHovered]     = CV(HUD_ACCENT_DIM);
    s.Colors[ImGuiCol_SeparatorActive]      = CV(HUD_ACCENT);
    s.Colors[ImGuiCol_ScrollbarBg]          = CV(IM_COL32(18,18,24,80));
    s.Colors[ImGuiCol_ScrollbarGrab]        = CV(IM_COL32(88,133,255,35));
    s.Colors[ImGuiCol_ScrollbarGrabHovered] = CV(IM_COL32(88,133,255,65));
    s.Colors[ImGuiCol_ScrollbarGrabActive]  = CV(HUD_ACCENT);
}

void LazyInstallSkinHooks();

static bool showHistory = false;
static bool isProfileHooked = false;
static uint64_t CPlayerProfile_IsHostProfile = 0;
static bool (*OrigIsHostProfile)(void*) = nullptr;
static bool _IsHostProfile(void* instance) {
    if (showHistory) return true;
    return OrigIsHostProfile ? OrigIsHostProfile(instance) : false;
}

// Mặc định đóng: overlay không chặn gesture mở menu (3 ngón x2) trên view cha.
static bool g_menuOpen = false;


static void DrawTabIcon(ImDrawList* dl, int idx, float cx, float cy, ImU32 col, float thick) {
    float s = 6.f;
    switch (idx) {
    case 0: {
        dl->AddCircle(ImVec2(cx, cy), s * 0.6f, col, 0, thick);
        for (int i = 0; i < 6; i++) {
            float a = (float)i * kPI / 3.f;
            float ix = cx + cosf(a) * (s * 0.75f);
            float iy = cy + sinf(a) * (s * 0.75f);
            float ox = cx + cosf(a) * (s + 1.f);
            float oy = cy + sinf(a) * (s + 1.f);
            dl->AddLine(ImVec2(ix, iy), ImVec2(ox, oy), col, thick + 0.3f);
        }
        break;
    }
    case 1: {
        float ew = s * 1.4f, eh = s * 0.7f;
        ImVec2 pts[5] = {
            {cx - ew, cy}, {cx - ew * 0.5f, cy - eh}, {cx, cy - eh * 1.1f},
            {cx + ew * 0.5f, cy - eh}, {cx + ew, cy}
        };
        ImVec2 pts2[5] = {
            {cx - ew, cy}, {cx - ew * 0.5f, cy + eh}, {cx, cy + eh * 1.1f},
            {cx + ew * 0.5f, cy + eh}, {cx + ew, cy}
        };
        dl->AddPolyline(pts, 5, col, false, thick);
        dl->AddPolyline(pts2, 5, col, false, thick);
        dl->AddCircleFilled(ImVec2(cx, cy), s * 0.35f, col);
        break;
    }
    case 2: {
        float bw = s, bh = s * 0.8f;
        dl->AddLine(ImVec2(cx - bw, cy - bh * 0.5f), ImVec2(cx - bw * 0.2f, cy), col, thick);
        dl->AddLine(ImVec2(cx - bw * 0.2f, cy), ImVec2(cx - bw, cy + bh * 0.5f), col, thick);
        dl->AddLine(ImVec2(cx + bw * 0.1f, cy + bh * 0.5f), ImVec2(cx + bw, cy + bh * 0.5f), col, thick);
        break;
    }
    }
}

static float g_powerHoverAnim = 0.f;

static void DrawPowerButton(ImDrawList* dl, ImVec2 pos, float sz, bool hov) {
    g_powerHoverAnim = SmoothLerp(g_powerHoverAnim, hov ? 1.f : 0.f, 10.f);
    float ha = g_powerHoverAnim;
    float cx = pos.x + sz * 0.5f;
    float cy = pos.y + sz * 0.5f;
    float r = sz * 0.32f;

    if (ha > 0.01f) {
        dl->AddCircleFilled(ImVec2(cx, cy), r + 5.f, IM_COL32(237,66,69,(int)(18*ha)), 16);
    }

    ImU32 col = LerpColor(HUD_TEXT_DIM, HUD_DANGER, ha);
    float thick = 1.8f;
    float gap = 0.45f;
    float startA = -kPI * 0.5f + gap;
    float endA = -kPI * 0.5f + 2.f * kPI - gap;
    constexpr int seg = 16;
    for (int i = 0; i < seg; i++) {
        float a1 = startA + (endA - startA) * (float)i / (float)seg;
        float a2 = startA + (endA - startA) * (float)(i + 1) / (float)seg;
        dl->AddLine(ImVec2(cx + cosf(a1) * r, cy + sinf(a1) * r),
                    ImVec2(cx + cosf(a2) * r, cy + sinf(a2) * r), col, thick);
    }
    float stemLen = r * 0.6f;
    dl->AddLine(ImVec2(cx, cy - r + 1.f), ImVec2(cx, cy - r + stemLen + 1.f), col, thick + 0.4f);
}

static const char* tabNames[] = { "  Main", "  Visual", "  Patch" };
static const int   tabCount   = 3;
static const float tabBtnW    = 82.f;
static const float tabBtnH    = 30.f;

static void DrawStatusBadge(ImDrawList* dl, ImVec2 pos, const char* text, ImU32 color) {
    ImVec2 sz = ImGui::CalcTextSize(text);
    float pad = 6.f;
    dl->AddRectFilled(
        pos, ImVec2(pos.x + sz.x + pad * 2, pos.y + sz.y + pad),
        IM_COL32((color)&0xFF, (color>>8)&0xFF, (color>>16)&0xFF, 25), 4.f);
    dl->AddText(ImVec2(pos.x + pad, pos.y + pad * 0.5f), color, text);
}

static void DrawHUDHeader(ImDrawList* dl, ImVec2 wPos, ImVec2 wEnd) {
    float headerH = 28.f;
    dl->AddRectFilled(wPos, ImVec2(wEnd.x, wPos.y + headerH),
        HUD_BG_RAISED, 6.f, ImDrawFlags_RoundCornersTop);
    dl->AddLine(ImVec2(wPos.x, wPos.y + headerH),
                ImVec2(wEnd.x, wPos.y + headerH), HUD_DIVIDER, 1.f);
    float dotX = wPos.x + 14.f, dotY = wPos.y + headerH * 0.5f;
    dl->AddCircleFilled(ImVec2(dotX, dotY), 3.5f, HUD_SUCCESS);
    dl->AddText(ImVec2(dotX + 10, dotY - 6), HUD_TEXT, "AOV PRO");
    float vx = wEnd.x - 52;
    dl->AddRectFilled(ImVec2(vx, dotY - 7), ImVec2(vx + 40, dotY + 7),
        HUD_ACCENT_DIM, 8.f);
    dl->AddText(ImVec2(vx + 6, dotY - 5), HUD_ACCENT, "v2.0");
}

struct UISnapshot {
    size_t ids; size_t lr; int camp; int heroConfigID; void* lActorRoot;
};
static UISnapshot g_uiSnap = {};

void DrawESPSettings() {
    {
        std::lock_guard<std::mutex> lock(cacheMutex);
        g_uiSnap.ids = enemyObjIDs.size();
        g_uiSnap.lr = enemyLActorRoots.size();
        g_uiSnap.camp = myCamp;
        g_uiSnap.heroConfigID = myHeroConfigID;
        g_uiSnap.lActorRoot = myLActorRoot;
    }

    ImDrawList* dl = ImGui::GetWindowDrawList();
    ImVec2 wPos = ImGui::GetWindowPos();
    ImVec2 wSize = ImGui::GetWindowSize();
    ImVec2 wEnd(wPos.x + wSize.x, wPos.y + wSize.y);

    DrawHUDHeader(dl, wPos, wEnd);
    DrawHUDBorder(dl, wPos, wEnd);

    {
        float titleH = ImGui::GetFrameHeight() + ImGui::GetStyle().FramePadding.y * 2.f;
        float closeSz = 20.f;
        float closeX = wEnd.x - closeSz - 8.f;
        float closeY = wPos.y + (titleH - closeSz) * 0.5f - 3.f;
        ImVec2 closeMin(closeX, closeY);
        ImVec2 closeMax(closeX + closeSz, closeY + closeSz);

        ImDrawList* fg = ImGui::GetForegroundDrawList();
        bool hov = ImGui::IsMouseHoveringRect(closeMin, closeMax, false);
        bool clicked = hov && ImGui::IsMouseClicked(0);
        if (clicked) {
            g_menuOpen = false;
        }
        DrawPowerButton(fg, closeMin, closeSz, hov);
    }

    static float tabActiveAnim[3] = {};

    ImGui::BeginChild("##TabCol", ImVec2(tabBtnW + 8, 0), false, ImGuiWindowFlags_NoScrollbar);
    for (int i = 0; i < tabCount; i++) {
        bool active = (menuTab == i);
        tabActiveAnim[i] = SmoothLerp(tabActiveAnim[i], active ? 1.f : 0.f, 10.f);
        float a = tabActiveAnim[i];

        ImU32 btnBg = LerpColor(IM_COL32(20,20,28,255), HUD_BG_RAISED, a);
        ImGui::PushStyleColor(ImGuiCol_Button, CV(btnBg));
        ImGui::PushStyleColor(ImGuiCol_ButtonHovered, CV(HUD_BG_HOVER));
        ImGui::PushStyleColor(ImGuiCol_ButtonActive, CV(IM_COL32(88,133,255,30)));

        if (ImGui::Button(tabNames[i], ImVec2(tabBtnW, tabBtnH))) {
            menuTab = i;
        }
        ImGui::PopStyleColor(3);

        ImVec2 bMin = ImGui::GetItemRectMin();
        ImVec2 bMax = ImGui::GetItemRectMax();
        float iconX = bMin.x + 11.f;
        float iconY = (bMin.y + bMax.y) * 0.5f;
        ImU32 iconCol = LerpColor(HUD_TEXT_DIM, HUD_ACCENT, a);
        float iconThick = 1.2f + 0.4f * a;
        DrawTabIcon(dl, i, iconX, iconY, iconCol, iconThick);

        if (a > 0.01f) {
            int barA = (int)(255 * a);
            dl->AddRectFilled(
                ImVec2(bMin.x, bMin.y + 4), ImVec2(bMin.x + 3.f, bMax.y - 4),
                IM_COL32(88,133,255,barA), 1.f);
        }
        ImGui::Spacing();
    }
    ImGui::EndChild();

    ImGui::SameLine();

    {
        ImVec2 sepTop = ImGui::GetCursorScreenPos();
        float sepH = ImGui::GetContentRegionAvail().y;
        dl->AddLine(sepTop, ImVec2(sepTop.x, sepTop.y + sepH), HUD_DIVIDER, 1.f);
        ImGui::Dummy(ImVec2(4, 0));
        ImGui::SameLine();
    }

    ImGui::PushStyleVar(ImGuiStyleVar_ScrollbarSize, 24.f);
    ImGui::PushStyleColor(ImGuiCol_ScrollbarBg, CV(IM_COL32(4,4,8,60)));
    ImGui::PushStyleColor(ImGuiCol_ScrollbarGrab, CV(IM_COL32(88,133,255,45)));
    ImGui::PushStyleColor(ImGuiCol_ScrollbarGrabHovered, CV(IM_COL32(88,133,255,80)));
    ImGui::PushStyleColor(ImGuiCol_ScrollbarGrabActive, CV(HUD_ACCENT));

    ImGui::BeginChild("##Panel", ImVec2(0, 0), false);
    {
        ImDrawList* pdl = ImGui::GetWindowDrawList();
        float cw = ImGui::GetContentRegionAvail().x;
        float cx = ImGui::GetCursorScreenPos().x;

        if (menuTab == 0) {
            float sy1 = ImGui::GetCursorScreenPos().y;
            DrawSectionLabel(pdl, "HACK MAP", cx, sy1 - 2, cw);
            ImGui::Dummy(ImVec2(0, 16));
            CyberToggle("Hack Map", &hackMap);

            ImGui::Spacing();
            float s2 = ImGui::GetCursorScreenPos().y;
            DrawNeonSep(pdl, cx, cx + cw, s2);
            ImGui::Dummy(ImVec2(0, 4));

            float sy3 = ImGui::GetCursorScreenPos().y;
            DrawSectionLabel(pdl, "CAMERA", cx, sy3 - 2, cw);
            ImGui::Dummy(ImVec2(0, 16));
            CyberToggle("On Camera", &camXa);
            if (camXa) {
                CyberSlider("Height", &cameras, 0.f, 10.f, "%.1f");
            }

            ImGui::Spacing();
            float s4 = ImGui::GetCursorScreenPos().y;
            DrawNeonSep(pdl, cx, cx + cw, s4);
            ImGui::Dummy(ImVec2(0, 4));

            float sy5 = ImGui::GetCursorScreenPos().y;
            DrawSectionLabel(pdl, "UNLOCK SKIN", cx, sy5 - 2, cw);
            ImGui::Dummy(ImVec2(0, 16));
            if (skinHookInstalling) {
                ImGui::TextColored(CV(HUD_ACCENT), "  Installing hooks...");
            }
            {
                bool ulVal = unlockSkin.load();
                if (CyberToggle("Unlock Skin", &ulVal)) {
                    unlockSkin.store(ulVal);
                    if (ulVal && !isSkinHooked && !skinHookInstalling) {
                        skinHookInstalling = true;
                        dispatch_async(GetHookQueue(), ^{
                            Skin_ResolveOffsets();
                            LazyInstallSkinHooks();
                            skinHookInstalling = false;
                        });
                    }
                }
            }
            if (isSkinHooked) {
                ImGui::TextColored(CV(HUD_SUCCESS), "  [OK] Skin hooks active");
            } else if (!skinHookInstalling) {
                ImGui::TextColored(CV(HUD_DANGER), "  [!] Skin hooks not installed");
            }

            ImGui::Spacing();
            float s6 = ImGui::GetCursorScreenPos().y;
            DrawNeonSep(pdl, cx, cx + cw, s6);
            ImGui::Dummy(ImVec2(0, 4));

            float sy7 = ImGui::GetCursorScreenPos().y;
            DrawSectionLabel(pdl, "PROFILE", cx, sy7 - 2, cw);
            ImGui::Dummy(ImVec2(0, 16));
            if (profileHookInstalling) {
                ImGui::TextColored(CV(HUD_ACCENT), "  Installing hooks...");
            }
            if (CyberToggle("Show History", &showHistory)) {
                if (showHistory && !isProfileHooked && !profileHookInstalling) {
                    profileHookInstalling = true;
                    dispatch_async(GetHookQueue(), ^{
                        CPlayerProfile_IsHostProfile = Il2CppUtils::GetMethodOffset(
                            "Project_d.dll", "Assets.Scripts.GameSystem",
                            "CPlayerProfile", "get_IsHostProfile", 0);
                        if (CPlayerProfile_IsHostProfile) {
                            HOOK(CPlayerProfile_IsHostProfile, _IsHostProfile, OrigIsHostProfile);
                        }
                        isProfileHooked = true;
                        profileHookInstalling = false;
                    });
                }
            }
            if (showHistory && isProfileHooked) {
                ImGui::TextColored(CV(HUD_SUCCESS), "  [OK] Profile unlocked");
            }

        }

        else if (menuTab == 1) {
            float sy1 = ImGui::GetCursorScreenPos().y;
            DrawSectionLabel(pdl, "ESP", cx, sy1 - 2, cw);
            ImGui::Dummy(ImVec2(0, 16));

            CyberToggle("ESP Line", &espEnabled);
            if (espEnabled) {
                CyberSlider("Thickness", &espLineThickness, 0.5f, 3.0f, "%.1f");
                static float lineColor[4] = {1,1,1,1};
                if (ImGui::ColorEdit4("Line Color", lineColor, ImGuiColorEditFlags_NoInputs)) {
                    espLineColor = IM_COL32((int)(lineColor[0]*255),(int)(lineColor[1]*255),
                                               (int)(lineColor[2]*255),(int)(lineColor[3]*255));
                }
            }
            ImGui::Spacing();
            {
                ImGui::TextColored(CV(HUD_TEXT_DIM), "IDs: %zu | LR: %zu | Camp: %d",
                    g_uiSnap.ids, g_uiSnap.lr, g_uiSnap.camp);
            }
            if (ImGui::Button("Clear Cache", ImVec2(120, 0))) CleanupESP();

            ImGui::Spacing();
            float s2 = ImGui::GetCursorScreenPos().y;
            DrawNeonSep(pdl, cx, cx + cw, s2);
            ImGui::Dummy(ImVec2(0, 4));

            float sy3 = ImGui::GetCursorScreenPos().y;
            DrawSectionLabel(pdl, "AIMBOT / AUTO SKILL", cx, sy3 - 2, cw);
            ImGui::Dummy(ImVec2(0, 16));

            CyberToggle("Enable Aimbot", &aimEnabled);
            if (aimEnabled) {
                CyberToggle("Draw Aim Line", &drawAimLine);

                const char* aimTypes[] = {"Lowest HP", "% HP", "Closest Dist", "Closest Crosshair"};
                ImGui::Combo("Aim Type", &aimType, aimTypes, IM_ARRAYSIZE(aimTypes));

                const char* heroes[] = {"Custom","Elsu","Gildur","Grakk","Slimz","Yue",
                                        "Natalya","Enzo","Stuart","Florentino","Volkath","Raz"};
                if (ImGui::Combo("Hero Config", &heroSet, heroes, IM_ARRAYSIZE(heroes))) {
                    ApplyHeroConfig();
                }

                CyberSlider("Distance", &aimDistance, 0.f, 150.f, "%.0f");
                CyberSlider("Smooth", &aimSmooth, 0.f, 5.f, "%.2f");

                ImGui::Spacing();
                float sy = ImGui::GetCursorScreenPos().y;
                DrawNeonSep(pdl, cx, cx + cw, sy);
                ImGui::Dummy(ImVec2(0, 6));

                ImGui::TextColored(CV(HUD_TEXT_DIM), "Skill Activation:");
                { bool s1 = aimSkill1.load(), s2 = aimSkill2.load(), s3 = aimSkill3.load();
                if (CyberToggle("Skill 1", &s1)) aimSkill1.store(s1); ImGui::SameLine();
                if (CyberToggle("Skill 2", &s2)) aimSkill2.store(s2); ImGui::SameLine();
                if (CyberToggle("Skill 3", &s3)) aimSkill3.store(s3); }
            }

            {
                int uiHeroID = g_uiSnap.heroConfigID;
                if (uiHeroID > 0) {
                    ImGui::Spacing();
                    const char* heroName = GetHeroName(uiHeroID);
                    if (heroName) {
                        ImGui::TextColored(CV(HUD_ACCENT), "Hero: %s (ID: %d)", heroName, uiHeroID);
                    } else {
                        ImGui::TextColored(CV(HUD_ACCENT), "Hero: Unknown (ID: %d)", uiHeroID);
                    }
                }
            }

            ImGui::Spacing();
            {
                float p = 0.6f + 0.4f * g_pulse.s1_2;
                ImGui::TextColored(CV(HUD_TEXT_SEC), "// AIMBOT VIP MODULE");
            }

            ImGui::Spacing();
            float s5 = ImGui::GetCursorScreenPos().y;
            DrawNeonSep(pdl, cx, cx + cw, s5);
            ImGui::Dummy(ImVec2(0, 4));

            float sy6 = ImGui::GetCursorScreenPos().y;
            DrawSectionLabel(pdl, "AUTO SKILL", cx, sy6 - 2, cw);
            ImGui::Dummy(ImVec2(0, 16));

            CyberToggle("Auto Frost", &autoPhuTro);
            if (autoPhuTro) {
                CyberSlider("My HP %", &myHPThreshold, 0.f, 100.f, "%.0f");
            }
            CyberToggle("Execute", &autoBocPha);
            if (autoBocPha) {
                CyberSlider("E.HP %", &enemyHPThreshold, 0.f, 50.f, "%.0f");
            }
            CyberToggle("Punish", &autoTrungTri);
            if (autoTrungTri) {
                bool prevBuff = ttBua, prevBoss = ttBosst, prevAll = ttAll;
                CyberToggle("Buff", &ttBua); ImGui::SameLine();
                CyberToggle("Boss", &ttBosst); ImGui::SameLine();
                CyberToggle("All", &ttAll);
                if (ttAll && !prevAll) { ttBua = false; ttBosst = false; }
                if ((ttBua && !prevBuff) || (ttBosst && !prevBoss)) { ttAll = false; }

                if (ttBua || ttAll) {
                    CyberSlider("Buff HP", &ttBuffHP, 0.f, 3000.f, "%.0f");
                    if (ttBuffHP == 0.f) {
                        ImGui::SameLine(); ImGui::TextColored(ImVec4(0.5f,1.f,0.5f,0.7f), "(auto)");
                    }
                }
                if (ttBosst || ttAll) {
                    CyberSlider("Boss HP", &ttBossHP, 500.f, 5000.f, "%.0f");
                }
            }

            ImGui::Spacing();
            float syAC = ImGui::GetCursorScreenPos().y;
            DrawNeonSep(pdl, cx, cx + cw, syAC);
            ImGui::Dummy(ImVec2(0, 4));

            float syACL = ImGui::GetCursorScreenPos().y;
            DrawSectionLabel(pdl, "AUTO CAST", cx, syACL - 2, cw);
            ImGui::Dummy(ImVec2(0, 16));

            CyberToggle("Auto Cast", &g_autoCast.enabled);

            if (g_autoCast.enabled) {
                HeroProfile& prof = g_activeProfile;

                ImGui::Spacing();
                CyberToggle("Auto-Detect Hero", &g_autoCast.autoDetect);
                if (g_autoCast.autoDetect) {
                    ImGui::TextColored(CV(HUD_TEXT_DIM), "  Tu dong nhan dien hero & apply profile");
                }

                ImGui::Spacing();
                int acHeroID = g_uiSnap.heroConfigID;
                void* acLR = g_uiSnap.lActorRoot;

                if (acHeroID > 0) {
                    ImGui::TextColored(CV(HUD_SUCCESS),
                        "%s (ID:%d) [%s]", prof.name, acHeroID, GetRoleName(prof.role));
                } else {
                    float pulse = 0.5f + 0.5f * g_pulse.s2_0;
                    ImGui::TextColored(CV(IM_COL32(70,70,90,(int)(150+80*pulse))), ">> AWAITING MATCH...");
                }

                ImGui::Spacing();
                ImGui::TextColored(CV(HUD_TEXT_DIM), "Apply Role Template:");
                for (int r = 0; r < ROLE_COUNT; r++) {
                    if (r > 0) ImGui::SameLine();
                    ImGui::PushID(r + 700);
                    bool isActive = (prof.role == r);
                    if (isActive) ImGui::PushStyleColor(ImGuiCol_Button, IM_COL32(67,181,129,80));
                    if (ImGui::SmallButton(GetRoleName(r))) {
                        AC_ApplyTemplateToActive(r);
                        AC_SaveActiveToMap();
                    }
                    if (isActive) ImGui::PopStyleColor();
                    ImGui::PopID();
                }

                ImGui::Spacing();
                float sySep1 = ImGui::GetCursorScreenPos().y;
                DrawNeonSep(pdl, cx, cx + cw, sySep1);
                ImGui::Dummy(ImVec2(0, 4));

                CyberToggle("Loop", &prof.loopCombo);
                ImGui::TextColored(CV(HUD_TEXT_DIM), prof.loopCombo
                    ? "  Loop lai burst khi xong" : "  Burst 1 lan roi dung");

                ImGui::Spacing();
                const char* skillNames[] = {"S1", "S2", "S3", "Ulti"};
                const int skillValues[] = {1, 2, 3, 4};

                ImGui::TextColored(CV(HUD_TEXT_DIM), "Priority Order:");
                ImGui::PushItemWidth(60);
                for (int i = 0; i < prof.comboCount; i++) {
                    ImGui::PushID(i + 200);
                    char label[16];
                    snprintf(label, sizeof(label), "#%d", i + 1);
                    int sel = -1;
                    for (int k = 0; k < 4; k++) {
                        if (prof.comboOrder[i] == skillValues[k]) { sel = k; break; }
                    }
                    if (sel < 0) sel = 0;
                    if (ImGui::Combo(label, &sel, skillNames, 4)) {
                        prof.comboOrder[i] = skillValues[sel];
                    }
                    ImGui::PopID();
                    if (i < prof.comboCount - 1) ImGui::SameLine();
                }
                ImGui::PopItemWidth();

                ImGui::Spacing();
                ImGui::TextColored(CV(HUD_TEXT_DIM), "Skills in burst:");
                ImGui::PushItemWidth(80);
                int cnt = prof.comboCount;
                if (ImGui::SliderInt("##cnt", &cnt, 1, kMaxComboSlots)) {
                    prof.comboCount = cnt;
                }
                ImGui::PopItemWidth();

                ImGui::Spacing();
                ImGui::TextColored(CV(HUD_TEXT_DIM), "Burst Delay (ms):");
                ImGui::PushItemWidth(100);
                ImGui::SliderInt("##burst", &prof.burstDelayMs, 30, 500);
                ImGui::PopItemWidth();

                ImGui::Spacing();
                CyberSlider("Range Override", &prof.rangeOverride, 0.f, 30.f, "%.1f");
                if (prof.rangeOverride < 0.1f) {
                    ImGui::TextColored(CV(HUD_TEXT_DIM), "  0 = dung range tu game");
                }

                ImGui::Spacing();
                CyberSlider("Engage Range", &prof.engageRange, 0.f, 30.f, "%.1f");
                if (prof.engageRange < 0.1f) {
                    ImGui::TextColored(CV(HUD_TEXT_DIM), "  0 = dung range skill dau tien");
                }

                ImGui::Spacing();
                if (ImGui::SmallButton("Save Profile")) {
                    AC_SaveActiveToMap();
                }
                ImGui::SameLine();
                if (ImGui::SmallButton("Reset to Template")) {
                    int heroID = prof.heroConfigID;
                    if (heroID > 0) {
                        g_activeProfile = AC_MakeFromTemplate(heroID);
                        g_heroProfiles[heroID] = g_activeProfile;
                    } else {
                        g_activeProfile = MakeProfile(0, "Custom", {1, 2, 3}, 80, 0, true, 0, ROLE_MAGE);
                    }
                }
                ImGui::SameLine();
                if (ImGui::SmallButton("Delete Profile")) {
                    int heroID = prof.heroConfigID;
                    if (heroID > 0) {
                        g_heroProfiles.erase(heroID);
                        g_activeProfile = AC_MakeFromTemplate(heroID);
                    }
                }

                ImGui::Spacing();
                float syStatus = ImGui::GetCursorScreenPos().y;
                DrawNeonSep(pdl, cx, cx + cw, syStatus);
                ImGui::Dummy(ImVec2(0, 4));

                if (acHeroID > 0) {
                    char comboStr[64];
                    int off = 0;
                    for (int i = 0; i < prof.comboCount && off < (int)sizeof(comboStr) - 8; i++) {
                        int sv = prof.comboOrder[i];
                        const char* sn = sv == 4 ? "Ulti" : (sv == 3 ? "S3" : (sv == 2 ? "S2" : "S1"));
                        off += snprintf(comboStr + off, sizeof(comboStr) - off, "%s%s", i > 0 ? " > " : "", sn);
                    }
                    comboStr[off < (int)sizeof(comboStr) ? off : (int)sizeof(comboStr) - 1] = '\0';
                    ImGui::TextColored(CV(HUD_ACCENT),
                        "Burst: %s %s", comboStr,
                        prof.loopCombo ? "[Loop]" : "[Once]");

                    void* heroCtrl = (acLR && asHero) ? asHero(acLR) : nullptr;
                    if (heroCtrl && getSkillData) {
                        for (int i = 0; i < prof.comboCount; i++) {
                            int s = prof.comboOrder[i];
                            if (s < 1 || s > 4) continue;
                            HeroWrapSkillData sd = getSkillData(heroCtrl, s);
                            float rng = skillRange[s];
                            if (rng <= 0.1f && prof.rangeOverride > 0.1f) rng = prof.rangeOverride;

                            bool ready = sd.skillSlotReady && sd.Skill1SlotCD == 0;
                            ImU32 col = ready ? HUD_SUCCESS : HUD_DANGER;
                            const char* sName = s == 4 ? "Ulti" : (s == 3 ? "S3" : (s == 2 ? "S2" : "S1"));
                            ImGui::TextColored(CV(col),
                                "  %s: %s | Lv%d | R:%.1fm | CD:%d",
                                sName, ready ? "Ready" : "CD...",
                                sd.skillLv, rng, sd.Skill1SlotCD);
                        }
                    }

                    ImGui::Spacing();
                    ImGui::TextColored(CV(HUD_TEXT_DIM), "Profiles saved: %d", (int)g_heroProfiles.size());
                }
            }

        }

        else if (menuTab == 2) {
            float sy1 = ImGui::GetCursorScreenPos().y;
            DrawSectionLabel(pdl, "PATCH", cx, sy1 - 2, cw);
            ImGui::Dummy(ImVec2(0, 16));

            static int cachedPTotal = 0, cachedPOk = 0, cachedPFail = 0;
            static size_t lastPatchLogSz = 0;
            {
                std::lock_guard<std::mutex> lock(patchLogMutex);
                if (patchLogs.size() != lastPatchLogSz) {
                    lastPatchLogSz = patchLogs.size();
                    cachedPTotal = (int)lastPatchLogSz;
                    cachedPOk = cachedPFail = 0;
                    for (const auto& e : patchLogs) {
                        if (e.success) cachedPOk++; else cachedPFail++;
                    }
                }
            }
            int pTotal = cachedPTotal, pOk = cachedPOk, pFail = cachedPFail;

            const char* pStatus = patchesApplied ? "COMPLETE" : (patchesRunning ? "EXECUTING..." : "QUEUED");
            ImU32 pCol;
            if (patchesApplied) {
                pCol = HUD_SUCCESS;
            } else if (patchesRunning) {
                float p = 0.5f + 0.5f * g_pulse.s4_0;
                pCol = HUD_ACCENT;
            } else {
                pCol = HUD_TEXT_DIM;
            }
            ImGui::TextColored(CV(pCol), "Binary Patch: %s", pStatus);
            if (pTotal > 0) {
                ImGui::TextColored(CV(HUD_SUCCESS), "  OK: %d", pOk);
                if (pFail > 0)
                    ImGui::TextColored(CV(HUD_DANGER), "  Failed: %d", pFail);
            }

            ImGui::Spacing();
            float s2p = ImGui::GetCursorScreenPos().y;
            DrawNeonSep(pdl, cx, cx + cw, s2p);
            ImGui::Dummy(ImVec2(0, 6));

            DrawSectionLabel(pdl, "ANORT", cx, ImGui::GetCursorScreenPos().y - 2, cw);
            ImGui::Dummy(ImVec2(0, 16));

            if (anortPatched) {
                ImGui::TextColored(CV(HUD_SUCCESS), "Anort: [OK] PATCHED");
            } else {
                float p = 0.5f + 0.5f * g_pulse.s2_5;
                ImGui::TextColored(CV(IM_COL32(70,70,90,(int)(180+75*p))), "Anort: STANDBY...");
            }

            {
                std::lock_guard<std::mutex> lock(anortLogMutex);
                for (const auto& e : anortLogs) {
                    ImU32 col = e.success ? HUD_SUCCESS : HUD_DANGER;
                    ImGui::TextColored(CV(col), "[%s] %s", e.success ? "OK" : "FAIL", e.name.c_str());
                    if (!e.detail.empty()) {
                        ImGui::TextColored(CV(HUD_TEXT_DIM), "  %s", e.detail.c_str());
                    }
                }
            }
        }
    }
    ImGui::EndChild();
    ImGui::PopStyleColor(4);
    ImGui::PopStyleVar();
}

// Khi menu đóng: hitTest trả nil → touch xuống view bên dưới (gesture trên root vẫn nhận).
@interface PassthroughMTKView : MTKView
@end
@implementation PassthroughMTKView
- (UIView *)hitTest:(CGPoint)point withEvent:(UIEvent *)event {
    if (!g_menuOpen) return nil;
    return [super hitTest:point withEvent:event];
}
@end

#pragma mark - Crash log → Documents/aov_tweak_crash.log
// Lưu ý: Jetsam (OOM), SIGKILL, một số Mach exception có thể không ghi được hoặc không qua signal.

static int g_aovCrashLogFd = -1;
static dispatch_once_t g_aovCrashHandlersOnce;
static BOOL g_aovCrashInstallBannerDone = NO;

static NSString *AOVCrashLogFilePath(void) {
    NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
    NSString *doc = [paths firstObject];
    return [doc stringByAppendingPathComponent:@"aov_tweak_crash.log"];
}

static BOOL AOVTryOpenCrashLogFile(void) {
    if (g_aovCrashLogFd >= 0) return YES;
    NSString *path = AOVCrashLogFilePath();
    if (!path.length) return NO;
    NSString *dir = [path stringByDeletingLastPathComponent];
    [[NSFileManager defaultManager] createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
    g_aovCrashLogFd = open([path UTF8String], O_WRONLY | O_APPEND | O_CREAT, 0644);
    if (g_aovCrashLogFd < 0) {
        NSLog(@"[AOV] aov_tweak_crash.log open failed errno=%d path=%@", errno, path);
        return NO;
    }
    return YES;
}

// Chỉ write/fsync — dùng trong signal handler (async-signal-safe nếu fd đã mở sẵn).
static void AOVWriteCrashUnsafe(const char *s) {
    if (g_aovCrashLogFd < 0 || !s) return;
    size_t n = strlen(s);
    if (n) (void)write(g_aovCrashLogFd, s, n);
}

static std::terminate_handler g_aovPrevTerminate = nullptr;

static void AOVStdTerminateHandler(void) {
    AOVWriteCrashUnsafe("\n======== std::terminate ========\n");
    void *frames[48];
    int n = backtrace(frames, 48);
    if (g_aovCrashLogFd >= 0) {
        backtrace_symbols_fd(frames, n, g_aovCrashLogFd);
        AOVWriteCrashUnsafe("\n");
        (void)fsync(g_aovCrashLogFd);
    }
    if (g_aovPrevTerminate) {
        g_aovPrevTerminate();
    } else {
        std::abort();
    }
}

static void AOVSignalCrashHandler(int sig) {
    const char *name = "UNKNOWN";
    switch (sig) {
        case SIGABRT: name = "SIGABRT"; break;
        case SIGSEGV: name = "SIGSEGV"; break;
        case SIGBUS:  name = "SIGBUS";  break;
        case SIGFPE:  name = "SIGFPE";  break;
        case SIGILL:  name = "SIGILL";  break;
        case SIGPIPE: name = "SIGPIPE"; break;
    }
    if (g_aovCrashLogFd >= 0) {
        AOVWriteCrashUnsafe("\n======== SIGNAL ========\nSignal: ");
        AOVWriteCrashUnsafe(name);
        AOVWriteCrashUnsafe("\nBacktrace:\n");
        void *frames[64];
        int count = backtrace(frames, 64);
        backtrace_symbols_fd(frames, count, g_aovCrashLogFd);
        AOVWriteCrashUnsafe("\n");
        (void)fsync(g_aovCrashLogFd);
    }
    signal(sig, SIG_DFL);
    raise(sig);
}

static void AOVUncaughtNSExceptionHandler(NSException *exception) {
    if (!AOVTryOpenCrashLogFile()) return;
    NSString *msg = [NSString stringWithFormat:
        @"\n======== NSException ========\nName: %@\nReason: %@\nUserInfo: %@\nStack:\n%@\n",
        exception.name,
        exception.reason ?: @"(nil)",
        exception.userInfo ?: @"(nil)",
        [exception.callStackSymbols componentsJoinedByString:@"\n"]];
    const char *u = [msg UTF8String];
    if (u) {
        (void)write(g_aovCrashLogFd, u, strlen(u));
        (void)fsync(g_aovCrashLogFd);
    }
}

static void AOVInstallCrashHandlersOnce(void) {
    dispatch_once(&g_aovCrashHandlersOnce, ^{
        signal(SIGABRT, AOVSignalCrashHandler);
        signal(SIGSEGV, AOVSignalCrashHandler);
        signal(SIGBUS,  AOVSignalCrashHandler);
        signal(SIGFPE,  AOVSignalCrashHandler);
        signal(SIGILL,  AOVSignalCrashHandler);
        signal(SIGPIPE, SIG_IGN);
        NSSetUncaughtExceptionHandler(&AOVUncaughtNSExceptionHandler);
        g_aovPrevTerminate = std::set_terminate(AOVStdTerminateHandler);
    });
}

extern "C" void AOVLogCrashLine(const char *msg) {
    if (!msg) return;
    if (!AOVTryOpenCrashLogFile()) return;
    size_t n = strlen(msg);
    if (n) (void)write(g_aovCrashLogFd, msg, n);
    if (n == 0 || msg[n - 1] != '\n') (void)write(g_aovCrashLogFd, "\n", 1);
    (void)fsync(g_aovCrashLogFd);
}

extern "C" void AOVInstallCrashLogToDocuments(void) {
    if (!AOVTryOpenCrashLogFile()) return;
    AOVInstallCrashHandlersOnce();
    if (!g_aovCrashInstallBannerDone) {
        g_aovCrashInstallBannerDone = YES;
        NSString *path = AOVCrashLogFilePath();
        NSString *line = [NSString stringWithFormat:@"\n===== [%@] crash logger OK → %@ (fd=%d) =====\n",
            [NSDate date], path, g_aovCrashLogFd];
        const char *u = [line UTF8String];
        if (u) {
            (void)write(g_aovCrashLogFd, u, strlen(u));
            (void)fsync(g_aovCrashLogFd);
        }
        NSLog(@"[AOV] crash log file ready: %@", path);
    }
}

__attribute__((constructor))
static void AOVCrashLogDylibConstructor(void) {
    AOVInstallCrashLogToDocuments();
}

@interface ImGuiDrawView () <MTKViewDelegate>
@property (nonatomic, strong) id <MTLDevice> device;
@property (nonatomic, strong) id <MTLCommandQueue> commandQueue;
@end

@implementation ImGuiDrawView {
    BOOL _imguiReady;
}

- (instancetype)initWithNibName:(nullable NSString *)nibNameOrNil bundle:(nullable NSBundle *)nibBundleOrNil
{
    self = [super initWithNibName:nibNameOrNil bundle:nibBundleOrNil];
    if (!self) return nil;

    _imguiReady = NO;

    _device = MTLCreateSystemDefaultDevice();
    if (!_device) {
        return nil;
    }
    _commandQueue = [_device newCommandQueue];
    if (!_commandQueue) {
        return nil;
    }

    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGuiIO& io = ImGui::GetIO(); (void)io;

    PushHUDStyle();

    io.Fonts->AddFontFromMemoryCompressedTTF(
        (void*)zzz_compressed_data, zzz_compressed_size, 30.0f,
        NULL, io.Fonts->GetGlyphRangesVietnamese()
    );

    ImGui_ImplMetal_Init(_device);

    _imguiReady = YES;
    return self;
}

+ (void)showChange:(BOOL)open {
    g_menuOpen = open;
    if (open) {
        NSString *s = [NSString stringWithFormat:@"[%@] MENU_OPEN\n", [NSDate date]];
        const char *u = [s UTF8String];
        if (u) AOVLogCrashLine(u);
    }
}

+ (void)attachOverlayToKeyWindowRoot:(ImGuiDrawView *)overlay {
    if (!overlay) return;
    // Unity thường không phải rootViewController — gắn vào VC đang hiển thị (cùng cây với gesture).
    UIViewController *parent = [JHPP currentViewController];
    if (!parent || parent.view.bounds.size.width < 1.f || parent.view.bounds.size.height < 1.f) {
        UIWindow *win = [UIApplication sharedApplication].keyWindow;
        if (!win) {
            NSArray *windows = [UIApplication sharedApplication].windows;
            if (windows.count > 0) win = windows[0];
        }
        parent = win.rootViewController;
    }
    if (!parent) return;
    UIView *pv = parent.view;
    if (!pv) return;
    if (overlay.parentViewController == parent && overlay.view.superview == pv) return;
    if (overlay.parentViewController) {
        [overlay willMoveToParentViewController:nil];
        [overlay.view removeFromSuperview];
        [overlay removeFromParentViewController];
    }
    [parent addChildViewController:overlay];
    [pv addSubview:overlay.view];
    [overlay didMoveToParentViewController:parent];
}

- (MTKView *)mtkView { return (MTKView *)self.view; }

- (void)loadView
{
    UIWindow *win = [UIApplication sharedApplication].keyWindow;
    if (!win) {
        NSArray *windows = [UIApplication sharedApplication].windows;
        if (windows.count > 0) win = windows[0];
    }
    CGFloat w = win ? win.rootViewController.view.frame.size.width : UIScreen.mainScreen.bounds.size.width;
    CGFloat h = win ? win.rootViewController.view.frame.size.height : UIScreen.mainScreen.bounds.size.height;

    PassthroughMTKView *mtk = [[PassthroughMTKView alloc] initWithFrame:CGRectMake(0, 0, w, h) device:_device];
    mtk.preferredFramesPerSecond = 60;
    mtk.enableSetNeedsDisplay = NO;
    mtk.paused = NO;
    mtk.userInteractionEnabled = YES;
    self.view = mtk;
}

- (void)viewDidLoad {
    [super viewDidLoad];

    AC_InitBuiltinProfiles();

    if (!self.mtkView.device) self.mtkView.device = self.device;
    self.mtkView.delegate = self;
    self.mtkView.clearColor = MTLClearColorMake(0, 0, 0, 0);
    self.mtkView.backgroundColor = [UIColor colorWithRed:0 green:0 blue:0 alpha:0];
    self.mtkView.clipsToBounds = YES;

    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            PatchAnort();
        } @catch (...) {}
    });

    @try {
        SchedulePatches();
    } @catch (...) {}

    // Một lần / process: resolve + hook trên serial queue (không dùng global concurrent) + tùy chọn delay — giảm race với Unity thread.
    std::call_once(g_espHooksOnce, []{
        dispatch_queue_t q = GetHookQueue();
        dispatch_block_t work = ^{
            @try {
                ESP_ResolveFunctions();
                if (!espReady) return;
#if !AOVPRO_DISABLE_ESP_HOOK
                if (ActorLinker_Update)        { HOOK(ActorLinker_Update, _ESP_ActorLinker_Update, ESP_ActorLinker_Update); }
                if (ActorLinker_DestroyActor)  { HOOK(ActorLinker_DestroyActor, _ESP_ActorLinker_DestroyActor, ESP_ActorLinker_DestroyActor); }
                if (LActorRoot_UpdateLogic)    { HOOK(LActorRoot_UpdateLogic, _ESP_LActorRoot_UpdateLogic, ESP_LActorRoot_UpdateLogic); }
                if (GetUseSkillDirection)      { HOOK(GetUseSkillDirection, _ESP_GetUseSkillDirection, ESP_GetUseSkillDirection); }
                if (SkillButtonMgr_LateUpdate) { HOOK(SkillButtonMgr_LateUpdate, _ESP_SkillButtonManager_LateUpdate, ESP_SkillButtonManager_LateUpdate); }
                if (SkillSlot_LateUpdate)      { HOOK(SkillSlot_LateUpdate, _ESP_SkillSlot_LateUpdate, ESP_SkillSlot_LateUpdate); }
                if (SetVisible_offset)         { HOOK(SetVisible_offset, _SetVisible, SetVisible); }
                if (CameraSystem_GetZoomRate)  { HOOK(CameraSystem_GetZoomRate, _CameraGetZoomRate, CameraGetZoomRate); }
                if (CameraSystem_Update)       { HOOK(CameraSystem_Update, _CameraUpdate, CameraUpdate); }
#endif
            } @catch (...) {}
        };
        dispatch_time_t when = dispatch_time(DISPATCH_TIME_NOW, (int64_t)(AOVPRO_ESP_HOOK_DELAY_SEC * (double)NSEC_PER_SEC));
        dispatch_after(when, q, work);
    });
}

void LazyInstallSkinHooks() {
    if (isSkinHooked) return;
    bool anyHooked = false;
    if (SkinOffsets::UL_unpack) { HOOK(SkinOffsets::UL_unpack, _Unpack, Unpack); anyHooked = true; }
    if (SkinOffsets::UL_OnClickSelectHeroSkin) { HOOK(SkinOffsets::UL_OnClickSelectHeroSkin, _OnClickSelectHeroSkin, OnClickSelectHeroSkin); anyHooked = true; }
    if (SkinOffsets::UL_IsCanUseSkin) { HOOK(SkinOffsets::UL_IsCanUseSkin, _IsCanUseSkin, IsCanUseSkin); anyHooked = true; }
    if (SkinOffsets::UL_GetHeroWearSkinId) { HOOK(SkinOffsets::UL_GetHeroWearSkinId, _GetHeroWearSkinId, GetHeroWearSkinId); anyHooked = true; }
    if (SkinOffsets::UL_IsHaveHeroSkin) { HOOK(SkinOffsets::UL_IsHaveHeroSkin, _IsHaveHeroSkin, IsHaveHeroSkin); anyHooked = true; }
    if (SkinOffsets::UL_IsSkinAvailable) { HOOK(SkinOffsets::UL_IsSkinAvailable, _IsSkinAvailable, IsSkinAvailable); anyHooked = true; }
    if (anyHooked) {
        isSkinHooked = true;
    }
}

- (void)updateIOWithTouchEvent:(UIEvent *)event
{
    if (!g_menuOpen) return;

    UITouch *anyTouch = event.allTouches.anyObject;
    if (!anyTouch) return;
    CGPoint touchLocation = [anyTouch locationInView:self.view];
    ImGuiIO &io = ImGui::GetIO();
    io.MousePos = ImVec2(touchLocation.x, touchLocation.y);

    BOOL hasActiveTouch = NO;
    for (UITouch *touch in event.allTouches) {
        if (touch.phase != UITouchPhaseEnded && touch.phase != UITouchPhaseCancelled) {
            hasActiveTouch = YES;
            break;
        }
    }
    io.MouseDown[0] = hasActiveTouch;
}

- (void)touchesBegan:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event { [self updateIOWithTouchEvent:event]; }
- (void)touchesMoved:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event { [self updateIOWithTouchEvent:event]; }
- (void)touchesCancelled:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event { [self updateIOWithTouchEvent:event]; }
- (void)touchesEnded:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event { [self updateIOWithTouchEvent:event]; }

- (void)drawInMTKView:(MTKView*)view
{
    if (!_imguiReady) return;

    @autoreleasepool {
        // Phải chạy trước mọi return sớm: nếu không, MTKView vẫn interactive → chặn gesture mở menu.
        [self.view setUserInteractionEnabled:g_menuOpen];

        const CGFloat bw = view.bounds.size.width;
        const CGFloat bh = view.bounds.size.height;
        if (bw < 1.f || bh < 1.f) return;

        id<CAMetalDrawable> drawable = view.currentDrawable;
        MTLRenderPassDescriptor* renderPassDescriptor = view.currentRenderPassDescriptor;
        if (!renderPassDescriptor || !drawable) return;

        id<MTLCommandBuffer> commandBuffer = [self.commandQueue commandBuffer];
        if (!commandBuffer) return;

        id <MTLRenderCommandEncoder> renderEncoder = [commandBuffer renderCommandEncoderWithDescriptor:renderPassDescriptor];
        if (!renderEncoder) {
            [commandBuffer commit];
            return;
        }

        // Chỉ cập nhật ImGuiIO khi đã có drawable + encoder — tránh lệch trạng thái ImGui khi drawable tạm nil (hay gặp lúc mở menu / resume).
        ImGuiIO& io = ImGui::GetIO();
        io.DisplaySize.x = bw;
        io.DisplaySize.y = bh;

        static CGFloat cachedScale = 0;
        if (cachedScale == 0)
            cachedScale = (view.window && view.window.screen) ? view.window.screen.scale : UIScreen.mainScreen.scale;
        io.DisplayFramebufferScale = ImVec2(cachedScale, cachedScale);
        {
            static double lastTime = 0;
            double now = CACurrentMediaTime();
            io.DeltaTime = lastTime > 0 ? (float)(now - lastTime) : (1.f / 60.f);
            if (io.DeltaTime <= 0.f || io.DeltaTime > 0.2f) io.DeltaTime = 1.f / 60.f;
            lastTime = now;
        }
        g_time += io.DeltaTime;
        g_pulse.update(g_time);

        if (g_toggleAnim.size() > 256) g_toggleAnim.clear();
        if (g_sliderAnim.size() > 256) g_sliderAnim.clear();

        if (!g_menuOpen) {
            io.MouseDown[0] = false;
            io.MousePos = ImVec2(-FLT_MAX, -FLT_MAX);
        }

        [renderEncoder pushDebugGroup:@"ImGui Neon"];

        ImGui_ImplMetal_NewFrame(renderPassDescriptor);
        ImGui::NewFrame();

        ImFont* font = ImGui::GetFont();
        if (font && font->FontSize > 0.f) {
            font->Scale = 15.f / 30.f;
        }

        if (![[AOVLicenseGateManager shared] isVerified]) {
            ImGui::Render();
            [renderEncoder popDebugGroup];
            [renderEncoder endEncoding];
            [commandBuffer presentDrawable:drawable];
            [commandBuffer commit];
            return;
        }

        if (g_menuOpen) {
            CGFloat x = (io.DisplaySize.x - 560) * 0.5f;
            CGFloat y = (io.DisplaySize.y - 330) * 0.5f;
            ImGui::SetNextWindowPos(ImVec2(x, y), ImGuiCond_FirstUseEver);
            ImGui::SetNextWindowSize(ImVec2(560, 330), ImGuiCond_FirstUseEver);
            ImGui::SetNextWindowSizeConstraints(ImVec2(440, 280), ImVec2(750, 500));
            ImGui::SetNextWindowBgAlpha(0.96f);

            ImGui::Begin("#wtuananh6886", nullptr, ImGuiWindowFlags_NoCollapse);
            DrawESPSettings();
            ImGui::End();
        }

        DrawESPLines(io.DisplaySize.x, io.DisplaySize.y);

        ImGui::Render();
        ImDrawData* draw_data = ImGui::GetDrawData();
        if (draw_data) {
            ImGui_ImplMetal_RenderDrawData(draw_data, commandBuffer, renderEncoder);
        }

        [renderEncoder popDebugGroup];
        [renderEncoder endEncoding];
        [commandBuffer presentDrawable:drawable];
        [commandBuffer commit];
    }
}

- (void)mtkView:(MTKView*)view drawableSizeWillChange:(CGSize)size {}

@end
