#export THEOS=/var/mobile/theos
ARCHS = arm64
TARGET = iphone:latest
DEBUG = 0
FINALPACKAGE = 1
FOR_RELEASE = 1

include $(THEOS)/makefiles/common.mk

TWEAK_NAME = tuananh

$(TWEAK_NAME)_FRAMEWORKS =  UIKit Foundation Security QuartzCore CoreGraphics CoreText  AVFoundation Accelerate GLKit SystemConfiguration GameController

$(TWEAK_NAME)_CCFLAGS = -fno-rtti -fvisibility=hidden -DNDEBUG -std=c++17 -O2 -flto
# Debug crash khi mở menu: mặc định delay ESP hook 2.5s (ImGuiDrawView). Tắt delay: -DAOVPRO_ESP_HOOK_DELAY_SEC=0
# $(TWEAK_NAME)_CCFLAGS += -DAOVPRO_DISABLE_ESP_HOOK=1
# $(TWEAK_NAME)_CCFLAGS += -DAOVPRO_ESP_HOOK_DELAY_SEC=0
$(TWEAK_NAME)_CFLAGS = -O2 -fobjc-arc -Wno-deprecated-declarations -Wno-unused-variable -Wno-unused-value -DHAVE_INTTYPES_H -DHAVE_PKCRYPT -DHAVE_STDINT_H -DHAVE_WZAES -DHAVE_ZLIB -flto

$(TWEAK_NAME)_LDFLAGS += -flto -lresolv -lz -liconv Vendor/lib/libdaubuoi.a Vendor/lib/libmonostring.a

$(TWEAK_NAME)_FILES = ImGuiDrawView.mm $(wildcard UI/*.mm) $(wildcard UI/*.m) $(wildcard Vendor/ImGui/*.cpp) $(wildcard Vendor/ImGui/*.mm)


include $(THEOS_MAKE_PATH)/tweak.mk

