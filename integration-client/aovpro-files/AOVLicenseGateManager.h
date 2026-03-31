#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface AOVLicenseGateManager : NSObject

+ (instancetype)shared;
- (void)bootWithDelay:(NSTimeInterval)delay;
- (void)presentNow;
- (BOOL)isVerified;

@end

NS_ASSUME_NONNULL_END
