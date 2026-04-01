#import "AOVLicenseGateManager.h"
#import <UIKit/UIKit.h>
#import "Core/Obfuscate.h"
#import "AOVLicenseTimeUtils.h"

static NSString * const kAOVLicenseVerifiedKey = @"aov.license.verified";
static NSString * const kAOVLicenseValueKey = @"aov.license.value";
static NSString * const kAOVLicensePlanKey = @"aov.license.plan";
static NSString * const kAOVLicenseExpiryKey = @"aov.license.expiry";
static NSString * const kAOVLicensePackageKey = @"aov.license.package";
static NSString * const kAOVDeviceIdKey = @"aov.device.id";
static NSString * const kAOVPackageTokenKey = @"aov.package.token";
/** Server JWT from POST /api/licenses/verify when LICENSE_SESSION_SECRET is set — refreshed via /api/licenses/session */
static NSString * const kAOVSessionTokenKey = @"aov.license.session.token";
static NSString * const kAOVCachedUITitleKey = @"aov.activation.ui.title";
static NSString * const kAOVCachedUISubtitleKey = @"aov.activation.ui.subtitle";
static const NSInteger kAOVActivationKeyFieldTag = 772001;

@interface AOVLicenseGateManager () <UITextFieldDelegate, UIGestureRecognizerDelegate>
@property (nonatomic, assign) BOOL verified;
@property (nonatomic, assign) BOOL promptVisible;
@property (nonatomic, assign) BOOL checking;
@property (nonatomic, assign) BOOL bootstrapped;
@property (nonatomic, strong) UIView *toastView;
@property (nonatomic, assign) BOOL autoVerifyInProgress;
@property (nonatomic, copy) NSString *pendingPromptMessage;
@property (nonatomic, strong) NSTimer *sessionRefreshTimer;
@property (nonatomic, assign) BOOL sessionRefreshInFlight;
@property (nonatomic, strong) UIView *activationOverlayView;
@property (nonatomic, weak) UITextField *activationKeyField;
@property (nonatomic, weak) UIView *activationCardView;
@property (nonatomic, weak) UILabel *activationTitleLabel;
@property (nonatomic, weak) UILabel *activationSubtitleLabel;
@property (nonatomic, assign) BOOL activationKeyboardObserversActive;
@end

@implementation AOVLicenseGateManager

- (NSString *)inferPackageIdFromLicenseKey:(NSString *)licenseKey {
    NSString *trimmed = [licenseKey stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (trimmed.length == 0) return @"";
    NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"^(.*)-\\d+day-[A-Za-z0-9]+$"
                                                                           options:0
                                                                             error:nil];
    NSTextCheckingResult *match = [regex firstMatchInString:trimmed options:0 range:NSMakeRange(0, trimmed.length)];
    if (!match || match.numberOfRanges < 2) return @"";
    NSRange packageRange = [match rangeAtIndex:1];
    if (packageRange.location == NSNotFound || packageRange.length == 0) return @"";
    return [[trimmed substringWithRange:packageRange] lowercaseString];
}

- (NSString *)stableDeviceId {
    NSUserDefaults *ud = [NSUserDefaults standardUserDefaults];
    NSString *saved = [ud stringForKey:kAOVDeviceIdKey];
    if (saved.length > 0) return saved;
    NSString *generated = [[NSUUID UUID].UUIDString lowercaseString];
    [ud setObject:generated forKey:kAOVDeviceIdKey];
    [ud synchronize];
    return generated;
}

- (NSString *)packageToken {
    NSUserDefaults *ud = [NSUserDefaults standardUserDefaults];
    NSString *saved = [ud stringForKey:kAOVPackageTokenKey];
    if (saved.length > 0) return saved;
    // Replace this with token copied from dashboard package panel.
    return NSSENCRYPT("PKG_809OMCIVPP7ZIUZL");
}

- (void)sendVerifyRequestWithRequest:(NSURLRequest *)request
                             license:(NSString *)licenseKey
                           packageId:(NSString *)packageId
                           retryLeft:(NSInteger)retryLeft {
    NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData * _Nullable data, NSURLResponse * _Nullable response, NSError * _Nullable error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            AOVLicenseGateManager *selfRef = [AOVLicenseGateManager shared];
            if (!selfRef) return;

            if (error) {
                if (retryLeft > 0) {
                    [selfRef sendVerifyRequestWithRequest:request license:licenseKey packageId:packageId retryLeft:retryLeft - 1];
                    return;
                }
                selfRef.checking = NO;
                [selfRef presentPromptIfNeededWithMessage:[NSString stringWithFormat:@"Network error: %@", error.localizedDescription]];
                return;
            }

            NSInteger code = 0;
            if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
                code = [(NSHTTPURLResponse *)response statusCode];
            }

            NSDictionary *json = nil;
            if (data.length > 0) {
                json = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
            }
            BOOL ok = [[json objectForKey:NSSENCRYPT("ok")] boolValue];
            if (code >= 200 && code < 300 && ok) {
                NSString *plan = [json objectForKey:NSSENCRYPT("plan")] ?: @"-";
                NSString *expiry = [json objectForKey:NSSENCRYPT("expiresAt")] ?: @"-";
                NSString *pkg = [json objectForKey:NSSENCRYPT("packageName")] ?: packageId;

                selfRef.verified = YES;
                selfRef.checking = NO;
                selfRef.autoVerifyInProgress = NO;
                NSUserDefaults *ud = [NSUserDefaults standardUserDefaults];
                [ud setBool:YES forKey:kAOVLicenseVerifiedKey];
                [ud setObject:licenseKey forKey:kAOVLicenseValueKey];
                [ud setObject:plan forKey:kAOVLicensePlanKey];
                [ud setObject:expiry forKey:kAOVLicenseExpiryKey];
                [ud setObject:pkg forKey:kAOVLicensePackageKey];
                id uiTitle = [json objectForKey:NSSENCRYPT("uiTitle")];
                if ([uiTitle isKindOfClass:[NSString class]] && [(NSString *)uiTitle length] > 0) {
                    [ud setObject:uiTitle forKey:kAOVCachedUITitleKey];
                }
                id uiSub = [json objectForKey:NSSENCRYPT("uiSubtitle")];
                if ([uiSub isKindOfClass:[NSString class]] && [(NSString *)uiSub length] > 0) {
                    [ud setObject:uiSub forKey:kAOVCachedUISubtitleKey];
                } else {
                    [ud removeObjectForKey:kAOVCachedUISubtitleKey];
                }
                [ud synchronize];
                [selfRef saveSessionTokenFromVerifyResponse:json];
                [selfRef showVerifiedToastWithPlan:plan expiry:expiry];
                return;
            }

            selfRef.checking = NO;
            selfRef.autoVerifyInProgress = NO;
            [selfRef clearSessionToken];
            NSString *reason = nil;
            NSString *messageText = nil;
            if ([json isKindOfClass:[NSDictionary class]]) {
                id reasonVal = [json objectForKey:NSSENCRYPT("reason")];
                if ([reasonVal isKindOfClass:[NSString class]]) reason = (NSString *)reasonVal;
                id messageVal = [json objectForKey:NSSENCRYPT("message")];
                if ([messageVal isKindOfClass:[NSString class]]) messageText = (NSString *)messageVal;
            }
            if (reason.length == 0) reason = messageText;
            if (reason.length == 0) reason = [NSString stringWithFormat:@"http_%ld", (long)code];

            NSString *rawText = @"";
            if (data.length > 0) {
                NSString *tmp = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
                rawText = tmp ?: @"";
            }
            if (rawText.length > 140) rawText = [rawText substringToIndex:140];

            NSString *detail = rawText.length > 0
                ? [NSString stringWithFormat:@"Activation failed: %@ (code=%ld)\n%@", reason, (long)code, rawText]
                : [NSString stringWithFormat:@"Activation failed: %@ (code=%ld)", reason, (long)code];
            [selfRef showErrorToastWithReason:reason];
            [selfRef presentPromptIfNeededWithMessage:detail];
        });
    }];
    [task resume];
}

- (NSString *)verifyAPIHost {
    return NSSENCRYPT("https://webapikey-sable.vercel.app");
}

- (void)clearSessionToken {
    NSUserDefaults *ud = [NSUserDefaults standardUserDefaults];
    [ud removeObjectForKey:kAOVSessionTokenKey];
    [ud synchronize];
    [self.sessionRefreshTimer invalidate];
    self.sessionRefreshTimer = nil;
}

- (void)saveSessionTokenFromVerifyResponse:(NSDictionary *)json {
    if (![json isKindOfClass:[NSDictionary class]]) return;
    id tok = [json objectForKey:NSSENCRYPT("sessionToken")];
    if (![tok isKindOfClass:[NSString class]] || [(NSString *)tok length] < 16) {
        [self clearSessionToken];
        return;
    }
    NSUserDefaults *ud = [NSUserDefaults standardUserDefaults];
    [ud setObject:tok forKey:kAOVSessionTokenKey];
    [ud synchronize];
    [self scheduleSessionRefreshTimerIfNeeded];
}

- (void)scheduleSessionRefreshTimerIfNeeded {
    [self.sessionRefreshTimer invalidate];
    self.sessionRefreshTimer = nil;
    NSString *tok = [[NSUserDefaults standardUserDefaults] stringForKey:kAOVSessionTokenKey];
    if (tok.length == 0) return;
    __weak AOVLicenseGateManager *weakSelf = self;
    self.sessionRefreshTimer = [NSTimer scheduledTimerWithTimeInterval:900.0 repeats:YES block:^(NSTimer * _Nonnull t) {
        [weakSelf refreshSessionSilently];
    }];
}

- (void)invalidateLicenseAndReprompt:(NSString *)reason {
    self.verified = NO;
    self.checking = NO;
    self.autoVerifyInProgress = NO;
    NSUserDefaults *ud = [NSUserDefaults standardUserDefaults];
    [ud setBool:NO forKey:kAOVLicenseVerifiedKey];
    [ud synchronize];
    [self clearSessionToken];
    if (reason.length > 0) {
        [self showErrorToastWithReason:reason];
    }
    [self presentPromptIfNeededWithMessage:reason.length > 0 ? reason : @"Session expired. Enter key again."];
}

- (void)refreshSessionSilently {
    if (!self.verified || self.sessionRefreshInFlight) return;
    NSString *tok = [[NSUserDefaults standardUserDefaults] stringForKey:kAOVSessionTokenKey];
    if (tok.length == 0) return;

    NSString *host = [self verifyAPIHost];
    NSURL *url = [NSURL URLWithString:[host stringByAppendingString:NSSENCRYPT("/api/licenses/session")]];
    if (!url) return;

    self.sessionRefreshInFlight = YES;
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
    req.HTTPMethod = NSSENCRYPT("POST");
    req.timeoutInterval = 12.0;
    [req setValue:NSSENCRYPT("application/json") forHTTPHeaderField:NSSENCRYPT("Content-Type")];
    [req setValue:[NSString stringWithFormat:NSSENCRYPT("Bearer %@"), tok] forHTTPHeaderField:NSSENCRYPT("Authorization")];
    NSDictionary *emptyBody = @{};
    NSData *body = [NSJSONSerialization dataWithJSONObject:emptyBody options:0 error:nil];
    req.HTTPBody = body ?: [NSData data];

    __weak AOVLicenseGateManager *weakSelf = self;
    [[[NSURLSession sharedSession] dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            AOVLicenseGateManager *selfRef = weakSelf;
            if (!selfRef) return;
            selfRef.sessionRefreshInFlight = NO;

            if (error) return;

            NSInteger code = 0;
            if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
                code = [(NSHTTPURLResponse *)response statusCode];
            }
            if (code == 503) {
                return;
            }
            NSDictionary *json = nil;
            if (data.length > 0) {
                json = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
            }
            BOOL ok = [[json objectForKey:NSSENCRYPT("ok")] boolValue];

            if (code == 401 || code == 403 || !ok) {
                [selfRef invalidateLicenseAndReprompt:NSSENCRYPT("License session expired or revoked")];
                return;
            }

            if ([json isKindOfClass:[NSDictionary class]]) {
                id newTok = [json objectForKey:NSSENCRYPT("sessionToken")];
                if ([newTok isKindOfClass:[NSString class]] && [(NSString *)newTok length] >= 16) {
                    [[NSUserDefaults standardUserDefaults] setObject:newTok forKey:kAOVSessionTokenKey];
                    [[NSUserDefaults standardUserDefaults] synchronize];
                }
            }
        });
    }] resume];
}

+ (instancetype)shared {
    static AOVLicenseGateManager *inst;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        inst = [AOVLicenseGateManager new];
    });
    return inst;
}

- (instancetype)init {
    self = [super init];
    if (!self) return nil;
    // Force license gate every app launch (no bypass from previous session cache).
    _verified = NO;
    _promptVisible = NO;
    _checking = NO;
    _bootstrapped = NO;
    _autoVerifyInProgress = NO;
    _pendingPromptMessage = nil;
    _sessionRefreshInFlight = NO;
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(onAppBecameActive)
                                                 name:UIApplicationDidBecomeActiveNotification
                                               object:nil];
    return self;
}

- (BOOL)isVerified {
    return self.verified;
}

- (void)tryAutoVerifyOrPresent:(NSString * _Nullable)message {
    if (self.verified) return;
    if (self.autoVerifyInProgress) {
        self.pendingPromptMessage = message;
        return;
    }
    NSString *savedKey = [[NSUserDefaults standardUserDefaults] stringForKey:kAOVLicenseValueKey] ?: @"";
    if (savedKey.length == 0) {
        [self presentPromptIfNeededWithMessage:message];
        return;
    }
    self.autoVerifyInProgress = YES;
    self.pendingPromptMessage = message;
    [self verifyWithKey:savedKey isAuto:YES];
}

- (void)bootWithDelay:(NSTimeInterval)delay {
    if (self.bootstrapped) return;
    self.bootstrapped = YES;
    self.verified = NO;
    self.promptVisible = NO;
    self.checking = NO;
    NSTimeInterval safeDelay = delay < 0.05 ? 0.05 : delay;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(safeDelay * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
        [self tryAutoVerifyOrPresent:nil];
    });
    // Fallback retries in case early UI scene is not ready.
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.6 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
        if (!self.verified && !self.promptVisible) [self tryAutoVerifyOrPresent:nil];
    });
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.2 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
        if (!self.verified && !self.promptVisible) [self tryAutoVerifyOrPresent:nil];
    });
}

- (void)presentNow {
    if (self.verified) return;
    [self tryAutoVerifyOrPresent:nil];
}

- (void)onAppBecameActive {
    if (!self.verified) {
        [self tryAutoVerifyOrPresent:nil];
    } else {
        [self refreshSessionSilently];
    }
}

- (UIViewController *)topViewController {
    UIWindow *hostWindow = nil;
    for (UIWindow *w in [UIApplication sharedApplication].windows) {
        if (!w.isHidden && w.windowLevel <= UIWindowLevelNormal + 1) {
            hostWindow = w;
            break;
        }
    }
    if (!hostWindow) hostWindow = [UIApplication sharedApplication].keyWindow;
    UIViewController *vc = hostWindow.rootViewController;
    while (vc) {
        if ([vc isKindOfClass:[UINavigationController class]]) {
            vc = ((UINavigationController *)vc).visibleViewController;
            continue;
        }
        if ([vc isKindOfClass:[UITabBarController class]]) {
            vc = ((UITabBarController *)vc).selectedViewController;
            continue;
        }
        if (vc.presentedViewController) {
            vc = vc.presentedViewController;
            continue;
        }
        break;
    }
    return vc;
}

- (void)showVerifiedToastWithPlan:(NSString *)plan expiry:(NSString *)expiry {
    UIWindow *hostWindow = nil;
    for (UIWindow *w in [UIApplication sharedApplication].windows) {
        if (!w.isHidden && w.windowLevel <= UIWindowLevelNormal + 1) {
            hostWindow = w;
            break;
        }
    }
    if (!hostWindow) hostWindow = [UIApplication sharedApplication].keyWindow;
    if (!hostWindow) return;

    UIView *card = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 300, 98)];
    card.userInteractionEnabled = NO;
    card.backgroundColor = [UIColor colorWithRed:0.07 green:0.10 blue:0.16 alpha:0.96];
    card.layer.cornerRadius = 14.0;
    card.layer.borderColor = [UIColor colorWithRed:0.32 green:0.62 blue:1.0 alpha:0.45].CGColor;
    card.layer.borderWidth = 1.0;

    UILabel *title = [[UILabel alloc] initWithFrame:CGRectMake(14, 10, 250, 20)];
    title.text = @"License verified";
    title.textColor = [UIColor colorWithRed:0.45 green:0.92 blue:0.63 alpha:1.0];
    title.font = [UIFont boldSystemFontOfSize:14];

    UILabel *line1 = [[UILabel alloc] initWithFrame:CGRectMake(14, 32, 250, 18)];
    line1.text = [NSString stringWithFormat:@"Plan: %@", plan ?: @"-"];
    line1.textColor = UIColor.whiteColor;
    line1.font = [UIFont systemFontOfSize:12 weight:UIFontWeightMedium];

    NSString *remainText = [AOVLicenseTimeUtils remainingTextFromExpiryString:expiry ?: @"-"];

    UILabel *line2 = [[UILabel alloc] initWithFrame:CGRectMake(14, 50, 270, 18)];
    line2.text = remainText;
    line2.textColor = [UIColor colorWithWhite:0.80 alpha:1.0];
    line2.font = [UIFont systemFontOfSize:11 weight:UIFontWeightRegular];

    UILabel *line3 = [[UILabel alloc] initWithFrame:CGRectMake(14, 68, 270, 18)];
    line3.text = [AOVLicenseTimeUtils displayExpiryText:expiry ?: @"-"];
    line3.textColor = [UIColor colorWithWhite:0.62 alpha:1.0];
    line3.font = [UIFont systemFontOfSize:10 weight:UIFontWeightRegular];

    [card addSubview:title];
    [card addSubview:line1];
    [card addSubview:line2];
    [card addSubview:line3];
    [hostWindow addSubview:card];
    self.toastView = card;

    CGRect bounds = hostWindow.bounds;
    CGFloat targetX = bounds.size.width - 300 - 14;
    CGFloat targetY = 18;
    card.frame = CGRectMake(bounds.size.width + 8, targetY, 300, 98);
    card.alpha = 0.0;

    [UIView animateWithDuration:0.32 delay:0 options:UIViewAnimationOptionCurveEaseOut animations:^{
        card.frame = CGRectMake(targetX, targetY, 300, 98);
        card.alpha = 1.0;
    } completion:^(BOOL finished) {
        [UIView animateWithDuration:0.30 delay:3.8 options:UIViewAnimationOptionCurveEaseIn animations:^{
            card.frame = CGRectMake(bounds.size.width + 8, targetY, 300, 98);
            card.alpha = 0.0;
        } completion:^(BOOL finished2) {
            [self.toastView removeFromSuperview];
            self.toastView = nil;
        }];
    }];
}

- (void)showErrorToastWithReason:(NSString *)reason {
    if (reason.length == 0) return;
    UIWindow *hostWindow = nil;
    for (UIWindow *w in [UIApplication sharedApplication].windows) {
        if (!w.isHidden && w.windowLevel <= UIWindowLevelNormal + 1) {
            hostWindow = w;
            break;
        }
    }
    if (!hostWindow) hostWindow = [UIApplication sharedApplication].keyWindow;
    if (!hostWindow) return;

    UIView *card = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 320, 78)];
    card.userInteractionEnabled = NO;
    card.backgroundColor = [UIColor colorWithRed:0.18 green:0.07 blue:0.09 alpha:0.95];
    card.layer.cornerRadius = 12.0;
    card.layer.borderColor = [UIColor colorWithRed:0.92 green:0.36 blue:0.36 alpha:0.8].CGColor;
    card.layer.borderWidth = 1.0;

    UILabel *title = [[UILabel alloc] initWithFrame:CGRectMake(12, 8, 290, 18)];
    title.text = @"Verify failed";
    title.textColor = [UIColor colorWithRed:0.98 green:0.72 blue:0.72 alpha:1.0];
    title.font = [UIFont boldSystemFontOfSize:13];

    UILabel *line = [[UILabel alloc] initWithFrame:CGRectMake(12, 28, 296, 42)];
    line.text = reason;
    line.textColor = UIColor.whiteColor;
    line.numberOfLines = 2;
    line.font = [UIFont systemFontOfSize:11 weight:UIFontWeightMedium];

    [card addSubview:title];
    [card addSubview:line];
    [hostWindow addSubview:card];
    self.toastView = card;

    CGRect bounds = hostWindow.bounds;
    CGFloat targetX = bounds.size.width - 320 - 14;
    CGFloat targetY = 18;
    card.frame = CGRectMake(bounds.size.width + 8, targetY, 320, 78);
    card.alpha = 0.0;

    [UIView animateWithDuration:0.25 delay:0 options:UIViewAnimationOptionCurveEaseOut animations:^{
        card.frame = CGRectMake(targetX, targetY, 320, 78);
        card.alpha = 1.0;
    } completion:^(BOOL finished) {
        [UIView animateWithDuration:0.24 delay:2.6 options:UIViewAnimationOptionCurveEaseIn animations:^{
            card.frame = CGRectMake(bounds.size.width + 8, targetY, 320, 78);
            card.alpha = 0.0;
        } completion:^(BOOL finished2) {
            [self.toastView removeFromSuperview];
            self.toastView = nil;
        }];
    }];
}

- (UIWindow *)activationHostWindow {
    for (UIWindow *w in [UIApplication sharedApplication].windows) {
        if (!w.isHidden && w.windowLevel <= UIWindowLevelNormal + 1) {
            return w;
        }
    }
    return [UIApplication sharedApplication].keyWindow;
}

- (void)dismissActivationOverlayAnimated:(BOOL)animated {
    UIView *overlay = self.activationOverlayView;
    if (!overlay) return;
    [overlay endEditing:YES];
    if (self.activationKeyboardObserversActive) {
        [[NSNotificationCenter defaultCenter] removeObserver:self name:UIKeyboardWillShowNotification object:nil];
        [[NSNotificationCenter defaultCenter] removeObserver:self name:UIKeyboardWillHideNotification object:nil];
        self.activationKeyboardObserversActive = NO;
    }
    self.activationKeyField = nil;
    self.activationCardView = nil;
    self.activationTitleLabel = nil;
    self.activationSubtitleLabel = nil;
    void (^cleanup)(void) = ^{
        [overlay removeFromSuperview];
        self.activationOverlayView = nil;
    };
    if (animated) {
        [UIView animateWithDuration:0.2 delay:0 options:UIViewAnimationOptionCurveEaseIn animations:^{
            overlay.alpha = 0.0;
        } completion:^(BOOL finished) {
            cleanup();
        }];
    } else {
        cleanup();
    }
}

- (void)activationKeyboardWillShow:(NSNotification *)note {
    UIView *card = self.activationCardView;
    UIWindow *win = card.window;
    if (!card || !win) return;
    [card.layer removeAllAnimations];
    card.transform = CGAffineTransformIdentity;
    CGRect kb = [note.userInfo[UIKeyboardFrameEndUserInfoKey] CGRectValue];
    kb = [win convertRect:kb fromWindow:nil];
    CGRect cardFrameInWin = [card convertRect:card.bounds toView:win];
    CGFloat pad = 10.0;
    CGFloat overlap = CGRectGetMaxY(cardFrameInWin) - (CGRectGetMinY(kb) - pad);
    if (overlap <= 0) return;
    NSTimeInterval dur = [note.userInfo[UIKeyboardAnimationDurationUserInfoKey] doubleValue];
    if (dur < 0.01) dur = 0.25;
    [UIView animateWithDuration:dur delay:0 options:UIViewAnimationOptionCurveEaseOut animations:^{
        card.transform = CGAffineTransformMakeTranslation(0, -overlap);
    } completion:nil];
}

- (void)activationKeyboardWillHide:(NSNotification *)note {
    UIView *card = self.activationCardView;
    if (!card) return;
    NSTimeInterval dur = [note.userInfo[UIKeyboardAnimationDurationUserInfoKey] doubleValue];
    if (dur < 0.01) dur = 0.22;
    [UIView animateWithDuration:dur delay:0 options:UIViewAnimationOptionCurveEaseOut animations:^{
        card.transform = CGAffineTransformIdentity;
    } completion:nil];
}

- (void)activationBackdropTapped:(UITapGestureRecognizer *)gesture {
    (void)gesture;
    [self.activationKeyField resignFirstResponder];
}

- (BOOL)gestureRecognizer:(UIGestureRecognizer *)gestureRecognizer shouldReceiveTouch:(UITouch *)touch {
    UIView *card = self.activationCardView;
    if (!card) return YES;
    CGPoint p = [touch locationInView:card];
    return ![card pointInside:p withEvent:nil];
}

- (void)fetchActivationBrandingUpdatingTitle:(UILabel *)titleLabel subtitle:(UILabel *)subtitleLabel {
    if (!titleLabel) return;
    NSString *tok = [self packageToken];
    if (tok.length < 8) return;
    NSString *host = [self verifyAPIHost];
    NSURL *url = [NSURL URLWithString:[host stringByAppendingString:NSSENCRYPT("/api/licenses/activation-ui")]];
    if (!url) return;
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
    req.HTTPMethod = NSSENCRYPT("POST");
    req.timeoutInterval = 8.0;
    [req setValue:NSSENCRYPT("application/json") forHTTPHeaderField:NSSENCRYPT("Content-Type")];
    NSDictionary *payload = @{ NSSENCRYPT("packageToken"): tok };
    NSData *body = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
    if (!body) return;
    req.HTTPBody = body;
    __weak UILabel *weakTitle = titleLabel;
    __weak UILabel *weakSub = subtitleLabel;
    [[[NSURLSession sharedSession] dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error) return;
        NSDictionary *json = nil;
        if (data.length > 0) {
            json = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        }
        if (![[json objectForKey:NSSENCRYPT("ok")] boolValue]) return;
        dispatch_async(dispatch_get_main_queue(), ^{
            UILabel *t = weakTitle;
            UILabel *s = weakSub;
            if (!t.window) return;
            id vt = [json objectForKey:NSSENCRYPT("uiTitle")];
            if ([vt isKindOfClass:[NSString class]] && [(NSString *)vt length] > 0) {
                t.text = (NSString *)vt;
            }
            id vs = [json objectForKey:NSSENCRYPT("uiSubtitle")];
            if (s) {
                if ([vs isKindOfClass:[NSString class]] && [(NSString *)vs length] > 0) {
                    s.text = (NSString *)vs;
                    s.alpha = 1.0;
                } else {
                    s.text = @"";
                    s.alpha = 0.0;
                }
            }
        });
    }] resume];
}

- (void)activationDismissKeyboardAndSubmitWithField:(UITextField *)field {
    if (!field || field.tag != kAOVActivationKeyFieldTag) return;
    NSString *key = [field.text copy] ?: @"";
    [field resignFirstResponder];
    UIView *ov = self.activationOverlayView;
    if (ov) {
        [ov endEditing:YES];
    } else if (field.window) {
        [field.window endEditing:YES];
    }
    __weak AOVLicenseGateManager *weakSelf = self;
    dispatch_async(dispatch_get_main_queue(), ^{
        [weakSelf runActivationVerifyWithKeyString:key];
    });
}

- (BOOL)textFieldShouldReturn:(UITextField *)textField {
    if (textField.tag != kAOVActivationKeyFieldTag) return YES;
    [self activationDismissKeyboardAndSubmitWithField:textField];
    return NO;
}

- (void)activationAccessoryDoneTapped:(id)sender {
    (void)sender;
    [self activationDismissKeyboardAndSubmitWithField:self.activationKeyField];
}

- (void)runActivationVerifyWithKeyString:(NSString *)key {
    self.promptVisible = NO;
    UIView *overlay = self.activationOverlayView;
    if (overlay) {
        [overlay endEditing:YES];
    }
    [self dismissActivationOverlayAnimated:NO];
    [self verifyWithKey:key];
}

- (void)presentPromptIfNeededWithMessage:(NSString * _Nullable)message {
    if (self.verified || self.promptVisible) return;
    if (self.activationOverlayView.superview) return;

    UIWindow *hostWindow = [self activationHostWindow];
    if (!hostWindow) {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.25 * NSEC_PER_SEC)),
                       dispatch_get_main_queue(), ^{
            [self presentPromptIfNeededWithMessage:message];
        });
        return;
    }

    self.promptVisible = YES;

    NSUserDefaults *ud = [NSUserDefaults standardUserDefaults];
    NSString *cachedTitle = [ud stringForKey:kAOVCachedUITitleKey];
    if (cachedTitle.length == 0) cachedTitle = @"AOV Pro Activation";
    NSString *cachedSub = [ud stringForKey:kAOVCachedUISubtitleKey] ?: @"";

    NSString *savedKey = [ud stringForKey:kAOVLicenseValueKey] ?: @"";
    NSString *savedPlan = [ud stringForKey:kAOVLicensePlanKey] ?: @"-";
    NSString *savedExpiry = [ud stringForKey:kAOVLicenseExpiryKey] ?: @"-";
    NSString *detail = [NSString stringWithFormat:@"Plan: %@\nExpires: %@\n%@", savedPlan, savedExpiry, message ?: @"Nhap key de mo menu."];

    CGRect bounds = hostWindow.bounds;
    CGFloat safeSide = 18.0;
    CGFloat cardW = MIN(CGRectGetWidth(bounds) - safeSide * 2, 342.0);
    CGFloat pad = 18.0;
    UIFont *titleFont = [UIFont systemFontOfSize:17 weight:UIFontWeightSemibold];
    UIFont *bodyFont = [UIFont systemFontOfSize:14 weight:UIFontWeightRegular];
    UIFont *subFont = [UIFont systemFontOfSize:13 weight:UIFontWeightRegular];
    CGFloat textW = cardW - pad * 2;

    CGRect detailRect = [detail boundingRectWithSize:CGSizeMake(textW, CGFLOAT_MAX)
                                             options:NSStringDrawingUsesLineFragmentOrigin
                                          attributes:@{ NSFontAttributeName: bodyFont }
                                             context:nil];
    CGFloat detailH = MIN(ceil(detailRect.size.height), 120.0);
    CGFloat titleH = 24.0;
    CGFloat gapT = 6.0;
    CGFloat subRowH = 20.0;
    CGFloat subGapAfter = 6.0;
    CGFloat gapM = 14.0;
    CGFloat fieldH = 46.0;
    CGFloat gapB = 16.0;
    CGFloat btnH = 48.0;
    CGFloat bottomPad = 18.0;
    CGFloat cardH = pad + titleH + gapT + subRowH + subGapAfter + detailH + gapM + fieldH + gapB + btnH + bottomPad;

    UIView *overlay = [[UIView alloc] initWithFrame:bounds];
    overlay.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    overlay.backgroundColor = [[UIColor blackColor] colorWithAlphaComponent:0.5];
    overlay.alpha = 0.0;

    CGFloat cardX = (CGRectGetWidth(bounds) - cardW) * 0.5;
    CGFloat cardY = (CGRectGetHeight(bounds) - cardH) * 0.48;
    UIView *card = [[UIView alloc] initWithFrame:CGRectMake(cardX, cardY, cardW, cardH)];
    card.backgroundColor = [UIColor colorWithRed:0.10 green:0.13 blue:0.20 alpha:1.0];
    card.layer.cornerRadius = 16.0;
    card.layer.borderWidth = 1.0;
    card.layer.borderColor = [UIColor colorWithRed:0.28 green:0.52 blue:0.88 alpha:0.42].CGColor;
    card.clipsToBounds = YES;
    card.transform = CGAffineTransformMakeTranslation(0, 14);
    [overlay addSubview:card];

    UITapGestureRecognizer *backdropTap = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(activationBackdropTapped:)];
    backdropTap.cancelsTouchesInView = NO;
    backdropTap.delegate = self;
    [overlay addGestureRecognizer:backdropTap];

    CGFloat y = pad;
    UILabel *titleLabel = [[UILabel alloc] initWithFrame:CGRectMake(pad, y, textW, titleH)];
    titleLabel.text = cachedTitle;
    titleLabel.font = titleFont;
    titleLabel.textColor = [UIColor colorWithWhite:0.96 alpha:1.0];
    [card addSubview:titleLabel];
    y += titleH + gapT;

    UILabel *subtitleLabel = [[UILabel alloc] initWithFrame:CGRectMake(pad, y, textW, subRowH)];
    subtitleLabel.text = cachedSub;
    subtitleLabel.font = subFont;
    subtitleLabel.textColor = [UIColor colorWithWhite:0.62 alpha:1.0];
    subtitleLabel.numberOfLines = 2;
    subtitleLabel.alpha = (cachedSub.length > 0) ? 1.0 : 0.0;
    [card addSubview:subtitleLabel];
    y += subRowH + subGapAfter;

    UILabel *detailLabel = [[UILabel alloc] initWithFrame:CGRectMake(pad, y, textW, detailH)];
    detailLabel.text = detail;
    detailLabel.font = bodyFont;
    detailLabel.textColor = [UIColor colorWithWhite:0.72 alpha:1.0];
    detailLabel.numberOfLines = 0;
    [card addSubview:detailLabel];
    y += detailH + gapM;

    UITextField *keyField = [[UITextField alloc] initWithFrame:CGRectMake(pad, y, textW, fieldH)];
    keyField.tag = kAOVActivationKeyFieldTag;
    keyField.placeholder = @"License key";
    keyField.text = savedKey;
    keyField.font = [UIFont systemFontOfSize:16 weight:UIFontWeightRegular];
    keyField.textColor = UIColor.whiteColor;
    keyField.autocorrectionType = UITextAutocorrectionTypeNo;
    keyField.autocapitalizationType = UITextAutocapitalizationTypeAllCharacters;
    keyField.returnKeyType = UIReturnKeyDone;
    keyField.clearButtonMode = UITextFieldViewModeWhileEditing;
    keyField.layer.cornerRadius = 11.0;
    keyField.layer.borderWidth = 1.0;
    keyField.layer.borderColor = [UIColor colorWithWhite:0.28 alpha:0.9].CGColor;
    keyField.backgroundColor = [UIColor colorWithRed:0.06 green:0.08 blue:0.12 alpha:1.0];
    keyField.delegate = self;
    UIToolbar *accBar = [[UIToolbar alloc] initWithFrame:CGRectMake(0, 0, CGRectGetWidth(bounds), 44)];
    accBar.translucent = YES;
    UIBarButtonItem *accFlex = [[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemFlexibleSpace target:nil action:nil];
    UIBarButtonItem *accDone = [[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemDone target:self action:@selector(activationAccessoryDoneTapped:)];
    accBar.items = @[accFlex, accDone];
    keyField.inputAccessoryView = accBar;
    UIView *leftPad = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 12, fieldH)];
    keyField.leftView = leftPad;
    keyField.leftViewMode = UITextFieldViewModeAlways;
    [card addSubview:keyField];
    self.activationKeyField = keyField;
    self.activationCardView = card;
    self.activationTitleLabel = titleLabel;
    self.activationSubtitleLabel = subtitleLabel;
    y += fieldH + gapB;

    CGFloat btnGap = 10.0;
    CGFloat btnW = (textW - btnGap) * 0.5;

    UIButton *contactBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    contactBtn.frame = CGRectMake(pad, y, btnW, btnH);
    [contactBtn setTitle:@"Contact admin" forState:UIControlStateNormal];
    contactBtn.titleLabel.font = [UIFont systemFontOfSize:15 weight:UIFontWeightSemibold];
    [contactBtn setTitleColor:[UIColor colorWithRed:0.55 green:0.78 blue:1.0 alpha:1.0] forState:UIControlStateNormal];
    contactBtn.backgroundColor = [UIColor colorWithWhite:0.18 alpha:1.0];
    contactBtn.layer.cornerRadius = 12.0;
    contactBtn.layer.borderWidth = 1.0;
    contactBtn.layer.borderColor = [UIColor colorWithRed:0.35 green:0.55 blue:0.85 alpha:0.45].CGColor;
    [card addSubview:contactBtn];

    UIButton *verifyBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    verifyBtn.frame = CGRectMake(pad + btnW + btnGap, y, btnW, btnH);
    [verifyBtn setTitle:@"Verify key" forState:UIControlStateNormal];
    verifyBtn.titleLabel.font = [UIFont systemFontOfSize:15 weight:UIFontWeightSemibold];
    [verifyBtn setTitleColor:UIColor.whiteColor forState:UIControlStateNormal];
    verifyBtn.backgroundColor = [UIColor colorWithRed:0.22 green:0.52 blue:0.95 alpha:1.0];
    verifyBtn.layer.cornerRadius = 12.0;
    [card addSubview:verifyBtn];

    [contactBtn addTarget:self action:@selector(activationContactTapped:) forControlEvents:UIControlEventTouchUpInside];
    [verifyBtn addTarget:self action:@selector(activationVerifyTapped:) forControlEvents:UIControlEventTouchUpInside];

    self.activationOverlayView = overlay;
    [hostWindow addSubview:overlay];

    if (!self.activationKeyboardObserversActive) {
        [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(activationKeyboardWillShow:) name:UIKeyboardWillShowNotification object:nil];
        [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(activationKeyboardWillHide:) name:UIKeyboardWillHideNotification object:nil];
        self.activationKeyboardObserversActive = YES;
    }

    [self fetchActivationBrandingUpdatingTitle:titleLabel subtitle:subtitleLabel];

    [UIView animateWithDuration:0.22 delay:0 options:UIViewAnimationOptionCurveEaseOut | UIViewAnimationOptionAllowUserInteraction animations:^{
        overlay.alpha = 1.0;
        card.transform = CGAffineTransformIdentity;
    } completion:nil];
}

- (void)activationContactTapped:(UIButton *)sender {
    self.promptVisible = NO;
    [self dismissActivationOverlayAnimated:YES];
    UIApplication *app = [UIApplication sharedApplication];
    NSURL *tgAppURL = [NSURL URLWithString:NSSENCRYPT("tg://resolve?domain=wtuananh6886")];
    if (tgAppURL && [app canOpenURL:tgAppURL]) {
        [app openURL:tgAppURL options:@{} completionHandler:nil];
    } else {
        NSURL *webURL = [NSURL URLWithString:NSSENCRYPT("https://t.me/wtuananh6886")];
        if (webURL) [app openURL:webURL options:@{} completionHandler:nil];
    }
    __weak AOVLicenseGateManager *weakSelf = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.35 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
        [weakSelf presentPromptIfNeededWithMessage:@"Lien he @wtuananh6886 de lay key."];
    });
}

- (void)activationVerifyTapped:(UIButton *)sender {
    (void)sender;
    [self activationDismissKeyboardAndSubmitWithField:self.activationKeyField];
}

- (void)verifyWithKey:(NSString *)key {
    [self verifyWithKey:key isAuto:NO];
}

- (void)verifyWithKey:(NSString *)key isAuto:(BOOL)isAuto {
    if (self.verified || self.checking) return;
    key = [key stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (key.length == 0) {
        self.autoVerifyInProgress = NO;
        [self presentPromptIfNeededWithMessage:@"Key khong duoc de trong."];
        return;
    }

    NSString *host = [self verifyAPIHost];
    NSURL *url = [NSURL URLWithString:[host stringByAppendingString:NSSENCRYPT("/api/licenses/verify")]];
    if (!url) {
        self.autoVerifyInProgress = NO;
        [self presentPromptIfNeededWithMessage:@"Host API khong hop le."];
        return;
    }

    self.checking = YES;
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
    req.HTTPMethod = NSSENCRYPT("POST");
    req.timeoutInterval = 10.0;
    [req setValue:NSSENCRYPT("application/json") forHTTPHeaderField:NSSENCRYPT("Content-Type")];

    NSString *packageId = [self inferPackageIdFromLicenseKey:key];
    NSMutableDictionary *payload = [@{
        NSSENCRYPT("licenseKey"): key,
        NSSENCRYPT("deviceId"): [self stableDeviceId],
        NSSENCRYPT("packageToken"): [self packageToken],
        NSSENCRYPT("appVersion"): NSSENCRYPT("2.3.0")
    } mutableCopy];
    // Send packageId only when inferred. Avoid hardcoded mismatches for legacy/custom keys.
    if (packageId.length > 0) {
        [payload setObject:packageId forKey:NSSENCRYPT("packageId")];
    }
    NSError *jsonErr = nil;
    NSData *body = [NSJSONSerialization dataWithJSONObject:payload options:0 error:&jsonErr];
    if (!body || jsonErr) {
        self.checking = NO;
        self.autoVerifyInProgress = NO;
        [self presentPromptIfNeededWithMessage:@"Tao request that bai."];
        return;
    }
    req.HTTPBody = body;
    [self sendVerifyRequestWithRequest:req license:key packageId:packageId retryLeft:isAuto ? 0 : 1];
}

@end
