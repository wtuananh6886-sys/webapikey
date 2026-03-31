#import "TweakEntry.h"
#import <UIKit/UIKit.h>

#import "ViewControllerHelper.h"
#import "ImGuiLoader.h"
#import "ImGuiDrawView.h"
#import "AOVLicenseGateManager.h"
@interface PubgLoad()
@property (nonatomic, strong) ImGuiDrawView *vna;
@end

@implementation PubgLoad

static PubgLoad *extraInfo;
static BOOL gDidInstallGestures = NO;

+ (void)load
{
    [super load];

    // Crash log: cài sớm (trước ImGuiDrawView +load) + retry trên main — tránh file rỗng khi crash.
    AOVInstallCrashLogToDocuments();
    dispatch_async(dispatch_get_main_queue(), ^{
        AOVInstallCrashLogToDocuments();
    });
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        AOVInstallCrashLogToDocuments();
    });

    dispatch_async(dispatch_get_main_queue(), ^{
        [[AOVLicenseGateManager shared] bootWithDelay:0.08];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.25 * NSEC_PER_SEC)),
                       dispatch_get_main_queue(), ^{
            [[AOVLicenseGateManager shared] presentNow];
        });
        [self bootstrapGestureInstall:0];
    });
}

+ (void)bootstrapGestureInstall:(NSInteger)retryCount
{
    if (gDidInstallGestures) return;
    if (retryCount > 120) return;

    UIViewController *currentVC = [JHPP currentViewController];
    UIView *targetView = currentVC.view;
    if (!targetView || targetView.bounds.size.width < 1.f || targetView.bounds.size.height < 1.f) {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.25 * NSEC_PER_SEC)),
                       dispatch_get_main_queue(), ^{
            [self bootstrapGestureInstall:retryCount + 1];
        });
        return;
    }

    extraInfo = [PubgLoad new];
    [extraInfo initTapGes];
    [extraInfo initTapGes2];
    gDidInstallGestures = YES;
}

-(void)initTapGes
{
    UITapGestureRecognizer *tap = [[UITapGestureRecognizer alloc] init];
    tap.numberOfTapsRequired = 2;
    tap.numberOfTouchesRequired = 3;
    tap.cancelsTouchesInView = NO;
    UIView *view = [JHPP currentViewController].view;
    if (!view) return;
    [view addGestureRecognizer:tap];
    [tap addTarget:self action:@selector(tapIconView)];
}

-(void)initTapGes2
{
    UITapGestureRecognizer *tap = [[UITapGestureRecognizer alloc] init];
    tap.numberOfTapsRequired = 2;
    tap.numberOfTouchesRequired = 2;
    tap.cancelsTouchesInView = NO;
    UIView *view = [JHPP currentViewController].view;
    if (!view) return;
    [view addGestureRecognizer:tap];
    [tap addTarget:self action:@selector(tapIconView2)];
}

-(void)tapIconView2
{
    [ImGuiDrawView showChange:false];
}

-(void)tapIconView
{
    if (!_vna) _vna = [[ImGuiDrawView alloc] init];
    [ImGuiDrawView attachOverlayToKeyWindowRoot:_vna];
    [ImGuiDrawView showChange:YES];
}
@end
