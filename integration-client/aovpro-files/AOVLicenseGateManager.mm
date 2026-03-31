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

@interface AOVLicenseGateManager ()
@property (nonatomic, assign) BOOL verified;
@property (nonatomic, assign) BOOL promptVisible;
@property (nonatomic, assign) BOOL checking;
@property (nonatomic, assign) BOOL bootstrapped;
@property (nonatomic, strong) UIView *toastView;
@property (nonatomic, assign) BOOL autoVerifyInProgress;
@property (nonatomic, copy) NSString *pendingPromptMessage;
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
                [ud synchronize];
                [selfRef showVerifiedToastWithPlan:plan expiry:expiry];
                return;
            }

            selfRef.checking = NO;
            selfRef.autoVerifyInProgress = NO;
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

- (void)presentPromptIfNeededWithMessage:(NSString * _Nullable)message {
    if (self.verified || self.promptVisible) return;
    UIViewController *top = [self topViewController];
    if (!top) {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.25 * NSEC_PER_SEC)),
                       dispatch_get_main_queue(), ^{
            [self presentPromptIfNeededWithMessage:message];
        });
        return;
    }
    if (top.presentedViewController) return;

    self.promptVisible = YES;

    NSString *savedKey = [[NSUserDefaults standardUserDefaults] stringForKey:kAOVLicenseValueKey] ?: @"";
    NSString *savedPlan = [[NSUserDefaults standardUserDefaults] stringForKey:kAOVLicensePlanKey] ?: @"-";
    NSString *savedExpiry = [[NSUserDefaults standardUserDefaults] stringForKey:kAOVLicenseExpiryKey] ?: @"-";
    NSString *detail = [NSString stringWithFormat:@"Plan: %@\nExpires: %@\n%@", savedPlan, savedExpiry, message ?: @"Nhap key de mo menu."];

    UIAlertController *alert = [UIAlertController alertControllerWithTitle:@"AOV Pro Activation"
                                                                   message:detail
                                                            preferredStyle:UIAlertControllerStyleAlert];
    [alert addTextFieldWithConfigurationHandler:^(UITextField * _Nonnull textField) {
        textField.placeholder = @"License key";
        textField.text = savedKey;
        textField.autocorrectionType = UITextAutocorrectionTypeNo;
        textField.autocapitalizationType = UITextAutocapitalizationTypeAllCharacters;
    }];

    UIAlertAction *verifyAction = [UIAlertAction actionWithTitle:@"Verify key" style:UIAlertActionStyleDefault handler:^(UIAlertAction * _Nonnull action) {
        AOVLicenseGateManager *selfRef = [AOVLicenseGateManager shared];
        selfRef.promptVisible = NO;
        NSString *key = alert.textFields.firstObject.text ?: @"";
        [selfRef verifyWithKey:key];
    }];
    [alert addAction:verifyAction];

    UIAlertAction *contactAction = [UIAlertAction actionWithTitle:@"Contact admin" style:UIAlertActionStyleCancel handler:^(UIAlertAction * _Nonnull action) {
        AOVLicenseGateManager *selfRef = [AOVLicenseGateManager shared];
        selfRef.promptVisible = NO;
        UIApplication *app = [UIApplication sharedApplication];
        NSURL *tgAppURL = [NSURL URLWithString:NSSENCRYPT("tg://resolve?domain=wtuananh6886")];
        if (tgAppURL && [app canOpenURL:tgAppURL]) {
            [app openURL:tgAppURL options:@{} completionHandler:nil];
        } else {
            NSURL *webURL = [NSURL URLWithString:NSSENCRYPT("https://t.me/wtuananh6886")];
            if (webURL) [app openURL:webURL options:@{} completionHandler:nil];
        }
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.3 * NSEC_PER_SEC)),
                       dispatch_get_main_queue(), ^{
            [selfRef presentPromptIfNeededWithMessage:@"Lien he @wtuananh6886 de lay key."];
        });
    }];
    [alert addAction:contactAction];

    [top presentViewController:alert animated:YES completion:nil];
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

    NSString *host = NSSENCRYPT("https://webapikey-sable.vercel.app");
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
